import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const root = process.cwd(),
  build = path.join(root, ".tradelab-build"),
  runtime = path.join(build, "standalone");
if (!fs.existsSync(path.join(runtime, "server.js")))
  throw new Error("Run npm run build before npm start.");
for (const directory of ["public", "worker", "assets", "src/content"])
  fs.cpSync(path.join(root, directory), path.join(runtime, directory), {
    recursive: true,
  });
fs.cpSync(
  path.join(build, "static"),
  path.join(runtime, ".tradelab-build/static"),
  { recursive: true },
);
const python =
  process.env.PYTHON_BIN ||
  (fs.existsSync(".venv/bin/python")
    ? path.join(root, ".venv/bin/python")
    : "python3");
const child = spawn(process.execPath, [path.join(runtime, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    TRADELAB_DATA_DIR: path.resolve(process.env.TRADELAB_DATA_DIR || "data"),
    METRIC_STORE_DB_PATH: path.resolve(
      process.env.METRIC_STORE_DB_PATH ||
        path.join(process.env.TRADELAB_DATA_DIR || "data", "warehouse.duckdb"),
    ),
    PYTHON_BIN: python,
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
