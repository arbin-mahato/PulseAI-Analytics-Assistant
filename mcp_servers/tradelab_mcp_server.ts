import {createSdkMcpServer} from "@anthropic-ai/claude-agent-sdk";
import {getSchema_tool} from "../src/lib/tools/getSchema";
import {sql_query_executor_tool} from "../src/lib/tools/sqlQueryExecutor";
import {json_sql_query_executor_tool} from "../src/lib/tools/JSONSqlQueryExecutor";
import { python_script_executor_tool } from "../src/lib/tools/pythonScriptExecutor";
import { sql_query_writer_tool } from "../src/lib/tools/sqlQueryWriter";
import { python_script_writer_tool } from "../src/lib/tools/PythonScriptWriter";
import { pdfGenerator_tool } from "../src/lib/tools/pdfGeneratorTool";

/**
 * Creates a new MCP server instance for each request.
 * This ensures concurrent requests don't block each other when executing tools.
 * 
 * Previously used a singleton pattern which caused request serialization:
 * - Browser 1 with complex query → uses multiple tools → server busy
 * - Browser 2 with any query → queues behind Browser 1
 * 
 * Now each request gets its own server instance for true parallelism.
 */
export function createMcpServer() {
    return createSdkMcpServer({
        name: "tradelab-mcp-server",
        version: "1.0.0",
        tools: [
            getSchema_tool,
            sql_query_writer_tool,
            sql_query_executor_tool,
            json_sql_query_executor_tool,
            python_script_executor_tool,
            python_script_writer_tool,
            pdfGenerator_tool,
        ],
    });
}

// Legacy export for backward compatibility (deprecated)
export const mcpServer = createMcpServer();
