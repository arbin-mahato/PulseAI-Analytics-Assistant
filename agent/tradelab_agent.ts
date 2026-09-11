/**
 * TradeLab Agent - Groq API Edition
 * Uses OpenAI SDK with Groq API endpoint for autonomous trading analytics agent
 */

import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { groqToolDefinitions } from "@/lib/tools/groqToolDefinitions";
import { getPrompt, getPrompts } from "@/lib/prompts";
import { getSchema_tool } from "@/lib/tools/getSchema";
import { sql_query_executor_tool } from "@/lib/tools/sqlQueryExecutor";
import { json_sql_query_executor_tool } from "@/lib/tools/JSONSqlQueryExecutor";
import { python_script_executor_tool } from "@/lib/tools/pythonScriptExecutor";
import { sql_query_writer_tool } from "@/lib/tools/sqlQueryWriter";
import { python_script_writer_tool } from "@/lib/tools/PythonScriptWriter";
import { pdfGenerator_tool } from "@/lib/tools/pdfGeneratorTool";

let TRADELAB_SYSTEM_PROMPT = getPrompt("tradelab_system_prompt");
const prompts = getPrompts();
if (
  prompts &&
  typeof prompts.additional_instructions === "string" &&
  prompts.additional_instructions.trim().length > 0
) {
  TRADELAB_SYSTEM_PROMPT = TRADELAB_SYSTEM_PROMPT + "\n\n" + prompts.additional_instructions;
}

/**
 * In-memory session store (in production, use database)
 */
const sessionStore = new Map<string, ChatCompletionMessageParam[]>();

/**
 * Execute tool with arguments
 */
