/* get_schema.ts
   Combined schema fetcher for Metrics (local DuckDB) + ClickHouse Analytics.

   Exports an async `getSchema()` that returns:
     {
       metrics: SchemaRow[],
       analytics: SchemaRow[],        // normalized
       analytics_raw: any,            // raw ClickHouse response (whatever res.json() returned)
       fetched_at: string
     }
*/

import path from "node:path";
import { createClient } from "@clickhouse/client";
import { getDatabase, DB_PATH } from "../db"; // DuckDB instance

export type SchemaRow = {
  database: string;
  table: string;
  column_name: string;
  data_type: string | null;
  default_expression: string | null;
  comment: string | null;
};

/** Read metrics schema from the local DuckDB file (async) */
async function fetchMetricsSchema(): Promise<SchemaRow[]> {
  try {
    const db = await getDatabase();

    // Get list of tables using DuckDB's PRAGMA show_tables
    const tables = await new Promise<{ name: string }[]>((resolve, reject) => {
      db.all("PRAGMA show_tables;", (err: any, rows: any[]) => {
        if (err) {
          console.error('Error fetching tables:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });

    console.log(`Found ${tables.length} tables in database`);

    const rows: SchemaRow[] = [];

    // Get column info for each table using PRAGMA table_info
    // Process sequentially to avoid connection issues
    for (const t of tables) {
      try {
        const cols = await new Promise<any[]>((resolve, reject) => {
          db.all(`PRAGMA table_info('${t.name}');`, (err: any, rows: any[]) => {
            if (err) {
              console.error(`Error fetching columns for table ${t.name}:`, err);
              reject(err);
            } else {
              resolve(rows || []);
            }
          });
        });
        
        for (const c of cols) {
          rows.push({
            database: path.basename(DB_PATH),
            table: t.name,
            column_name: c.name,
            data_type: c.type,
            default_expression: c.dflt_value,
            comment: null,
          });
        }
      } catch (tableError) {
        console.error(`Failed to get schema for table ${t.name}:`, tableError);
        // Continue with next table instead of failing completely
        continue;
      }
    }

    console.log(`Successfully fetched schema for ${rows.length} columns across ${tables.length} tables`);
    return rows;
  } catch (error) {
    console.error("Error fetching DuckDB schema:", error);
    throw new Error(`Failed to fetch schema from DuckDB: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetch the raw ClickHouse response for the analytics schema query.
 * Returns whatever `res.json()` returns (could be an array or an object like { meta, data, rows, statistics }).
 */
async function fetchAnalyticsRaw(database?: string): Promise<any> {
  const url = process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
  if (!url) throw new Error("CLICKHOUSE_URL or CLICKHOUSE_HOST env var is required to fetch analytics schema");

  const client = createClient({
    url,
    username: process.env.CLICKHOUSE_USER || undefined,
    password: process.env.CLICKHOUSE_PASSWORD || undefined,
  });

  try {
    // const targetDb = database || process.env.CLICKHOUSE_DB;
    const q =  `
        SELECT
          database,
          table,
          name AS column_name,
          type AS data_type,
          default_expression,
          comment
        FROM system.columns
        WHERE database NOT LIKE 'system'
        ORDER BY database, table, position
      `;

    const res = await client.query({ query: q });
    const raw = await res.json(); // <- return raw shape
    return raw;
  } catch (error: any) {
    console.error("Error fetching ClickHouse (analytics) raw schema:", error);
    throw new Error(`Failed to fetch analytics schema from ClickHouse: ${error?.message || String(error)}`);
  } finally {
    try {
      // @ts-ignore
      if (client && typeof client.close === "function") await client.close();
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Helper: normalize whatever ClickHouse returned into an array of row objects
 * and then map to SchemaRow[]
 */
function normalizeAnalyticsRows(raw: any): SchemaRow[] {
  let rowsArray: Array<Record<string, any>> = [];

  if (Array.isArray(raw)) {
    rowsArray = raw as any;
  } else if (raw && typeof raw === "object") {
    if (Array.isArray(raw.data)) {
      rowsArray = raw.data;
    } else if (Array.isArray(raw.rows)) {
      // sometimes clients give rows array under 'rows'
      rowsArray = raw.rows;
    } else {
      // try to find the first array property on the object
      const candidate = Object.values(raw).find((v) => Array.isArray(v));
      if (Array.isArray(candidate)) rowsArray = candidate as any;
      else {
        // nothing usable — return empty array (caller can decide)
        console.warn("normalizeAnalyticsRows: no array found in raw response; returning []", raw);
        return [];
      }
    }
  } else {
    console.warn("normalizeAnalyticsRows: unexpected raw shape; returning []", raw);
    return [];
  }

  // Map to SchemaRow with safe null coalescing
  return rowsArray.map((r) => ({
    database: r.database ?? r.Database ?? "" + (r[0] ?? ""), // defensive
    table: r.table ?? r.Table ?? r.table_name ?? "",
    column_name: r.column_name ?? r.name ?? "",
    data_type: r.data_type ?? r.type ?? null,
    default_expression: r.default_expression ?? null,
    comment: r.comment ?? null,
  }));
}

/**
 * Combined getSchema() exported for the agent. Returns both metrics and analytics (normalized + raw).
 */
export async function getSchema(clickhouseDatabase?: string) {
  // metrics (async)
  let metrics: SchemaRow[] = [];
  try {
    metrics = await fetchMetricsSchema();
  } catch (err) {
    console.error("getSchema: failed to fetch metrics schema:", err);
    metrics = [];
  }

  // fetch analytics raw & normalize, but don't throw away the raw shape
  let analyticsRaw: any = null;
  let analytics: SchemaRow[] = [];

  try {
    analyticsRaw = await fetchAnalyticsRaw(clickhouseDatabase);
    analytics = normalizeAnalyticsRows(analyticsRaw);
  } catch (err) {
    // Soft-fail: log and keep analytics empty but preserve error in analytics_raw
    console.error("getSchema: failed to fetch analytics schema; returning metrics only. Error:", err);
    analyticsRaw = { error: String(err) };
    analytics = [];
  }

  return {
    metrics,
    analytics,
    analytics_raw: analyticsRaw,
    fetched_at: new Date().toISOString(),
  };
}

export default getSchema;
