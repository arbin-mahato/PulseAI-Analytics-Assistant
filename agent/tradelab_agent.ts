import { query, Query } from "@anthropic-ai/claude-agent-sdk";
import { createMcpServer } from "../mcp_servers/tradelab_mcp_server";
import { getPrompt, getPrompts } from "@/lib/prompts";

let TRADELAB_SYSTEM_PROMPT = getPrompt("tradelab_system_prompt");
// Append any additional instructions (for example PDF behavior) if present
const prompts = getPrompts();
if (prompts && typeof prompts.additional_instructions === 'string' && prompts.additional_instructions.trim().length > 0) {
  TRADELAB_SYSTEM_PROMPT = TRADELAB_SYSTEM_PROMPT + "\n\n" + prompts.additional_instructions;
}

export async function runTradeLabAgent(
  userQuery: string,
  existingSessionId: string | undefined,
  onText: (chunk: string) => void,
  onThinking: (reasoning: string) => void,
  onTool?: (tool: string) => void,
  onImage?: (imagePath: string) => void,
  onSessionId?: (sessionId: string) => void,
  onComplete?: (result: {
    sessionId: string;
    duration: number;
    numTurns: number;
    totalCost: number;
    finalResult: string;
  }) => void
) {
  let isStreamActive = true;
  
  // Wrap callbacks to check if stream is still active
  const safeOnText = (chunk: string) => {
    if (isStreamActive) {
      onText(chunk);
    }
  };
  
  const safeOnThinking = (reasoning: string) => {
    if (isStreamActive) {
      onThinking(reasoning);
    }
  };
  
  const safeOnTool = (tool: string) => {
    if (isStreamActive && onTool) {
      onTool(tool);
    }
  };
  
  const safeOnImage = (imagePath: string) => {
    if (isStreamActive && onImage) {
      onImage(imagePath);
    }
  };
  
  const safeOnSessionId = (sessionId: string) => {
    if (isStreamActive && onSessionId) {
      onSessionId(sessionId);
    }
  };
  
  // Create a fresh MCP server instance for this request
  // This enables concurrent requests without blocking each other
  const mcpServerInstance = createMcpServer();
  
  // Track current sessionId
  let currentSessionId = existingSessionId || '';
  
  const systemPrompt = TRADELAB_SYSTEM_PROMPT;
  
  const stream: Query = query({
    prompt: `User Query: ${userQuery}`,
    options: {
      ...(existingSessionId ? { resume: existingSessionId } : {}),
      mcpServers: {
        "tradelab-mcp-server": mcpServerInstance,
      },
      model: "claude-haiku-4-5",
      allowedTools: [
        "mcp__tradelab-mcp-server__getSchema",
        "mcp__tradelab-mcp-server__sql_query_writer",
        "mcp__tradelab-mcp-server__sql_query_executor",
        "mcp__tradelab-mcp-server__json_sql_query_executor",
        "mcp__tradelab-mcp-server__python_script_executor",
        "mcp__tradelab-mcp-server__python_script_writer",
        "mcp__tradelab-mcp-server__pdfGenerator",
      ],
      systemPrompt,
    },
  });



  // PDF and image detection now happens entirely through tool response parsing
  // No global callbacks needed - prevents cross-request contamination

  try {
    for await (const message of stream) {
      if (message.type === "system" && message.subtype === "init") {
        currentSessionId = message.session_id;
        console.log(`[session] active: ${currentSessionId}`);
        safeOnSessionId(currentSessionId);
      }

      if (message.type === "user") {
        // Tool results come as user messages
        for (const part of message.message?.content || []) {
          if (part.type === 'tool_result') {
            for (const contentItem of part.content || []) {
              if (contentItem.type === 'text' && contentItem.text) {
                const text = contentItem.text;
                
                // Find JSON with file URLs
                const jsonMatch = text.match(/\{[^}]*"success"\s*:\s*true[^}]*\}/);
                if (jsonMatch) {
                  try {
                    const data = JSON.parse(jsonMatch[0]);
                    
                    if (data.imageUrl) {
                      const sessionId = currentSessionId || existingSessionId;
                      const rewrittenUrl = sessionId ? 
                        data.imageUrl.replace(/temp_\d+/, sessionId) : 
                        data.imageUrl;
                      console.log('✅ Image from tool:', rewrittenUrl);
                      safeOnImage(rewrittenUrl);
                    }
                    
                    if (data.pdfUrl) {
                      const sessionId = currentSessionId || existingSessionId;
                      const rewrittenUrl = sessionId ? 
                        data.pdfUrl.replace(/temp_\d+/, sessionId) : 
                        data.pdfUrl;
                      console.log('✅ PDF from tool:', rewrittenUrl);
                      safeOnText(`PDF_EVENT:${JSON.stringify({ type: 'pdf_generated', pdfUrl: rewrittenUrl })}`);
                    }
                  } catch (e) {
                    // Invalid JSON
                  }
                }
              }
            }
          }
        }
      }
      
      if (message.type === "assistant") {
         for (const part of message.message.content) {
          if (part.type === "text") {
            const text = part.text;
            
            // Extract thinking content from <thinking> tags
            const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
            let match;
            let processedText = text;
            
            while ((match = thinkingRegex.exec(text)) !== null) {
              const thinkingContent = match[1].trim();
              if (thinkingContent) {
                safeOnThinking(thinkingContent);
              }
              processedText = processedText.replace(match[0], '');
            }
            
            const finalText = processedText.trim();
            if (finalText) {
              safeOnText(finalText);
            }
          }
          if (part.type === "tool_use") {
            safeOnTool(part.name);
          }
        }
      }

      if (message.type === "error") {
        safeOnThinking(`Error: ${message.error?.message ?? "unknown"}`);
      }
    }
  } finally {
    // Mark stream as inactive to prevent further callbacks
    isStreamActive = false;
  }
}