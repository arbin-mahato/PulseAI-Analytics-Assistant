import { z } from "zod";
import fs from "fs/promises";
import path from "path";

/**
 * Tool Implementation: Creates a JSON file containing an SQL query and optional database name.
 * The resulting file can be passed to `sql_query_executor` or `json_sql_query_executor`.
 */
export const sql_query_writer_tool = {
  implementation: async (args: { database: string; query: string }) => {
    try {
      const tmpDir = "/tmp";
      const timestamp = Date.now();
      const filePath = path.join(tmpDir, `query_${timestamp}.json`);

      const payload = {
        database: args.database,
        query: args.query,
      };

      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `SQL query JSON file created successfully.\nFile path: ${filePath}`,
          },
        ],
        data: {
          file_path: filePath,
        },
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating SQL query file: ${err.message}`,
          },
        ],
      };
    }
  }
};