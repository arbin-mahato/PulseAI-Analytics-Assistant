// agent/tradelab_agent_cli.ts
import readline from "readline";
import { runTradeLabAgent } from "./tradelab_agent";

let currentSessionId: string | undefined;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "tradelab> ",
});

console.log("TradeLab Agent CLI - Type 'exit' to quit, 'reset' to start new conversation\n");

rl.prompt();
rl.on("line", async (line) => {
  const input = line.trim();
  if (input === "exit") process.exit(0);
  if (input === "reset") {
    currentSessionId = undefined;
    console.log("✓ Session reset - starting new conversation\n");
    rl.prompt();
    return;
  }

  await runTradeLabAgent(
    input,
    currentSessionId,
    (chunk) => process.stdout.write(chunk),
    (reasoning) => console.log(`\n[Thinking] ${reasoning}`),
    (tool) => console.log(`\n[Tool] ${tool}`),
    (imagePath) => console.log(`\n[Image] ${imagePath}`),
    (sessionId) => {
      currentSessionId = sessionId;
      console.log(`\n[Session] ${sessionId}`);
    }
  );
  console.log("\n");
  rl.prompt();
});
