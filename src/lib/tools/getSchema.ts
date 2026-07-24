import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getSchema as fetchSchema } from "../utilities/get_schema";
import { getPrompt } from "../prompts";
import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Claude MCP Tool — Fetches DB schema and Markdown docs together.
 * Now supports combined metrics (sqlite) + analytics (ClickHouse).
 */
export const getSchema_tool = tool(
  "getSchema",
  getPrompt("getSchema_prompt"),
  {},
  async () => {
    try {
      // Path to Markdown file
      const mdPath = path.join(process.cwd(), "src", "content", "db", "description.md");

      // Optionally pass a ClickHouse DB name (fallback to env var if present)
      const clickhouseDb = process.env.CLICKHOUSE_DEFAULT_DB || undefined;

      // Run DB query + file read in parallel
      const [schemaRaw, markdown] = await Promise.all([
        // fetchSchema returns { metrics: SchemaRow[], analytics: SchemaRow[], fetched_at }
        fetchSchema(clickhouseDb),
        readFile(mdPath, "utf8"),
      ]);

      // Defensive normalization in case of unexpected shapes
      const schema = {
        metrics: Array.isArray((schemaRaw as any)?.metrics) ? (schemaRaw as any).metrics : [],
        analytics: Array.isArray((schemaRaw as any)?.analytics) ? (schemaRaw as any).analytics : [],
        fetched_at: (schemaRaw as any)?.fetched_at ?? new Date().toISOString(),
      };

      // Return both schema & markdown (JSON string as before)
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                schema,
                description: markdown,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error fetching schema:", error);

      // Soft-fail: return an empty schema and the error message in the description
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                schema: {
                  metrics: [],
                  analytics: [],
                  fetched_at: new Date().toISOString(),
                },
                description: `Error fetching schema: ${error?.message ?? String(error)}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);