async function executeTool(toolName: string, toolArgs: Record<string, any>): Promise<string> {
  try {
    let result;

    switch (toolName) {
      case "getSchema":
        result = await (getSchema_tool.implementation as any)();
        return result.content?.[0]?.text || JSON.stringify(result);

      case "sql_query_writer":
        result = await (sql_query_writer_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      case "sql_query_executor":
        result = await (sql_query_executor_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      case "json_sql_query_executor":
        result = await (json_sql_query_executor_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      case "python_script_writer":
        result = await (python_script_writer_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      case "python_script_executor":
        result = await (python_script_executor_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      case "pdfGenerator":
        result = await (pdfGenerator_tool.implementation as any)(toolArgs);
        return result.content?.[0]?.text || JSON.stringify(result);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    console.error(`[tool] Error executing ${toolName}:`, error);
    return JSON.stringify({ error: error.message, tool: toolName, success: false });
  }
}

/**
 * Initialize Groq client via OpenAI SDK
 */
function initializeGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable");
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

/**
 * Generate session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load session history from memory
 */
function loadSessionHistory(sessionId: string): ChatCompletionMessageParam[] {
  return sessionStore.get(sessionId) || [];
}

/**
 * Save session history to memory
 */
function saveSessionHistory(sessionId: string, history: ChatCompletionMessageParam[]) {
  sessionStore.set(sessionId, history);
}

/**
 * Main agent loop - handles tool calling and response processing
 */
async function runAgentLoop(
  client: OpenAI,
  conversationHistory: ChatCompletionMessageParam[],
  callbacks: {
    onText: (text: string) => void;
    onThinking: (text: string) => void;
    onTool: (tool: string) => void;
    onImage: (path: string) => void;
  }
): Promise<void> {
  let continueLoop = true;
  const generatedAssets = { images: new Set<string>(), pdfs: new Set<string>() };

  while (continueLoop) {
    try {
      // Call Groq API with tools
      console.log("[agent] Calling Groq API...");
      const response = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: TRADELAB_SYSTEM_PROMPT,
          },
          ...conversationHistory,
        ],
        tools: groqToolDefinitions,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 2048,
      });

      const choice = response.choices[0];

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // Add assistant message with tool calls to history
        conversationHistory.push({
          role: "assistant",
          content: choice.message.content,
          tool_calls: choice.message.tool_calls,
        });

        // Process each tool call
        const toolResults: ChatCompletionMessageParam[] = [];

        for (const toolCall of choice.message.tool_calls || []) {
          const toolName = (toolCall as any).function.name;
          const toolArgs = JSON.parse((toolCall as any).function.arguments);

          console.log(`[tool] Executing: ${toolName}`);
          callbacks.onTool(toolName);

          try {
            const toolResult = await executeTool(toolName, toolArgs);
            console.log(`[tool] Completed: ${toolName}`);

            // Extract actual URLs from tool results
            try {
              const urlMatches = toolResult.match(/\/api\/files\/(images|pdfs)\/[^\s"']+/g);
              if (urlMatches) {
                urlMatches.forEach(url => {
                  if (url.includes('/images/')) {
                    generatedAssets.images.add(url);
                    callbacks.onImage(url);
                  } else if (url.includes('/pdfs/')) {
                    generatedAssets.pdfs.add(url);
                  }
                });
              }
            } catch (e) {
              // URL extraction failed, continue
            }

            // Truncate large results to max 2000 chars to prevent token bloat
            const truncatedResult = toolResult.length > 2000 
              ? toolResult.substring(0, 2000) + "...[truncated]" 
              : toolResult;

            // Add tool result to history
            toolResults.push({
              role: "tool",
              tool_call_id: (toolCall as any).id,
              content: truncatedResult,
            });

            // Check for image URLs in tool response
            if (toolResult.includes('"imageUrl"')) {
              try {
                const jsonMatch = toolResult.match(/\{[^}]*"imageUrl"[^}]*\}/);
                if (jsonMatch) {
                  const data = JSON.parse(jsonMatch[0]);
                  if (data.imageUrl) {
                    callbacks.onImage(data.imageUrl);
                    generatedAssets.images.add(data.imageUrl);
                  }
                }
              } catch (e) {
                // Invalid JSON in response
              }
            }
          } catch (error: any) {
            console.error(`[tool] Error executing ${toolName}:`, error);
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: error.message, success: false }),
            });
          }
        }

        // Add all tool results to history
        conversationHistory.push(...toolResults);

        // Continue loop to get model's response
        continueLoop = true;
      } else {
        // No more tool calls - we have final response
        let finalResponse = choice.message.content || "";

        // Append actual generated asset URLs to final response
        if (generatedAssets.images.size > 0 || generatedAssets.pdfs.size > 0) {
          const assetsList: string[] = [];
          if (generatedAssets.images.size > 0) {
            assetsList.push(`**Generated images:** ${Array.from(generatedAssets.images).join(", ")}`);
          }
          if (generatedAssets.pdfs.size > 0) {
            assetsList.push(`**Generated PDFs:** ${Array.from(generatedAssets.pdfs).join(", ")}`);
          }
          finalResponse += "\n\n" + assetsList.join("\n");
        }

        if (finalResponse) {
          callbacks.onText(finalResponse);
        }

        // Add final response to history
        conversationHistory.push({
          role: "assistant",
          content: finalResponse,
        });

        continueLoop = false;
      }
    } catch (error: any) {
      console.error("[agent] Error in agent loop:", error);

      if (error.status === 429) {
        callbacks.onText("Rate limited - please try again in a moment.");
      } else if (error.status === 401) {
        callbacks.onText("Authentication failed - check your GROQ_API_KEY.");
      } else {
        callbacks.onText(`Error: ${error.message}`);
      }

      continueLoop = false;
    }
  }
}

/**
 * Main export - run the TradeLab agent
 */
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
  const startTime = Date.now();

  try {
    // Initialize Groq client
    const client = initializeGroq();

    // Initialize or load session
    const sessionId = existingSessionId || generateSessionId();
    let conversationHistory = loadSessionHistory(sessionId);
    console.log(`[session] ${sessionId} loaded with ${conversationHistory.length} messages`);

    onSessionId?.(sessionId);

    // Add user query to history
    conversationHistory.push({
      role: "user",
      content: userQuery,
    });

    // Run agent loop
    let finalResult = "";
    await runAgentLoop(client, conversationHistory, {
      onText: (text) => {
        onText(text);
        finalResult = text;
      },
      onThinking,
      onTool: onTool || (() => {}),
      onImage: onImage || (() => {}),
    });

    // Save session
    saveSessionHistory(sessionId, conversationHistory);

    // Calculate metrics
    const duration = Date.now() - startTime;
    const numTurns = conversationHistory.length;

    // Notify completion
    const completionInfo = {
      sessionId,
      duration,
      numTurns,
      totalCost: 0, // Groq is free!
      finalResult,
    };

    console.log("[agent] Complete:", completionInfo);
    onComplete?.(completionInfo);
  } catch (error: any) {
    console.error("[agent] Fatal error:", error);
    onText(`Fatal error: ${error.message}`);
  }
}
