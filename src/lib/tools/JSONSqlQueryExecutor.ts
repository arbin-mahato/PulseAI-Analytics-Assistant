import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { executeSQLToJson } from "../utilities/json_sql_query_executor";
import { getPrompt } from "../prompts";

/**
 * json_sql_query_executor
 * Input: the output of sql_query_generator (primarily its JSON file path).
 * Output: the output JSON file path, inferred JSON schema, and first 2 rows (samples).
 */
export const json_sql_query_executor_tool = tool(
  "json_sql_query_executor",
  getPrompt("json_sql_query_executor_prompt"),
  {
    // The parent agent passes the generator's output. We only require the file path,
    // but accept a structured object too for convenience.
    file_path: z
      .string()
      .optional()
      .describe("Path to JSON produced by sql_query_generator (contains { database, query })."),
    generated: z
      .object({
        filePath: z.string().describe("Path to JSON produced by sql_query_generator."),
        database: z.string().optional(),
        query: z.string().optional(),
      })
      .optional()
      .describe("Alternatively pass the full object returned by sql_query_generator."),
  },
  async (args: { file_path?: string; generated?: { filePath: string } }) => {
    try {
      const filePath = args.file_path ?? args.generated?.filePath;
      if (!filePath) {
        throw new Error("Missing file_path (or generated.filePath).");
      }

      const result = await executeSQLToJson(filePath);

      // Exactly what your spec asks to return
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  }
);
