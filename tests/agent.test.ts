import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTradeLabAgent, recentHistory } from "../agent/tradelab_agent";
import {
  ProviderError,
  type Provider,
  type Completion,
} from "../agent/providers/types";
import { conversation } from "../src/lib/runtime/store";
process.env.TRADELAB_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tradelab-agent-"),
);
process.env.METRIC_STORE_DB_PATH = path.resolve("data/warehouse.duckdb");
const reply = (
  text: string,
  calls: Completion["toolCalls"] = [],
): Completion => ({ text, toolCalls: calls, usage: { input: 1, output: 1 } });
test("fallback retains verified MCP results, executes each tool once and persists conversation", async () => {
  let calls = 0,
    failed = 0;
  const events: { type: string; [key: string]: unknown }[] = [];
  const providers: Provider[] = [
    {
      name: "claude",
      model: "test",
      async complete() {
        failed++;
        throw new ProviderError("claude", 401, "Rejected.");
      },
    },
    {
      name: "groq",
      model: "test",
      async complete(req) {
        calls++;
        if (calls === 1)
          return reply("", [
            { id: "schema", name: "getSchema", arguments: {} },
          ]);
        assert.equal(req.messages.at(-1)?.role, "tool");
        assert.equal(JSON.parse(req.messages.at(-1)!.content).success, true);
        return reply("The dataset is synthetic.");
      },
    },
  ];
  const result = await runTradeLabAgent(
    "Inspect the dataset",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { owner: "test-owner", providers, onEvent: (e) => events.push(e) },
  );
  assert.equal(failed, 1);
  assert.equal(calls, 2);
  assert.equal(events.filter((e) => e.type === "tool_start").length, 1);
  assert.equal(
    JSON.parse((await conversation("test-owner", result!.sessionId)).messages).length,
    2,
  );
  await assert.rejects(async () => await conversation("another-owner", result!.sessionId));
});
test("history trimming preserves whole tool groups", () => {
  const history = [
    { role: "user" as const, content: "old".repeat(100) },
    {
      role: "assistant" as const,
      content: "",
      toolCalls: [{ id: "a", name: "getSchema", arguments: {} }],
    },
    { role: "tool" as const, content: "result", toolCallId: "a" },
    { role: "user" as const, content: "new" },
  ];
  assert.deepEqual(recentHistory(history, 30), [history[3]]);
});
test("a temporary throttle falls back before executing another MCP tool", async () => {
  const providers: Provider[] = [
    {
      name: "groq",
      model: "test",
      async complete() {
        throw new ProviderError("groq", 429, "Rate limited.", 60000);
      },
    },
    {
      name: "gemini",
      model: "test",
      async complete() {
        return reply("Fallback answer.");
      },
    },
  ];
  const result = await runTradeLabAgent(
    "Hello",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { owner: "fallback-test", provider: "groq", providers },
  );
  assert.equal(result?.content, "Fallback answer.");
});
test("a request larger than a model limit fails without futile timed retries", async () => {
  let attempts = 0;
  const providers: Provider[] = [
    {
      name: "groq",
      model: "test",
      async complete() {
        attempts++;
        throw new ProviderError(
          "groq",
          429,
          "Request too large.",
          0,
          "request_too_large",
        );
      },
    },
  ];
  await assert.rejects(
    () =>
      runTradeLabAgent(
        "Long question",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { owner: "limit-test", providers },
      ),
    /Request too large/,
  );
  assert.equal(attempts, 1);
});
