import { test, expect } from "@playwright/test";
test("workspace loads, providers are visible, private files download and remain listed after refresh", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/chat");
  await expect(
    page.getByRole("combobox", { name: "AI provider" }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic demo data · INR · Saved on this server"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upload File", exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "browser-check.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("metric,value\nverified,42\n"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Upload successful!")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("browser-check.csv", { exact: true }).first(),
  ).toBeVisible();
  const list = await (await context.request.get("/api/upload")).json();
  const file = list.files.find(
    (f: { filename: string }) => f.filename === "browser-check.csv",
  );
  const response = await context.request.get(file.url);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("verified,42");
  const outsider = await context.browser()!.newContext();
  expect(
    (await outsider.request.get(new URL(file.url, page.url()).href)).status(),
  ).toBe(404);
  await outsider.close();
  expect(errors).toEqual([]);
});
test("server errors in SSE are displayed rather than silently swallowed", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(
    page.getByRole("button", { name: "Start analysis", exact: true }),
  ).toBeDisabled();
  await page.route("**/api/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"type":"error","error":"Test provider quota exhausted"}\n\n',
    }),
  );
  await page
    .getByRole("textbox", { name: "Chat message input" })
    .fill("Browser stream failure test");
  await page
    .getByRole("button", { name: "Start analysis", exact: true })
    .click();
  await expect(page.getByText("Test provider quota exhausted")).toBeVisible();
});
test("saved analysis restores its chart and renders the complete PDF in the original viewer", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await page.goto("/chat");
  await expect(
    page.getByText("Synthetic demo data · INR · Saved on this server"),
  ).toBeVisible();
  const { ownerOf } = await import("../../src/lib/runtime/auth");
  const { conversation, createRun, saveConversation } =
    await import("../../src/lib/runtime/store");
  const { connectMcp } = await import("../../mcp_servers/tradelab_mcp_server");
  const cookie = (await context.cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join(";");
  const owner = ownerOf(new Request(page.url(), { headers: { cookie } }));
  expect(owner).toBeTruthy();
  const saved = conversation(owner!),
    mcp = await connectMcp(createRun(owner!, saved.id));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await mcp.client.callTool({ name, arguments: args });
    const output = r.structuredContent as {
      success: boolean;
      error?: string;
      data: Record<string, unknown>;
      artifacts?: { id: string; url: string }[];
    };
    expect(output.success, output.error).toBe(true);
    return output;
  };
  try {
    const query = await call("sql_query_writer", {
      database: "metric_store",
      query:
        "SELECT client_id,total_volume_30d FROM financial_volume ORDER BY total_volume_30d DESC LIMIT 5",
    });
    const rows = await call("json_sql_query_executor", {
      file_path: query.data.file_path,
    });
    const recipe = await call("python_script_writer", {
      script_content:
        "from tradelab_analysis import run\nrun(" +
        JSON.stringify({
          data_file: rows.data.file_path,
          chart: "bar",
          x: "client_id",
          y: "total_volume_30d",
          title: "Verified trading volume (INR)",
        }) +
        ")",
    });
    const chart = await call("python_script_executor", {
      script_path: recipe.data.file_path,
    });
    const pdf = await call("pdfGenerator", {
      content: "Five accounts ranked using verified 30-day trading volume.",
      image_ids: [chart.artifacts![0].id],
    });
    saveConversation(
      owner!,
      saved.id,
      [],
      [
        {
          id: "fixture-user",
          type: "user",
          content: "Show a verified report",
          timestamp: new Date().toISOString(),
        },
        {
          id: "fixture-answer",
          type: "assistant",
          content: "Five verified trading accounts.",
          image: chart.artifacts![0].url,
          pdfUrl: pdf.artifacts![0].url,
          timestamp: new Date().toISOString(),
          toolStatus: "idle",
        },
      ],
      "Browser verified report",
    );
    await page.reload();
    await page
      .getByRole("combobox", { name: "Saved conversations" })
      .selectOption(saved.id);
    await expect(
      page.getByText("Five verified trading accounts.", { exact: true }),
    ).toBeVisible();
    const image = page.getByRole("img", { name: "Generated chart" });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(100);
    await page.getByTitle("View PDF", { exact: true }).click();
    await expect(page.getByText("PDF Document Viewer")).toBeVisible();
    await expect(page.locator(".react-pdf__Page__canvas")).toBeVisible({
      timeout: 15000,
    });
    await page.screenshot({ path: "test-results/verified-pdf-viewer.png" });
    await page.getByRole("button", { name: "Close PDF viewer" }).click();
    await page.reload();
    await expect(
      page.getByText("Five verified trading accounts.", { exact: true }),
    ).toBeVisible();
  } finally {
    await mcp.close();
  }
});
