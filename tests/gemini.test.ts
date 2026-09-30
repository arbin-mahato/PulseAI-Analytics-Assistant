import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiProvider } from "../agent/providers/gemini";
test("Gemini retains opaque function-call parts across turns and uses native function responses", async () => {
  const parts = [
    {
      functionCall: { name: "getSchema", args: { tables: ["risk_profile"] } },
      thoughtSignature: "opaque-signature",
    },
  ];
  let body: { contents: { parts: unknown[] }[] } = { contents: [] };
  const provider = createGeminiProvider({
    apiKey: "test",
    model: "gemini-test",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      assert.equal(
        (init?.headers as Record<string, string>)["x-goog-api-key"],
        "test",
      );
      return Response.json({
        candidates: [{ content: { parts }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 4 },
      });
    },
  });
  const first = await provider.complete({
    system: "s",
    messages: [{ role: "user", content: "risk" }],
    tools: [],
  });
  assert.equal(first.toolCalls[0].name, "getSchema");
  assert.deepEqual(first.native?.parts, parts);
  await provider.complete({
    system: "s",
    messages: [
      { role: "user", content: "risk" },
      {
        role: "assistant",
        content: "",
        toolCalls: first.toolCalls,
        native: first.native,
      },
      {
        role: "tool",
        toolName: "getSchema",
        toolCallId: first.toolCalls[0].id,
        content: '{"success":true}',
      },
    ],
    tools: [],
  });
  assert.deepEqual(body.contents[1].parts, parts);
  assert.deepEqual(body.contents[2].parts, [
    { functionResponse: { name: "getSchema", response: { success: true } } },
  ]);
});
test("Gemini receives foreign-provider calls as verified transcript text, without fabricated signatures", async () => {
  let body: {
    contents: {
      parts: {
        text: string;
        functionCall?: unknown;
        functionResponse?: unknown;
      }[];
    }[];
  } = { contents: [] };
  const p = createGeminiProvider({
    apiKey: "test",
    model: "test",
    fetch: async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Done" }] }, finishReason: "STOP" },
          ],
        }),
      );
    },
  });
  await p.complete({
    system: "test",
    tools: [],
    messages: [
      { role: "user", content: "Inspect" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "groq_call", name: "getSchema", arguments: {} }],
      },
      {
        role: "tool",
        content: '{"success":true}',
        toolCallId: "groq_call",
        toolName: "getSchema",
      },
    ],
  });
  assert.ok(body.contents[1].parts[0].text.includes("getSchema"));
  assert.equal(body.contents[1].parts[0].functionCall, undefined);
  assert.ok(body.contents[2].parts[0].text.includes("Verified MCP result"));
  assert.equal(body.contents[2].parts[0].functionResponse, undefined);
});
