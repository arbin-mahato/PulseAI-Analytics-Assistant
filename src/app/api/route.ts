// app/api/chat/route.ts
import { NextRequest } from "next/server";
import { runTradeLabAgent } from "../../../agent/tradelab_agent";

export async function POST(req: NextRequest) {
  const { query: userQuery, sessionId: existingSessionId } = await req.json();
  if (!userQuery) return new Response("Missing query", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      
      // Helper function to safely enqueue data
      const safeEnqueue = (data: Uint8Array) => {
        if (!isClosed) {
          try {
            controller.enqueue(data);
          } catch (err) {
            console.error('Failed to enqueue data:', err);
            isClosed = true;
          }
        }
      };
      
      try {
        await runTradeLabAgent(
          userQuery,
          existingSessionId,
          // onText: Final answer only
          (chunk) => {
            // Check for PDF events in content
            if (chunk.includes('PDF_EVENT:')) {
              console.log('🔍 PDF_EVENT detected in chunk:', chunk.substring(0, 200));
              // Use character-by-character parsing to handle nested JSON correctly
              const eventStartIdx = chunk.indexOf('PDF_EVENT:');
              if (eventStartIdx >= 0) {
                const jsonStartIdx = chunk.indexOf('{', eventStartIdx);
                if (jsonStartIdx >= 0) {
                  let braceCount = 0;
                  let jsonEndIdx = -1;
                  let inString = false;
                  let escapeNext = false;
                  
                  for (let i = jsonStartIdx; i < chunk.length; i++) {
                    const char = chunk[i];
                    
                    if (escapeNext) {
                      escapeNext = false;
                      continue;
                    }
                    
                    if (char === '\\') {
                      escapeNext = true;
                      continue;
                    }
                    
                    if (char === '"' && !escapeNext) {
                      inString = !inString;
                      continue;
                    }
                    
                    if (!inString) {
                      if (char === '{') braceCount++;
                      else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                          jsonEndIdx = i + 1;
                          break;
                        }
                      }
                    }
                  }
                  
                  if (jsonEndIdx > 0) {
                    const jsonStr = chunk.substring(jsonStartIdx, jsonEndIdx);
                    try {
                      const pdfEvent = JSON.parse(jsonStr);
                      console.log('✅ PDF_EVENT parsed successfully:', pdfEvent);
                      safeEnqueue(
                        encoder.encode(`data: ${JSON.stringify(pdfEvent)}\n\n`)
                      );
                      // Remove the event from content
                      chunk = chunk.substring(0, eventStartIdx) + chunk.substring(jsonEndIdx);
                      chunk = chunk.replace('PDF_EVENT:', '').trim();
                    } catch (e) {
                      console.error('❌ Failed to parse PDF event:', e, 'JSON:', jsonStr);
                    }
                  }
                }
              }
            }
            
            if (chunk) {
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ content: chunk, type: "content" })}\n\n`)
              );
            }
          },
          // onThinking: All reasoning, SQL, logs, etc.
          (reasoning) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ content: reasoning, type: "thinking" })}\n\n`)
            );
          },
          // onTool: Tool start event
          (tool) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ tool, type: "tool_start" })}\n\n`)
            );
          },
          // onImage: Image generated event
          (imagePath) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ imagePath, type: "image_generated" })}\n\n`)
            );
          },
          // onSessionId: Send session ID to client for persistence
          (sessionId) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ sessionId, type: "session_id" })}\n\n`)
            );
          }
        );
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        isClosed = true;
        controller.close();
      } catch (err: any) {
        safeEnqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`)
        );
        isClosed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
