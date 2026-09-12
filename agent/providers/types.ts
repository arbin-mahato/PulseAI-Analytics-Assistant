export type ProviderName = "claude" | "groq" | "gemini";
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};
export type AgentMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  native?: { provider: ProviderName; parts: unknown[] };
};
export type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};
export type CompletionRequest = {
  system: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
};
export type Completion = {
  text: string;
  toolCalls: ToolCall[];
  native?: AgentMessage["native"];
  usage: { input: number; output: number };
  finishReason?: string;
};
export type Provider = {
  name: ProviderName;
  model: string;
  complete: (request: CompletionRequest) => Promise<Completion>;
};
export type ProviderOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
};
export class ProviderError extends Error {
  constructor(
    public provider: ProviderName,
    public status: number,
    message: string,
    public retryAfterMs = 0,
    public code = "",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
export async function postJson(
  name: ProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: ProviderOptions,
  signal?: AbortSignal,
) {
  const response = await (options.fetch || fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.any([
      AbortSignal.timeout(45000),
      ...(signal ? [signal] : []),
    ]),
  });
  const payload = await response.json().catch(() => ({
    error: { message: "Provider returned an invalid response." },
  }));
  if (!response.ok) {
    const delay = response.headers.get("retry-after");
    const seconds = delay ? Number(delay) : 0;
    const wait = Number.isFinite(seconds)
      ? seconds * 1000
      : Math.max(0, Date.parse(delay || "") - Date.now());
    // API error bodies may contain account identifiers. Keep public errors concise.
    const tooLarge = String(payload.error?.message || "").includes(
      "Request too large",
    );
    const code = tooLarge
      ? "request_too_large"
      : String(payload.error?.message || "").includes(
            "Model called python tool which was not enabled",
          )
        ? "unsupported_builtin_python"
        : typeof payload.error?.code === "string"
          ? payload.error.code
          : "";
    if (process.env.TRADELAB_DEBUG_PROVIDER === "true") {
      let diagnostic = String(payload.error?.message || "").slice(0, 2000);
      for (const [key, value] of Object.entries(process.env))
        if (/KEY|SECRET|PASSWORD|TOKEN/.test(key) && value && value.length > 6)
          diagnostic = diagnostic.replaceAll(value, "[redacted]");
      diagnostic = diagnostic.replace(/org_[a-zA-Z0-9_-]+/g, "[account]");
      console.error(
        JSON.stringify({
          provider: name,
          status: response.status,
          code,
          diagnostic,
          remaining: response.headers.get("x-ratelimit-remaining-tokens"),
          reset: response.headers.get("x-ratelimit-reset-tokens"),
        }),
      );
    }
    const message =
      code === "request_too_large"
        ? "This request exceeds the model token budget. Start a new conversation or ask for a smaller analysis."
        : code === "unsupported_builtin_python"
          ? "This model attempted an unavailable hosted tool. Choose another model or provider."
          : code === "tool_use_failed"
            ? "Model produced an invalid tool call."
            : code === "context_length_exceeded"
              ? "The conversation exceeds the model context limit."
              : response.status === 429
                ? "Rate limit reached."
                : response.status === 401 || response.status === 403
                  ? "Provider credentials were rejected."
                  : response.status === 400
                    ? "Provider rejected the model request."
                    : response.status === 404
                      ? "Selected model is unavailable."
                      : "Provider request failed.";
    throw new ProviderError(
      name,
      response.status,
      message,
      Math.min(wait || 0, 60000),
      code,
    );
  }
  return payload;
}
export function argumentsObject(input: unknown): Record<string, unknown> {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Model returned invalid tool arguments.");
  return value as Record<string, unknown>;
}
