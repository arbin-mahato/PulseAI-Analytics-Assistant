import {
  runTradeLabAgent,
  type AgentEvent,
} from "../../../agent/tradelab_agent";
import {
  requireOwner,
  checkOrigin,
  httpError,
  jsonBody,
  rateLimit,
  HttpError,
} from "@/lib/runtime/auth";
import { conversation, stateDb } from "@/lib/runtime/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const owner = requireOwner(req);
    rateLimit(`chat:${owner}`, 12);
    const body = await jsonBody(req);
    if (
      typeof body.query !== "string" ||
      !body.query.trim() ||
      body.query.length > 8000
    )
      throw new HttpError(400, "Enter a question up to 8,000 characters.");
    if (
      body.provider &&
      !["auto", "claude", "groq", "gemini"].includes(body.provider)
    )
      throw new HttpError(400, "Unknown provider.");
    if (body.sessionId) conversation(owner, body.sessionId);
    const busy = stateDb()
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE busy_until>?")
      .get(Date.now());
    if (Number(busy?.n) >= 1)
      throw new HttpError(429, "The server is busy. Please retry shortly.");
    const abort = new AbortController(),
      signal = AbortSignal.any([req.signal, abort.signal]),
      encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const emit = (event: AgentEvent) => {
          if (!closed) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              closed = true;
              abort.abort();
            }
          }
        };
        const heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15000);
        try {
          await runTradeLabAgent(
            body.query,
            body.sessionId || undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { owner, provider: body.provider, signal, onEvent: emit },
          );
          emit({ type: "done" });
        } catch (e) {
          emit({
            type: "error",
            error: e instanceof Error ? e.message : "Analysis failed.",
          });
        } finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {}
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return httpError(e);
  }
}
