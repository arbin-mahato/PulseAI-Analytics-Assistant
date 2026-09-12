import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  connectMcp,
  type ToolOutput,
} from "../mcp_servers/tradelab_mcp_server";
import { createRun } from "../src/lib/runtime/store";
import { warehousePath } from "../src/lib/runtime/config";
import { pythonJson } from "../src/lib/runtime/process";
import type { QueryResult } from "../src/lib/analytics/query";

assert.equal(
  process.env.ANALYTICS_BACKEND,
  "clickhouse",
  "Explicitly select the seeded ClickHouse demo before running this optional check.",
);
process.env.METRIC_STORE_DB_PATH = warehousePath();
process.env.TRADELAB_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tradelab-clickhouse-"),
);
const mcp = await connectMcp(createRun("integration-test", "clickhouse-test"));
const call = async (name: string, args: Record<string, unknown>) => {
  const response = await mcp.client.callTool({ name, arguments: args });
  const result = response.structuredContent as unknown as ToolOutput & {
    data: QueryResult & { file_path: string };
  };
  assert.equal(result.success, true, result.error);
  return result;
};
try {
  await call("getSchema", { tables: ["analytics.trades", "financial_volume"] });
  const tables = [
    "analytics.users",
    "analytics.orders",
    "analytics.trades",
    "analytics.events",
    "log_aggregator.logs",
  ];
  for (const table of tables) {
    const query = `SELECT count(*) AS rows FROM ${table}`;
    const local = await pythonJson<QueryResult>("query.py", {
      database_path: warehousePath(),
      query,
    });
    const written = await call("sql_query_writer", {
      database: table.split(".")[0],
      query,
    });
    const remote = await call("json_sql_query_executor", {
      file_path: written.data.file_path,
    });
    assert.equal(
      Number(remote.data.rows[0].rows),
      Number(local.rows[0].rows),
      table,
    );
  }
  const query =
    "SELECT count(*) AS fills, sum(t.realized_pnl) AS pnl FROM analytics.trades t INNER JOIN analytics.orders o ON t.order_id=o.order_id AND t.client_id=o.client_id";
  const local = await pythonJson<QueryResult>("query.py", {
    database_path: warehousePath(),
    query,
  });
  const written = await call("sql_query_writer", {
    database: "analytics",
    query,
  });
  const remote = await call("json_sql_query_executor", {
    file_path: written.data.file_path,
  });
  assert.equal(Number(remote.data.rows[0].fills), Number(local.rows[0].fills));
  assert.ok(
    Math.abs(Number(remote.data.rows[0].pnl) - Number(local.rows[0].pnl)) <
      0.01,
  );
  const metric = await call("sql_query_writer", {
    database: "metric_store",
    query: "SELECT count(*) AS users FROM financial_volume",
  });
  const result = await call("json_sql_query_executor", {
    file_path: metric.data.file_path,
  });
  assert.ok(Number(result.data.rows[0].users) > 0);
  console.log(
    "ClickHouse matches all five raw tables and joined fill/PnL totals; local metrics still query through MCP.",
  );
} finally {
  await mcp.close();
}
