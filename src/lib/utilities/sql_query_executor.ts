// src/lib/utilities/sql_query_executor.ts
import fs from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../db";
import { stringify } from "csv-stringify/sync";
import { queryClickHouseRows } from "./clickhouse_query";

/**
 * Executes a SQL query defined in a JSON file and returns the result written as CSV.
 * The JSON file must contain: { "database": "...", "query": "..." , "params"?: any }
 *
 * Routing:
 *  - database === 'analytics' || 'log_aggregator' -> ClickHouse
 *  - otherwise -> local DuckDB (metric_store)
 */
export async function executeSQLFromFile(filePath: string): Promise<{ csvPath: string; rowCount: number }> {
  try {
    // Resolve and read file
    const absolutePath = path.resolve(filePath);
    const fileContent = await fs.readFile(absolutePath, "utf8");
    const parsed = JSON.parse(fileContent);
    const database: string = parsed.database;
    const query: string = parsed.query;
    const params = parsed.params;

    if (!query || typeof query !== "string") {
      throw new Error("Invalid JSON file: must contain a 'query' string.");
    }

    // Choose executor based on database name
    let rows: Array<Record<string, any>> = [];

    if (database === "analytics" || database === "log_aggregator") {
      // ClickHouse path
      rows = await queryClickHouseRows(query, database);
    } else {
      // DuckDB path (metric_store)
      rows = await runDuckDBQuery(query, params);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn("Query returned no data.");
      // Still write an empty CSV with headers if possible (headers unknown) - return empty result
      const emptyCsvPath = path.join(process.cwd(), "output", `${database}_query_result_${Date.now()}.csv`);
      await fs.mkdir(path.dirname(emptyCsvPath), { recursive: true });
      await fs.writeFile(emptyCsvPath, "", "utf8");
      return { csvPath: emptyCsvPath, rowCount: 0 };
    }

    // Convert to CSV
    const csv = stringify(rows, { header: true });
    const csvPath = path.join(process.cwd(), "output", `${database}_query_result_${Date.now()}.csv`);

    await fs.mkdir(path.dirname(csvPath), { recursive: true });
    await fs.writeFile(csvPath, csv, "utf8");

    console.log(`CSV file saved at: ${csvPath}`);

    return {
      csvPath,
      rowCount: rows.length,
    };
  } catch (error: any) {
    console.error("Error executing SQL query:", error);
    throw new Error(`Failed to execute SQL from ${filePath}: ${error.message}`);
  }
}

/** Helper: run query against local DuckDB and return rows */
async function runDuckDBQuery(query: string, params?: any): Promise<Array<Record<string, any>>> {
  const db = await getDatabase();
  
  let data: any[] = [];
  
  await new Promise<void>((resolve, reject) => {
    const paramArray = params ? Object.values(params) : [];
    db.all(query, ...paramArray, (err: any, rows: any[]) => {
      if (err) {
        console.error('DuckDB query error:', err);
        reject(err);
      } else {
        data = rows || [];
        resolve();
      }
    });
  });

  // Ensure array of objects
  return Array.isArray(data) ? data : [];
}

