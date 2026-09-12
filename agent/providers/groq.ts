import {
  type Provider,
  type ProviderOptions,
  postJson,
  argumentsObject,
} from "./types";
export function createGroqProvider(options: ProviderOptions): Provider {
  return {
    name: "groq",
    model: options.model,
    async complete(request) {
      const messages = [
        { role: "system", content: request.system },
        ...request.messages.map((m) => {
          if (m.role === "tool")
            return {
              role: "tool",
              tool_call_id: m.toolCallId,
              content: m.content,
            };
          return {
            role: m.role,
            content: m.content || null,
            ...(m.toolCalls?.length
              ? {
                  tool_calls: m.toolCalls.map((t) => ({
                    id: t.id,
                    type: "function",
                    function: {
                      name: t.name,
                      arguments: JSON.stringify(t.arguments),
                    },
                  })),
                }
              : {}),
          };
        }),
      ];
      const body = {
        model: options.model,
        messages,
        tools: request.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        })),
        tool_choice: "auto",
        max_completion_tokens: Math.max(
          256,
          Math.min(
            4096,
            Math.floor(
              Number(process.env.GROQ_MAX_OUTPUT_TOKENS) ||
                (options.model.includes("qwen") ? 768 : 2048),
            ),
          ),
        ),
        ...(options.model.includes("gpt-oss")
          ? { reasoning_effort: "low" }
          : { temperature: 0.1 }),
      };
      const send = (payload: unknown) =>
        postJson(
          "groq",
          "https://api.groq.com/openai/v1/chat/completions",
          { authorization: `Bearer ${options.apiKey}` },
          payload,
          options,
          request.signal,
        );
      const result = await send(body);
      const choice = result.choices?.[0];
      if (!choice?.message) throw new Error("Groq returned no completion.");
      return {
        text: choice.message.content || "",
        toolCalls: (choice.message.tool_calls || []).map(
          (t: {
            id: string;
            function: { name: string; arguments: string };
          }) => ({
            id: t.id,
            name: t.function.name,
            arguments: argumentsObject(t.function.arguments),
          }),
        ),
        usage: {
          input: result.usage?.prompt_tokens || 0,
          output: result.usage?.completion_tokens || 0,
        },
        finishReason: choice.finish_reason,
      };
    },
  };
}
