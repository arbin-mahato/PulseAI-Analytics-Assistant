// clickhouse_query.ts
import { createClient } from "@clickhouse/client";

export type Row = Record<string, any>;

export async function queryClickHouseRows(query: string, database: string): Promise<Row[]> {
  const url = process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
  if (!url) throw new Error("CLICKHOUSE_URL or CLICKHOUSE_HOST env var is required to query ClickHouse");

  const client = createClient({
    url,
    username: process.env.CLICKHOUSE_USER || undefined,
    password: process.env.CLICKHOUSE_PASSWORD || undefined,
    database,
  });

  try {
    const res = await client.query({
      query,
      format: "JSONEachRow",
    });

    const raw = await res.json();

    if (Array.isArray(raw)) return raw as Row[];

    if (raw && typeof raw === "object") {
      if (Array.isArray((raw as any).data)) return (raw as any).data as Row[];
      if (Array.isArray((raw as any).rows)) return (raw as any).rows as Row[];
      const candidate = Object.values(raw).find((v) => Array.isArray(v));
      if (Array.isArray(candidate)) return candidate as Row[];
      // coerce single object to array if needed
      if (Object.keys(raw).length > 0) return [raw as Row];
      return [];
    }

    return [];
  } catch (err: any) {
    throw new Error(`ClickHouse query failed: ${err?.message ?? String(err)}`);
  } finally {
    try {
      // @ts-ignore
      if (client && typeof client.close === "function") await client.close();
    } catch {}
  }
}
