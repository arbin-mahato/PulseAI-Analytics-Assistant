import { z } from "zod";
import { executeSQLFromFile } from "../utilities/sql_query_executor";
import * as path from 'path';
import * as fs from 'fs';

/**
 * Tool Implementation: SQL Query Executor
 * Reads SQL queries from a JSON file and executes them against the database.
 */
export const sql_query_executor_tool = {
  implementation: async (args: { file_path: string }) => {
    try {
      const result = await executeSQLFromFile(args.file_path);
      const filePath = result.csvPath;

      // Ensure output dir exists (executeSQLFromFile already does this, but safe to check)
      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log('SQL query result file created at:', filePath);

      return {
        content: [
          {
            type: "text",
            text: `Query executed successfully.\nCSV saved at: ${filePath}\nRows: ${result.rowCount}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing SQL: ${err.message}`,
          },
        ],
      };
    }
  }
};
