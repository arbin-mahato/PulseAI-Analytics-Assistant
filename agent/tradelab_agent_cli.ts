import dotenv from "dotenv";
import readline from "node:readline/promises";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const { runTradeLabAgent } = await import("./tradelab_agent");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
let sessionId: string | undefined;
console.log("TradeLab — exit to quit, reset for a new conversation.");
try {
  for (;;) {
    const question = (await rl.question("tradelab> ")).trim();
    if (question === "exit") break;
    if (question === "reset") {
      sessionId = undefined;
      continue;
    }
    if (!question) continue;
    try {
      await runTradeLabAgent(
        question,
        sessionId,
        (text) => console.log(text),
        (status) => console.log(status),
        (tool) => console.log("MCP:", tool),
        undefined,
        (id) => {
          sessionId = id;
        },
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : "Analysis failed.");
    }
  }
} finally {
  rl.close();
}
