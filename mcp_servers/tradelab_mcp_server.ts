import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { executeQuery, schemaFor } from "../src/lib/analytics/query";
import {
  type RunContext,
  registerArtifact,
  resolveRunFile,
  stateDb,
} from "../src/lib/runtime/store";
import { pythonJson } from "../src/lib/runtime/process";
import { ensureInside, dataRoot } from "../src/lib/runtime/config";

export type ToolArtifact = {
  id: string;
  filename: string;
  url: string;
  mime: string;
  size: number;
};
export type ToolOutput = {
  success: boolean;
  data?: unknown;
  artifacts?: ToolArtifact[];
  error?: string;
};
export function createMcpServer(ctx: RunContext) {
  const server = new McpServer({
    name: "tradelab-mcp-server",
    version: "2.0.0",
  });
  const wrap = async (action: () => Promise<Omit<ToolOutput, "success">>) => {
    let output: ToolOutput;
    try {
      ctx.signal?.throwIfAborted();
      output = { success: true, ...(await action()) };
    } catch (error) {
      output = {
        success: false,
        error: error instanceof Error ? error.message : "Tool failed.",
      };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
      structuredContent: { ...output },
      isError: !output.success,
    };
  };
  const generated = (extension: string) =>
    path.join(ctx.directory, `${randomUUID()}.${extension}`);
  const database = z.enum(["metric_store", "analytics", "log_aggregator"]);
  server.registerTool(
    "getSchema",
    {
      description:
        'Discover the database tables and dataset provenance. Pass exact table names, for example {"tables":["financial_volume"]}, to retrieve columns, types and metric definitions. Call before constructing SQL.',
      inputSchema: { tables: z.array(z.string()).max(4).optional() },
    },
    (args) =>
      wrap(async () => ({ data: await schemaFor(args.tables, ctx.signal) })),
  );
  server.registerTool(
    "sql_query_writer",
    {
      description:
        "Write one read-only SQL query to a JSON file for an execution tool. Use discovered columns and explicit database. All metrics and raw tables are available; money is INR and rates are fractions.",
      inputSchema: { database, query: z.string().min(1).max(20000) },
    },
    (args) =>
      wrap(async () => {
        await pythonJson(
          "query.py",
          {
            action: "validate",
            query: args.query,
            dialect:
              args.database !== "metric_store" &&
              process.env.ANALYTICS_BACKEND === "clickhouse"
                ? "clickhouse"
                : "duckdb",
          },
          ctx.signal,
        );
        const file_path = generated("query.json");
        await fs.writeFile(file_path, JSON.stringify(args));
        return { data: { file_path } };
      }),
  );
  const execute = async (file: string, format: "csv" | "json") => {
    const input = JSON.parse(
      await fs.readFile(resolveRunFile(ctx, file), "utf8"),
    );
    const request = z
      .object({ database, query: z.string().min(1).max(20000) })
      .parse(input);
    const result = await executeQuery(
      request.database,
      request.query,
      ctx.signal,
    );
    const file_path = generated(format);
    await fs.writeFile(
      file_path,
      format === "csv"
        ? [
            result.columns.map((c) => c.name),
            ...result.rows.map((r) => result.columns.map((c) => r[c.name])),
          ]
            .map((row) =>
              row
                .map(
                  (value) =>
                    '"' + String(value ?? "").replaceAll('"', '""') + '"',
                )
                .join(","),
            )
            .join("\n")
        : JSON.stringify(result.rows),
    );
    const artifact = registerArtifact(
      ctx,
      file_path,
      `query-results.${format}`,
      format === "csv" ? "text/csv" : "application/json",
    );
    // Complete small answers remain visible to the model. Large results require aggregation or a chart recipe.
    const preview = result.rows.slice(0, 50);
    if (Buffer.byteLength(JSON.stringify(preview)) > 24000)
      throw new Error(
        "Selected rows are too wide. Select fewer columns or aggregate the result.",
      );
    return {
      data: {
        file_path,
        row_count: result.row_count,
        columns: result.columns,
        rows: preview,
        preview_complete: result.row_count <= 50,
        database: request.database,
      },
      artifacts: [artifact],
    };
  };
  server.registerTool(
    "sql_query_executor",
    {
      description:
        "Execute saved SQL and return a CSV download plus complete rows for up to 50 results. Aggregate or LIMIT if you need to answer from a larger result.",
      inputSchema: { file_path: z.string() },
    },
    (args) => wrap(() => execute(args.file_path, "csv")),
  );
  server.registerTool(
    "json_sql_query_executor",
    {
      description:
        "Execute saved SQL and return JSON rows, column types, row count and a downloadable JSON file. Complete answers up to 50 rows; larger results have an explicit preview flag.",
      inputSchema: {
        file_path: z.string().optional(),
        generated: z.object({ filePath: z.string() }).optional(),
      },
    },
    (args) =>
      wrap(() =>
        execute(args.file_path || args.generated?.filePath || "", "json"),
      ),
  );
  server.registerTool(
    "python_script_writer",
    {
      description:
        'Save a safe Python analysis recipe. Exact script format: from tradelab_analysis import run\nrun({"data_file":"<SQL result file_path>","chart":"bar","x":"client_id","y":"total_volume_30d","title":"Trading volume (INR)"}). Supported charts: bar,line,scatter,histogram,pie,box,heatmap. Optional xlabel,ylabel,color. Use SQL for calculations. Arbitrary Python, imports or filesystem commands are not accepted.',
      inputSchema: {
        script_content: z.string().min(1).max(12000),
        file_name: z.string().optional(),
      },
    },
    (args) =>
      wrap(async () => {
        await pythonJson(
          "analysis.py",
          { action: "validate", source: args.script_content },
          ctx.signal,
        );
        const file_path = generated("py");
        await fs.writeFile(file_path, args.script_content);
        return { data: { file_path } };
      }),
  );
  server.registerTool(
    "python_script_executor",
    {
      description:
        "Execute a saved validated Python recipe using the trusted pandas/matplotlib renderer. Returns a chart artifact and row count. It cannot access credentials, network, or arbitrary files.",
      inputSchema: { script_path: z.string() },
    },
    (args) =>
      wrap(async () => {
        const script = resolveRunFile(ctx, args.script_path);
        const { recipe } = await pythonJson<{ recipe: { data_file: string } }>(
          "analysis.py",
          { action: "validate", source: await fs.readFile(script, "utf8") },
          ctx.signal,
        );
        const candidate = path.resolve(ctx.directory, recipe.data_file || "");
        // Prior results in this conversation are usable, but another user's results are not.
        const prior = stateDb()
          .prepare(
            "SELECT local_path FROM artifacts WHERE local_path=? AND owner=? AND session_id=? AND mime IN (?,?)",
          )
          .get(
            candidate,
            ctx.owner,
            ctx.sessionId,
            "text/csv",
            "application/json",
          );
        if (!prior)
          throw new Error(
            "Choose a CSV/JSON result file from this conversation.",
          );
        const input = ensureInside(dataRoot(), await fs.realpath(candidate));
        const output = generated("png");
        const result = await pythonJson<{ stdout: string; row_count: number }>(
          "analysis.py",
          { action: "chart", script, data_file: input, output },
          ctx.signal,
        );
        return {
          data: result,
          artifacts: [
            registerArtifact(ctx, output, "tradelab-chart.png", "image/png"),
          ],
        };
      }),
  );
  server.registerTool(
    "pdfGenerator",
    {
      description:
        "Generate a downloadable PDF report locally from the completed analysis. Supports Markdown headings/tables and optional image artifact IDs from this conversation. No Claude key needed. Include the actual verified findings; the renderer never invents data.",
      inputSchema: {
        content: z.string().min(1).max(60000),
        filename: z.string().max(100).optional(),
        image_ids: z.array(z.string()).max(5).optional(),
      },
    },
    (args) =>
      wrap(async () => {
        const images = (args.image_ids || []).map((id) => {
          const a = stateDb()
            .prepare(
              "SELECT local_path FROM artifacts WHERE id=? AND owner=? AND session_id=? AND mime=?",
            )
            .get(id, ctx.owner, ctx.sessionId, "image/png");
          if (!a)
            throw new Error("Image is not available in this conversation.");
          return a.local_path;
        });
        const output = generated("pdf");
        await pythonJson(
          "analysis.py",
          { action: "pdf", content: args.content, output, images },
          ctx.signal,
        );
        const filename =
          (args.filename || "tradelab-report.pdf")
            .replace(/[^a-zA-Z0-9_.-]/g, "_")
            .replace(/\.pdf$/i, "") + ".pdf";
        return {
          artifacts: [
            registerArtifact(ctx, output, filename, "application/pdf"),
          ],
        };
      }),
  );
  return server;
}
export async function connectMcp(ctx: RunContext) {
  const server = createMcpServer(ctx),
    client = new Client({ name: "tradelab-agent", version: "2.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
