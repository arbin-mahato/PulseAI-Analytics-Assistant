// src/types/claude-agent-sdk.d.ts
declare module '@anthropic-ai/claude-agent-sdk' {
  // ---- minimal content shapes (only what your code uses) ----
  export type TextContent = { type: 'text'; text: string };

  export type AssistantStreamEvent = {
    type: 'assistant';
    message: { content: TextContent[] };
  };

  // You can add more union members if you start handling them:
  // tool_call, tool_result, final, error, etc.
  export type QueryEvent = AssistantStreamEvent | { type: string; [k: string]: any };

  // The stream you iterate over with `for await (...)`
  export type Query = AsyncIterable<QueryEvent>;

  // The query() function that returns the stream
  export function query(input: {
    prompt: string;
    options?: {
      mcpServers?: Record<string, any>;
      allowedTools?: string[];
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
    };
  }): Query;

  // You’re also using these elsewhere:
  export function createSdkMcpServer(opts: {
    name: string;
    version: string;
    tools: any[];
  }): { name: string; version: string; tools: any[] };

  export function tool(
    name: string,
    description: string,
    schema: any,
    handler: (args: any) => Promise<any>
  ): any;
}
