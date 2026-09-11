import fs from "node:fs";
import { spawnSync } from "node:child_process";
function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status) process.exit(r.status);
}
if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error("Use Node.js 24 or newer.");
if (!fs.existsSync(".env.local")) fs.copyFileSync(".env.example", ".env.local");
if (!fs.existsSync(".venv"))
  run(process.env.PYTHON_SETUP_BIN || "python3", ["-m", "venv", ".venv"]);
const python =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
run(python, ["-m", "pip", "install", "-r", "requirements.txt"]);
if (
  !fs.existsSync(
    process.env.METRIC_STORE_DB_PATH ||
      `${process.env.TRADELAB_DATA_DIR || "data"}/warehouse.duckdb`,
  )
)
  run("node", ["script/build_db.js"]);
console.log(
  "Setup complete. Add an API key to .env.local, then run npm run dev.",
);
