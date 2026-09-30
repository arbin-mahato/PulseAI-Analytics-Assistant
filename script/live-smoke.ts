import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const { runTradeLabAgent } = await import("../agent/tradelab_agent");
const customQuery = process.argv.slice(2).join(" ");
const query =
  customQuery ||
  "Show the top 5 users by total_volume_30d with amounts in INR. Create a bar chart and a PDF report containing the table and chart.";
const events: unknown[] = [];
let text = "";
try {
  const result = await runTradeLabAgent(
    query,
    undefined,
    (c) => {
      text += c;
    },
    (s) => console.log(s),
    (t) => console.log("MCP:", t),
    undefined,
    undefined,
    {
      owner: "live-smoke",
      provider: process.env.SMOKE_PROVIDER || "auto",
      onEvent: (e) => events.push(e),
    },
  );
  assert.ok(result?.content.trim(), "The provider did not return an answer.");
  if (!customQuery) {
    for (const mime of ["application/json", "image/png", "application/pdf"])
      assert.ok(
        result.artifacts.some((artifact) => artifact.mime === mime),
        `The default analysis did not produce ${mime}.`,
      );
  }
  fs.mkdirSync("eval_outputs", { recursive: true });
  fs.writeFileSync(
    path.resolve("eval_outputs/live-smoke.json"),
    JSON.stringify({ result, events }, null, 2),
  );
  console.log(text);
  console.log("Saved eval_outputs/live-smoke.json");
} catch (e) {
  console.error(e instanceof Error ? e.message : "Live test failed");
  process.exitCode = 1;
}
