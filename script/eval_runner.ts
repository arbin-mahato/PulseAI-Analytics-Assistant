/** Optional live evaluation. Records actual responses and artifacts; no keyword-based success grading. */
import dotenv from "dotenv";
import fs from "node:fs/promises";
import { runTradeLabAgent } from "../agent/tradelab_agent";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const entries = JSON.parse(await fs.readFile("eval.json", "utf8")) as {
  id: string;
  query: string;
  expect?: string;
}[];
await fs.mkdir("eval_outputs", { recursive: true });
for (const entry of entries.slice(0, Number(process.env.EVAL_LIMIT || 3))) {
  let output: unknown;
  try {
    output = {
      id: entry.id,
      result: await runTradeLabAgent(
        entry.query,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { owner: "evaluation" },
      ),
      review:
        "Compare the answer against independently calculated SQL and original expectations.",
    };
  } catch (error) {
    output = {
      id: entry.id,
      error: error instanceof Error ? error.message : "Failed",
    };
  }
  await fs.writeFile(
    `eval_outputs/${entry.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`,
    JSON.stringify(output, null, 2),
  );
  console.log("Recorded evaluation:", entry.id);
}
