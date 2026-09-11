import { z } from "zod";
import { executeSQLToJson } from "../utilities/json_sql_query_executor";

/**
 * Tool Implementation: json_sql_query_executor
 * Input: the output of sql_query_generator (primarily its JSON file path).
 * Output: file path, row count, and first sample row (compact format to save tokens).
 */
export const json_sql_query_executor_tool = {
  implementation: async (args: { file_path?: string; generated?: { filePath: string } }) => {
    try {
      const filePath = args.file_path ?? args.generated?.filePath;
      if (!filePath) {
        throw new Error("Missing file_path (or generated.filePath).");
      }

      const result = await executeSQLToJson(filePath);

      // Return only summary + 1 sample row (not full results)
      const summary = {
        output_json_file_path: result.output_json_file_path,
        row_count: result.row_count,
        json_schema: result.json_schema,
        first_sample: result.sample_first_two?.[0] || null,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  }
};
