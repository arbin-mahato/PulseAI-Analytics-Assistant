import path from "node:path";
import fs from "node:fs";

function canonicalPath(value: string): string {
  const absolute = path.resolve(value);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  const parent = path.dirname(absolute);
  return parent === absolute
    ? absolute
    : path.join(canonicalPath(parent), path.basename(absolute));
}
export function dataRoot() {
  return canonicalPath(
    process.env.TRADELAB_DATA_DIR || path.join(process.cwd(), "data"),
  );
}
export function warehousePath() {
  return path.resolve(
    process.env.METRIC_STORE_DB_PATH ||
      path.join(dataRoot(), "warehouse.duckdb"),
  );
}
export function pythonBin() {
  return (
    process.env.PYTHON_BIN ||
    (fs.existsSync(path.join(process.cwd(), ".venv/bin/python"))
      ? path.join(process.cwd(), ".venv/bin/python")
      : "python3")
  );
}
export function boundedNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value);
  return value && Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : fallback;
}
export function ensureInside(root: string, candidate: string) {
  const resolved = canonicalPath(candidate);
  const relative = path.relative(canonicalPath(root), resolved);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error("Path is outside the permitted workspace.");
  return resolved;
}
