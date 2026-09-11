import { getSchema as fetchSchema } from "../utilities/get_schema";

/**
 * Tool Implementation: Fetches DB schema (lightweight JSON version).
 */
export const getSchema_tool = {
  implementation: async () => {
    try {
      const clickhouseDb = process.env.CLICKHOUSE_DEFAULT_DB || undefined;
      const schemaRaw = await fetchSchema(clickhouseDb);

      // Get metrics and analytics safely
      const metrics = Array.isArray((schemaRaw as any)?.metrics) ? (schemaRaw as any).metrics : [];
      const analytics = Array.isArray((schemaRaw as any)?.analytics) ? (schemaRaw as any).analytics : [];

      // Return only essential columns: table, column_name, data_type
      const compactMetrics = metrics.map((r: any) => ({
        table: r.table,
        column: r.column_name,
        type: r.data_type
      }));

      const compactAnalytics = analytics.map((r: any) => ({
        table: r.table,
        column: r.column_name,
        type: r.data_type
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              metrics: compactMetrics,
              analytics: compactAnalytics
            }),
          },
        ],
      };
    } catch (error: any) {
      console.error("Error fetching schema:", error);
      return {
        content: [
          {
            type: "text",
            text: `Schema Error: ${error?.message ?? String(error)}`,
          },
        ],
      };
    }
  }
};
