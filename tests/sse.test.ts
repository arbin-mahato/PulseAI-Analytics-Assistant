import test from "node:test";
import assert from "node:assert/strict";
import { readEvents } from "../src/lib/client/sse";
test("SSE handles arbitrary byte boundaries including UTF-8 currency and multiple events", async () => {
  const input = new TextEncoder().encode(
    'data: {"type":"content","content":"₹100"}\n\ndata: {"type":"done"}\n\n',
  );
  const body = new ReadableStream({
    start(c) {
      for (const b of input) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const events = [];
  for await (const event of readEvents(body)) events.push(event);
  assert.deepEqual(events, [
    { type: "content", content: "₹100" },
    { type: "done" },
  ]);
});
