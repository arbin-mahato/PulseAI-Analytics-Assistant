import test from "node:test";
import assert from "node:assert/strict";
import { createGroqProvider } from "../agent/providers/groq";
import { ProviderError } from "../agent/providers/types";
test("Groq maps MCP tools and retains prior tool results", async () => {
  let body: Record<string, unknown> = {};
  const provider = createGroqProvider({
    apiKey: "test",
    model: "test-model",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call2",
                  function: {
                    name: "getSchema",
                    arguments: '{"tables":["risk_profile"]}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    },
  });
  const result = await provider.complete({
    system: "system",
    messages: [
      { role: "user", content: "show risk" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call1", name: "getSchema", arguments: {} }],
      },
      {
        role: "tool",
        toolCallId: "call1",
        toolName: "getSchema",
        content: '{"success":true}',
      },
    ],
    tools: [{ name: "getSchema", inputSchema: { type: "object" } }],
  });
  assert.equal(result.toolCalls[0].name, "getSchema");
  assert.deepEqual(result.toolCalls[0].arguments, { tables: ["risk_profile"] });
  assert.equal(
    (body.messages as { tool_call_id?: string }[])[3].tool_call_id,
    "call1",
  );
  assert.equal(result.usage.input, 10);
});
test("Groq reports throttling without leaking the provider error body", async () => {
  const provider = createGroqProvider({
    apiKey: "test",
    model: "test",
    fetch: async () =>
      Response.json(
        { error: { message: "sensitive-account" } },
        { status: 429, headers: { "retry-after": "2" } },
      ),
  });
  await assert.rejects(
    () => provider.complete({ system: "s", messages: [], tools: [] }),
    (e) =>
      e instanceof ProviderError &&
      e.retryAfterMs === 2000 &&
      !e.message.includes("sensitive"),
  );
});
