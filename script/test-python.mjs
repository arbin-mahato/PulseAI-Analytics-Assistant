import fs from "node:fs";
import { spawnSync } from "node:child_process";
const python =
  process.env.PYTHON_BIN ||
  (fs.existsSync(".venv/bin/python") ? ".venv/bin/python" : "python3");
const r = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"],
  { stdio: "inherit" },
);
if (r.error) throw r.error;
process.exit(r.status || 0);
