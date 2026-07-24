import fs from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../db"; 
import { queryClickHouseRows } from "./clickhouse_query";

type Row = Record<string, any>;
type JsonSchema = Record<string, string>;

function inferType(v: any): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "number" && Number.isInteger(v)) return "integer";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "string") return "string";
  if (t === "object") return "object";
  return "unknown";
}

function inferSchema(rows: Row[]): JsonSchema {
  const schema: JsonSchema = {};
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const current = schema[key];
      const next = inferType(row[key]);
      if (!current || current === "null") schema[key] = next;
      else if (current !== next) schema[key] = "mixed";
    }
  }
  return schema;
}

/**
 * Reads a generator JSON { database, query } from file,
 * executes the SQL on the appropriate engine (ClickHouse via @clickhouse/client or DuckDB),
 * writes the **result rows** to a new .json file,
 * and returns: output file path, inferred schema, first 2 rows, total row count.
 */
export async function executeSQLToJson(jsonQueryFilePath: string) {
  const absPath = path.resolve(jsonQueryFilePath);
  const raw = await fs.readFile(absPath, "utf8");

  const parsed = JSON.parse(raw) as {
    database?: string;
    query?: string;
  };

  const { database, query } = parsed;

  if (!query || typeof query !== "string") throw new Error("Invalid input JSON: missing or invalid 'query'.");
  if (!database || typeof database !== "string") throw new Error("Invalid input JSON: missing or invalid 'database' (must be a string).");

  const db = database.trim();

  let rows: Row[] = [];

  if (db === "analytics" || db === "log_aggregator") {
    rows = await queryClickHouseRows(query, db);
  } else if (db === "metric_store") {
    // DuckDB path
    rows = await runDuckDBToJson(query);
  } else {
    // Strict: unknown DB names are rejected (caller must provide explicit db)
    throw new Error(
      `Unsupported database '${db}'. Supported values: 'metric_store', 'analytics', 'log_aggregator'.`
    );
  }

  // Ensure rows is defined
  rows = rows || [];

  // Samples & schema
  const samples = rows.slice(0, 2);
  const schema = inferSchema(samples.length ? samples : rows);

  const outDir = path.join(process.cwd(), "output");
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `${db}_result_${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");

  console.log("JSON SQL query result file created at:", filePath);

  return {
    output_json_file_path: filePath,
    json_schema: schema,
    sample_first_two: samples,
    row_count: rows.length,
  };
}

/** Helper: run query against local DuckDB and return rows */
async function runDuckDBToJson(query: string): Promise<Row[]> {
  const db = await getDatabase();
  
  let data: any[] = [];
  
  await new Promise<void>((resolve, reject) => {
    db.all(query, (err: any, rows: any[]) => {
      if (err) {
        console.error('DuckDB query error:', err);
        reject(err);
      } else {
        data = rows || [];
        resolve();
      }
    });
  });

  return Array.isArray(data) ? data : [];
}
