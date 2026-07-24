/**
 * Tradelab Agent Evaluation Runner
 * =================================
 *
 * Runs broker-style evaluations from `eval.json` against your Tradelab agent.
 * - Reads `eval.json` (project root)
 * - Calls `runTradeLabAgent(query)` for each test
 * - Captures console output
 * - Saves logs to `eval_outputs/<id>.txt`
 * - Grades each test (success/fail expectations)
 * - Counts explicit refusals as PASS for expect:"fail"
 *
 * Usage:
 *   npx tsx scripts/eval_runner.ts
 *
 * IMPORTANT:
 *   ✅ Update import path for `runTradeLabAgent` to your project structure.
 */

import fs from "fs/promises";
import path from "path";
import process from "process";
import { runTradeLabAgent } from "../agent/tradelab_agent"; // <-- update path if needed

/** ---------- Types ---------- */
type TestEntry = {
  id: string;
  query: string;
  expect: "success" | "fail";
  notes?: string;
};

/** ---------- Constants ---------- */
const EVAL_PATH = path.resolve(process.cwd(), "eval.json");
const OUT_DIR = path.resolve(process.cwd(), "eval_outputs");
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per test

/** ---------- Helpers ---------- */
async function loadTests(): Promise<TestEntry[]> {
  const raw = await fs.readFile(EVAL_PATH, "utf-8");
  return JSON.parse(raw) as TestEntry[];
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

function captureConsole() {
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;

  console.log = (...args: any[]) => {
    const msg = args.map(String).join(" ");
    logs.push(msg);
    origLog.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const msg = args.map(String).join(" ");
    logs.push(msg);
    origErr.apply(console, args);
  };

  return {
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
    getOutput: () => logs.join("\n"),
  };
}

/** ---------- Result Parsing ---------- */
// Machine-readable tags emitted by the agent
// (Section 11 of system prompt)
function parseTaggedResult(output: string) {
  const lower = output.toLowerCase();
  if (/agent[_\s-]*result\s*:\s*success/i.test(lower)) return "success";
  if (/agent[_\s-]*result\s*:\s*(refused?|decline)/i.test(lower)) return "refused";
  if (/agent[_\s-]*result\s*:\s*error/i.test(lower)) return "error";
  return null;
}

/** ---------- Evaluation Logic ---------- */
function evaluateOutput(output: string, expect: "success" | "fail"): boolean {
  const lower = output.toLowerCase();
  const tag = parseTaggedResult(lower);

  if (tag) {
    console.log(`[EVAL] Detected tag: AGENT_RESULT = ${tag}`);
    if (tag === "success") return expect === "success";
    if (tag === "refused" || tag === "error") return expect === "fail";
  }

  // Fallback heuristic detection
  const successMarkers = [
    "final answer",
    "summary of findings",
    "executive summary",
    "analysis is complete",
    "analysis report",
    "evidence",
    "sql used",
    "python analysis script",
    "script path executed",
    "script executed successfully",
    "output file",
    "csv saved at",
    "csv file saved at",
    "json result file saved",
  ];

  const refusalMarkers = [
    "i cannot",
    "i will not",
    "i refuse",
    "cannot complete this request",
    "must refuse",
    "not allowed",
    "not permitted",
    "i’m unable to",
    "unable to",
    "decline this request",
    "cannot perform",
  ];

  const errorMarkers = [
    "error",
    "failed",
    "exception",
    "timeout",
    "no such table",
    "no such column",
  ];

  const has = (tokens: string[]) => tokens.some((t) => lower.includes(t));

  const hasSuccess = has(successMarkers);
  const hasRefusal = has(refusalMarkers);
  const hasError = has(errorMarkers);

  if (expect === "success") return hasSuccess && !hasRefusal;
  return hasRefusal || hasError;
}

/** ---------- Test Runner ---------- */
async function runTest(test: TestEntry): Promise<{ passed: boolean; output: string }> {
  console.log(`\n=== Running ${test.id} (${test.expect}) ===`);

  const capt = captureConsole();
  let timedOut = false;

 const task = (async () => {
  try {
    await runTradeLabAgent(
      test.query,
      undefined, // No existing session for eval tests
      (chunk) => console.log(chunk), // capture text
      (reasoning) => console.log(`[Tool Used] ${reasoning}`),
      undefined, // onTool
      undefined, // onImage
      undefined  // onSessionId
    );
  } catch (err: any) {
    console.error(`[Agent Error] ${err?.message ?? err}`);
  }
})();


  // Timeout protection
  const race = Promise.race([
    task,
    new Promise((_, reject) =>
      setTimeout(() => {
        timedOut = true;
        reject(new Error("timeout"));
      }, TIMEOUT_MS),
    ),
  ]);

  try {
    await race;
  } catch (err: any) {
    console.error(
      timedOut
        ? `❌ Test ${test.id} timed out after ${TIMEOUT_MS / 1000}s`
        : `❌ Test ${test.id} failed: ${err?.message}`,
    );
  } finally {
    const output = capt.getOutput();
    capt.restore();

    await ensureOutDir();
    const outPath = path.join(OUT_DIR, `${test.id}.txt`);
    await fs.writeFile(outPath, output, "utf-8");

    const passed = evaluateOutput(output, test.expect);
    console.log(`=== Result ${test.id}: ${passed ? "✅ PASS" : "❌ FAIL"} ===`);
    if (!passed) console.log(`(See eval_outputs/${test.id}.txt)\n`);

    return { passed, output };
  }
}

/** ---------- Main ---------- */
async function main() {
  console.log("🔍 Starting Tradelab Agent Evaluation\n");

  const tests = await loadTests();
  console.log(`Loaded ${tests.length} tests from eval.json\n`);

  const results: { id: string; passed: boolean; expect: string }[] = [];

  for (const test of tests) {
    const { passed } = await runTest(test);
    results.push({ id: test.id, passed, expect: test.expect });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log("\n===== 🧾 EVAL SUMMARY =====");
  console.log(`Total:  ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}\n`);

  if (failedCount > 0) {
    console.log("❌ Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`- ${r.id} (expected ${r.expect}) — see eval_outputs/${r.id}.txt`));
  } else {
    console.log("✅ All tests passed!");
  }

  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal Error in eval_runner:", err);
  process.exit(2);
});
