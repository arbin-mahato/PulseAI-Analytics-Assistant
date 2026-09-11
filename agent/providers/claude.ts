import {
  type Provider,
  type ProviderOptions,
  postJson,
  argumentsObject,
} from "./types";
export function createClaudeProvider(options: ProviderOptions): Provider {
  return {
    name: "claude",
    model: options.model,
    async complete(request) {
      const messages: {
        role: "user" | "assistant";
        content: Record<string, unknown>[];
      }[] = [];
      for (const message of request.messages) {
        const role = message.role === "assistant" ? "assistant" : "user";
        const content: Record<string, unknown>[] =
          message.role === "tool"
            ? [
                {
                  type: "tool_result",
                  tool_use_id: message.toolCallId,
                  content: message.content,
                },
              ]
            : [
                ...(message.content
                  ? [{ type: "text", text: message.content }]
                  : []),
                ...(message.toolCalls || []).map((call) => ({
                  type: "tool_use",
                  id: call.id,
                  name: call.name,
                  input: call.arguments,
                })),
              ];
        if (!content.length) continue;
        if (messages.at(-1)?.role === role)
          messages.at(-1)!.content.push(...content);
        else messages.push({ role, content });
      }
      const result = await postJson(
        "claude",
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": options.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: options.model,
          system: request.system,
          max_tokens: 4096,
          messages,
          tools: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
          })),
        },
        options,
        request.signal,
      );
      const content = result.content as {
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }[];
      if (!Array.isArray(content))
        throw new Error("Claude returned no completion.");
      return {
        text: content
          .filter((p) => p.type === "text")
          .map((p) => p.text || "")
          .join("\n"),
        toolCalls: content
          .filter((p) => p.type === "tool_use")
          .map((p) => ({
            id: p.id!,
            name: p.name!,
            arguments: argumentsObject(p.input),
          })),
        usage: {
          input: result.usage?.input_tokens || 0,
          output: result.usage?.output_tokens || 0,
        },
        finishReason: result.stop_reason,
      };
    },
  };
}
