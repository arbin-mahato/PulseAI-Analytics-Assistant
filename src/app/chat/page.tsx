"use client";

import React, { useState, useRef, useEffect, isValidElement, type ReactNode } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readEvents } from "@/lib/client/sse";
import PromptsPanel from "@/components/PromptsPanel";
import ToolsPanel, { type ToolsPanelRef } from "@/components/ToolsPanel";
// ThinkingPanel is implemented inline below to make it easy to style & animate

import "./page.css";

// Dynamically import PdfViewer with SSR disabled
const PdfViewer = dynamic(() => import("@/components/PdfViewer"), {
  ssr: false,
});

// Define theme color
const THEME_COLOR = "#0C499C";

// Helper function to format relative time
const getRelativeTime = (timestamp: string): string => {
  try {
    const msgTime = new Date(timestamp);
    if (isNaN(msgTime.getTime())) {
      // Invalid date, show exact time from timestamp string
      return timestamp;
    }
    const now = new Date();
    const diffMs = now.getTime() - msgTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    // Fallback to showing exact time
    return new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
};

interface ThinkingStep {
  timestamp: string;
  type: "tool_start" | "tool_complete" | "reasoning" | "status" | "thinking";
  tool?: string;
  content: string;
  output?: unknown;
  startTime?: number;
  endTime?: number;
}

interface Message {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: string;
  finalAnswer?: string;
  thinkingLog?: ThinkingStep[];
  currentTool?: string;
  toolStatus?: "running" | "completed" | "idle";
  isThinkingExpanded?: boolean;
  image?: string;
  // PDF support: only set via events, never via content parsing
  pdfUrl?: string;
  // Track which message this PDF belongs to
  pdfMessageId?: string;
}

// Inline ThinkingPanel so we can control visuals & animation without changing external component files
function ThinkingPanel({
  thinkingLog = [],
  isExpanded = false,
  onToggle = () => {},
  toolStatus,
}: {
  thinkingLog?: ThinkingStep[];
  isExpanded?: boolean;
  onToggle?: () => void;
  currentTool?: string;
  toolStatus?: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // auto-scroll the thinking list as new steps arrive
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Add small delay to allow DOM to render before scrolling
    const timeoutId = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [thinkingLog.length, isExpanded]);

  // header title / subtitle logic — changed per request
  // Only show "Analysis completed" if we have thinking log entries AND toolStatus is idle (not still loading)
  const isAnalysisComplete = toolStatus === "idle" && thinkingLog.length > 0;
  const title = isAnalysisComplete ? "Analysis completed" : "Analysis progress";

  return (
    <div
      className={`transition-all duration-300 ease-out w-full ${isExpanded ? "max-h-[420px] p-3" : "max-h-12 p-1"} overflow-hidden border rounded-2xl`}
      style={{ background: "transparent", borderColor: "var(--border-light)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm bg-white/90 border border-[var(--border-light)] overflow-hidden">
            {/* use the mobile TradeLab logo */}
            <img
              src="/TradeLab Mobile logo.png"
              alt="TradeLab"
              className="w-6 h-6 object-contain"
            />
          </div>
          <div>
            <div className="text-xs font-semibold">{title}</div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-xs px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0C499C] transition-all"
          aria-label={
            isExpanded ? "Collapse analysis details" : "Expand analysis details"
          }
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div
        ref={listRef}
        className={`mt-3 transition-[opacity,transform] duration-350 ${isExpanded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"} space-y-2 overflow-y-auto max-h-64`}
      >
        {thinkingLog.length === 0 ? (
          <div className="text-xs text-slate-500">No analysis steps yet</div>
        ) : (
          <ul className="text-xs pr-2 space-y-1 w-full">
            {thinkingLog.map((step, i) => {
              let dotColor = THEME_COLOR;
              if (step.type === "tool_complete")
                dotColor = "#10B981"; // green
              else if (step.type === "tool_start")
                dotColor = "#F59E0B"; // amber
              else if (step.type === "thinking") dotColor = THEME_COLOR;

              const executionTime =
                step.startTime && step.endTime
                  ? `(${((step.endTime - step.startTime) / 1000).toFixed(1)}s)`
                  : "";

              return (
                <li key={i} className="flex items-start gap-2 py-1 w-full">
                  <div
                    className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${step.type === "thinking" ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: dotColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium">
                      {step.type.replace("_", " ").toUpperCase()}
                    </div>
                    <div className="text-[12px] text-slate-600 break-words">
                      {step.content}
                    </div>
                    {executionTime && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {executionTime}
                      </div>
                    )}
                    {Boolean(step.output) && (
                      <div className="text-[11px] text-slate-500 mt-1 bg-slate-50 p-2 rounded break-words max-h-32 overflow-y-auto">
                        {typeof step.output === "string"
                          ? step.output
                          : JSON.stringify(step.output, null, 2)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [provider, setProvider] = useState("auto");
  const [providers, setProviders] = useState<{ name: string; model: string }[]>(
    [],
  );
  const [conversations, setConversations] = useState<
    { id: string; title: string }[]
  >([]);
  const [notice, setNotice] = useState("Loading workspace…");
  const refreshConversations = async () => {
    const r = await fetch("/api/conversations");
    if (r.ok) setConversations((await r.json()).conversations);
  };
  const loadConversation = async (id: string) => {
    if (!id) return;
    const r = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`);
    if (r.ok) {
      const c = await r.json();
      setCurrentSessionId(c.id);
      setMessages(c.messages);
    } else {
      localStorage.removeItem("tradelab_session_id");
      setCurrentSessionId(null);
    }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"tools" | "prompts">("tools");

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const toolsPanelRef = useRef<ToolsPanelRef>(null);

  // Refs for scrolling
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const session = await fetch("/api/session");
        if (session.status === 401) {
          window.location.replace("/signin");
          return;
        }
        if (!session.ok) throw new Error((await session.json()).error);
        const r = await fetch("/api/status");
        const status = await r.json();
        if (!r.ok) throw new Error(status.error);
        if (!live) return;
        setProviders(status.providers);
        setNotice(
          status.dataset
            ? "Synthetic dataset · INR · Saved on this server"
            : "Dataset missing — run npm run build-db",
        );
        const saved = localStorage.getItem("tradelab_session_id");
        if (saved) await loadConversation(saved);
        await refreshConversations();
        setReady(true);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Could not load workspace.");
      }
    })();
    return () => {
      live = false;
      abortControllerRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (currentSessionId)
      localStorage.setItem("tradelab_session_id", currentSessionId);
  }, [currentSessionId]);

  // Helper to scroll latest content into view (smooth)
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const c = messagesContainerRef.current;
    if (!c) return;
    // scroll to bottom
    c.scrollTo({ top: c.scrollHeight, behavior });
  };

  useEffect(() => {
    // always keep view at bottom whenever messages change while loading/streaming
    if (isLoading) {
      scrollToBottom("smooth");
    } else {
      // final scroll when finished
      scrollToBottom("auto");
    }
  }, [messages.length, isLoading]);

  const addMessage = (type: "user" | "assistant", content: string) => {
    const message: Message = {
      id: crypto.randomUUID(),
      type,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, message]);
  };

  const handleCopyMessage = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    // Reset the copied state after 2 seconds
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleStopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleNewConversation = () => {
    if (isLoading) {
      alert(
        "Please wait for the current query to complete before starting a new conversation.",
      );
      return;
    }

    // Clear current session
    setCurrentSessionId(null);
    localStorage.removeItem("tradelab_session_id");
    setMessages([]);
    setQuery("");
    console.log("Started new conversation");
  };

  const handleDownloadFile = async (
    url: string,
    filename: string = "download",
  ) => {
    try {
      const downloadUrl = url.includes("download=")
        ? url
        : `${url}${url.includes("?") ? "&" : "?"}download=1`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("File fetch failed");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn("Direct blob download failed, falling back to anchor link:", err);
      const downloadUrl = url.includes("download=")
        ? url
        : `${url}${url.includes("?") ? "&" : "?"}download=1`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadImage = (
    src: string | Blob,
    filename: string = "image.png",
  ) => {
    const link = document.createElement("a");
    if (typeof src === "string") {
      link.href = src;
    } else {
      link.href = URL.createObjectURL(src);
    }
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendUserPrompt = async (userQuery: string) => {
    if (!userQuery.trim() || isLoading || !ready) return;
    addMessage("user", userQuery);
    setIsLoading(true);
    toolsPanelRef.current?.resetTools();
    const id = crypto.randomUUID(),
      thinkingLog: ThinkingStep[] = [];
    setMessages((prev) => [
      ...prev,
      {
        id,
        type: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        toolStatus: "running",
      },
    ]);
    const update = (patch: Partial<Message>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    let content = "",
      finished = false;
    try {
      abortControllerRef.current = new AbortController();
      const res = await fetch("/api/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userQuery,
          sessionId: currentSessionId,
          provider,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) {
        if (res.status === 401) window.location.assign("/signin");
        throw new Error((await res.json()).error || "Request failed.");
      }
      if (!res.body) throw new Error("Missing response stream.");
      for await (const data of readEvents(res.body)) {
        if (data.type === "content") {
          content += data.content;
          update({ content, finalAnswer: content });
        } else if (data.type === "session_id")
          setCurrentSessionId(data.sessionId);
        else if (data.type === "image_generated")
          update({ image: data.imagePath });
        else if (data.type === "pdf_generated")
          update({ pdfUrl: data.pdfUrl, pdfMessageId: id });
        else if (
          data.type === "thinking" ||
          data.type === "tool_start" ||
          data.type === "tool_complete"
        ) {
          const tool = data.tool;
          thinkingLog.push({
            timestamp: new Date().toISOString(),
            type: data.type,
            tool,
            content:
              data.type === "thinking"
                ? data.content
                : data.type === "tool_start"
                  ? `Running ${tool}`
                  : data.success
                    ? `${tool} completed`
                    : `${tool}: ${data.error}`,
            startTime: data.type === "tool_start" ? Date.now() : undefined,
            endTime: data.type === "tool_complete" ? Date.now() : undefined,
          });
          update({
            thinkingLog: [...thinkingLog],
            currentTool: data.type === "tool_start" ? tool : undefined,
          });
          if (tool) toolsPanelRef.current?.markToolExecuted(tool);
        } else if (data.type === "done") {
          finished = true;
          update({ toolStatus: "idle", currentTool: undefined });
        } else if (data.type === "error") throw new Error(data.error);
      }
      if (!finished)
        throw new Error(
          "Connection ended before the analysis completed. Reopen this conversation to check saved results.",
        );
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Analysis stopped."
          : error instanceof Error
            ? error.message
            : "Analysis failed.";
      update({
        content: content ? content + "\n\n" + message : message,
        toolStatus: "idle",
        currentTool: undefined,
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      await refreshConversations();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading || !ready) return;
    const userQuery = query.trim();
    setQuery("");
    await sendUserPrompt(userQuery);
  };

  // Define the prompt suggestions for the initial screen
  const promptSuggestions = [
    "Show me the top 10 users by trading volume",
    "Calculate win rates for all active traders",
    "Generate a risk profile analysis",
    "What's the average account age of profitable users?",
  ];

  return (
    <div className="flex h-screen w-screen bg-gradient-to-br from-white to-slate-50 font-['Inter',system-ui,-apple-system,'Segoe UI',Roboto] text-sm leading-6 overflow-hidden">
      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden shadow-inner">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 flex items-center relative min-h-[90px]">
          <div className="absolute left-6 top-1/2 -translate-y-1/2">
            <img
              src="/tradelab logo.png"
              alt="TradeLab"
              className="hidden sm:block w-[150px] h-10 object-contain"
            />
            <img
              src="/TradeLab Mobile logo.png"
              alt="TradeLab"
              className="block sm:hidden w-12 h-12 object-contain"
            />
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
            {messages.length > 0 && (
              <button
                onClick={handleNewConversation}
                disabled={isLoading || !ready}
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  borderColor: THEME_COLOR,
                  color: THEME_COLOR,
                  backgroundColor: "white",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.5 : 1,
                }}
                title="Start a new conversation"
              >
                + New Chat
              </button>
            )}
            <div className="text-xs text-slate-500">
              {currentSessionId ? (
                <span title={`Session: ${currentSessionId}`}>● Connected</span>
              ) : (
                <span>● New Session</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-2.5 border-b border-slate-200 bg-slate-50 text-xs text-slate-700">
          <span role="status" className="mr-auto text-slate-600 font-medium">
            {notice}
          </span>
          <label className="flex items-center gap-1.5 font-medium text-slate-700">
            <span>AI:</span>
            <select
              aria-label="AI provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={isLoading || !ready}
              className="border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-800 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-[#0C499C]"
            >
              <option value="auto" className="text-slate-800">Auto fallback</option>
              {["claude", "groq", "gemini"].map((name) => (
                <option
                  key={name}
                  value={name}
                  disabled={!providers.some((p) => p.name === name)}
                  className="text-slate-800"
                >
                  {name}
                  {providers.some((p) => p.name === name)
                    ? ""
                    : " (key needed)"}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label="Saved conversations"
            value={currentSessionId || ""}
            disabled={isLoading || !ready}
            onChange={(e) => loadConversation(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-800 text-xs max-w-56 truncate shadow-sm focus:outline-none focus:ring-1 focus:ring-[#0C499C]"
          >
            <option value="" className="text-slate-500">Saved conversations</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id} className="text-slate-800">
                {c.title}
              </option>
            ))}
          </select>
          <a
            href="/upload"
            className="text-[#0C499C] hover:text-[#093877] font-semibold underline underline-offset-2 transition-colors"
          >
            Files
          </a>
          <button
            onClick={async () => {
              await fetch("/api/session", { method: "DELETE" });
              localStorage.removeItem("tradelab_session_id");
              window.location.assign("/signin");
            }}
            className="text-slate-600 hover:text-red-600 font-semibold underline underline-offset-2 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </div>
        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          className={`flex-1 p-6 overflow-y-auto flex flex-col gap-4 ${messages.length === 0 ? "justify-center items-center p-8" : ""}`}
        >
          {messages.length === 0 ? (
            // START OF REDESIGNED INITIAL UI
            <div className="flex flex-col items-center gap-12 max-w-[800px] w-full">
              {/* Welcome Section */}
              <div className="text-center max-w-[600px] p-4">
                <h3 className="text-slate-800 mb-2 text-3xl font-bold">
                  PulseAI Analytics Assistant
                </h3>
                <p className="text-slate-500 text-lg">
                  Your data analysis starts here. What can I analyze for you
                  today?
                </p>
              </div>

              {/* Prompt Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-[700px]">
                {promptSuggestions.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setQuery(prompt)}
                    className="p-4 text-left border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between h-full hover:border-[#0C499C] hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0C499C]"
                    style={{
                      background:
                        "linear-gradient(135deg, #ffffff 0%, #f0f4ff 100%)",
                      borderColor: "inherit",
                    }}
                    aria-label={`Start analysis with prompt: ${prompt}`}
                  >
                    <p className="text-base font-medium text-slate-700">
                      {prompt}
                    </p>
                    <span className="text-xs text-slate-400 mt-2">
                      Click to start analysis →
                    </span>
                  </button>
                ))}
              </div>

              {/* Centered Input Form for Fresh Session (Slightly larger and more prominent) */}
              <div className="w-full max-w-[700px]">
                <form
                  onSubmit={handleSubmit}
                  className="flex gap-4 bg-white p-3 rounded-xl border border-gray-100 shadow-xl"
                >
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about your trading data analysis..."
                    className="flex-1 border-none rounded-lg px-4 py-4 text-base text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200"
                    onFocus={(e) => {
                      e.target.style.boxShadow = `inset 0 0 0 2px ${THEME_COLOR}`;
                      e.currentTarget.style.outline = "none";
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = query.trim()
                        ? `inset 0 0 0 2px ${THEME_COLOR}`
                        : "none";
                    }}
                    disabled={isLoading || !ready}
                    aria-label="Chat message input"
                  />
                  <button
                    type={isLoading ? "button" : "submit"}
                    onClick={isLoading ? handleStopProcessing : undefined}
                    disabled={!ready || (!isLoading && !query.trim())}
                    className="text-white px-6 py-4 rounded-lg border-none font-semibold cursor-pointer transition-all duration-200 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0C499C]"
                    style={{
                      backgroundColor: isLoading
                        ? "#EF4444"
                        : !query.trim()
                          ? "#7FA8D1"
                          : THEME_COLOR,
                      cursor:
                        !isLoading && !query.trim() ? "not-allowed" : "pointer",
                      opacity: !isLoading && !query.trim() ? 0.6 : 1,
                    }}
                    aria-label={
                      isLoading ? "Stop processing" : "Start analysis"
                    }
                  >
                    {isLoading ? "Stop" : "Start Analysis"}
                  </button>
                </form>
                <p className="text-center text-xs text-slate-400 mt-3">
                  Synthetic dataset. Answers use shared MCP analysis tools.
                </p>
              </div>
            </div>
          ) : (
            // END OF REDESIGNED INITIAL UI
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-4xl break-words mx-auto w-full ${message.type === "user" ? "self-end" : "self-start"}`}
                >
                  <div
                    className={`p-4 px-5 rounded-2xl text-sm leading-6 ${
                      message.type === "user"
                        ? "text-white rounded-br-sm ml-auto max-w-2xl w-fit shadow-md"
                        : "bg-white text-slate-800 border border-gray-100 rounded-bl-sm mr-auto max-w-full shadow-sm"
                    }`}
                    style={{
                      backgroundColor:
                        message.type === "user" ? THEME_COLOR : undefined,
                    }}
                  >
                    {message.type === "assistant" ? (
                      <>
                        {/* Thinking Panel - using our inline version so we can style it (transparent bg, animations) */}
                        {message.thinkingLog &&
                          message.thinkingLog.length > 0 && (
                            <ThinkingPanel
                              thinkingLog={message.thinkingLog}
                              isExpanded={message.isThinkingExpanded || false}
                              onToggle={() => {
                                setMessages((prev) =>
                                  prev.map((msg) =>
                                    msg.id === message.id
                                      ? {
                                          ...msg,
                                          isThinkingExpanded:
                                            !msg.isThinkingExpanded,
                                        }
                                      : msg,
                                  ),
                                );
                              }}
                              currentTool={message.currentTool}
                              toolStatus={message.toolStatus}
                            />
                          )}

                        {/* Header with tool status */}
                        {(message.toolStatus === "running" ||
                          message.toolStatus === "completed") && (
                          <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                            {message.toolStatus === "running" && (
                              <span
                                className="inline-block w-2 h-2 rounded-full animate-pulse"
                                style={{ backgroundColor: THEME_COLOR }}
                              ></span>
                            )}
                            {message.toolStatus === "completed" && (
                              <span className="text-green-500">✓</span>
                            )}
                            <span className="font-medium">
                              {message.currentTool || "Processing"}
                            </span>
                            <span className="text-slate-400">
                              {message.toolStatus === "running"
                                ? " — running"
                                : message.toolStatus === "completed"
                                  ? " — completed"
                                  : ""}
                            </span>
                          </div>
                        )}

                        {/* Final Answer */}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: ({ src, alt }) => (
                              <div className="rounded-xl overflow-hidden border border-gray-100 bg-white my-3">
                                <div className="relative">
                                  <img
                                    src={(src as string) || ""}
                                    alt={(alt as string) || "Generated chart"}
                                    className="rounded-xl w-full h-auto"
                                  />
                                  <button
                                    onClick={() =>
                                      handleDownloadImage(
                                        (src as string) || "",
                                        "chart.png",
                                      )
                                    }
                                    className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#0C499C]"
                                    title="Download image"
                                    aria-label="Download image"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="text-slate-700"
                                    >
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                      <polyline points="7 10 12 15 17 10"></polyline>
                                      <line
                                        x1="12"
                                        y1="15"
                                        x2="12"
                                        y2="3"
                                      ></line>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ),
                            h1: ({ children }) => (
                              <h1 className="font-semibold my-4 mb-2 text-slate-800 text-xl">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="font-semibold my-4 mb-2 text-slate-800 text-lg border-b border-gray-100 pb-1">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="font-semibold my-4 mb-2 text-slate-800 text-base">
                                {children}
                              </h3>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold text-slate-800">
                                {children}
                              </strong>
                            ),
                            a: ({ href, children }) => {
                              const url = href || "";
                              const isFile =
                                url.startsWith("/api/files/") ||
                                /\.(pdf|csv|png|jpe?g|json)$/i.test(url);
                              const text = String(children || "");
                              const isPdf =
                                /\.pdf$/i.test(url) || /\.pdf$/i.test(text);
                              const isCsv =
                                /\.csv$/i.test(url) || /\.csv$/i.test(text);
                              const isImage =
                                /\.(png|jpe?g)$/i.test(url) ||
                                /\.(png|jpe?g)$/i.test(text);
                              const isJson =
                                /\.json$/i.test(url) || /\.json$/i.test(text);

                              if (isFile) {
                                const filename =
                                  text || url.split("/").pop() || "download";
                                const downloadUrl = url.includes("download=")
                                  ? url
                                  : `${url}${url.includes("?") ? "&" : "?"}download=1`;

                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleDownloadFile(downloadUrl, filename);
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 my-1 mr-2 text-xs font-semibold rounded-lg shadow-sm border transition-all cursor-pointer ${
                                      isPdf
                                        ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300"
                                        : isCsv
                                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300"
                                          : isImage
                                            ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
                                            : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
                                    }`}
                                    title={`Download ${filename}`}
                                  >
                                    <span className="text-sm">
                                      {isPdf
                                        ? "📄"
                                        : isCsv
                                          ? "📊"
                                          : isImage
                                            ? "🖼️"
                                            : isJson
                                              ? "📋"
                                              : "💾"}
                                    </span>
                                    <span className="underline decoration-current/30 underline-offset-2 hover:decoration-current">
                                      {children}
                                    </span>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="opacity-75"
                                    >
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                  </button>
                                );
                              }

                              return (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline font-medium hover:text-blue-800"
                                >
                                  {children}
                                </a>
                              );
                            },
                            p: ({ children }) => {
                              const firstChild = Array.isArray(children)
                                ? children[0]
                                : children;
                              if (
                                typeof firstChild === "string" &&
                                firstChild.trim().startsWith("Downloads:")
                              ) {
                                const rawRest = Array.isArray(children)
                                  ? children
                                      .slice(1)
                                      .filter(
                                        (c) =>
                                          typeof c !== "string" ||
                                          c.trim() !== "·",
                                      )
                                  : children;
                                const restList = Array.isArray(rawRest) ? rawRest : [rawRest];
                                const seenLabels = new Set<string>();
                                const rest: ReactNode[] = [];
                                for (let i = restList.length - 1; i >= 0; i--) {
                                  const item = restList[i];
                                  if (isValidElement(item)) {
                                    const p = item.props as Record<string, unknown> | undefined;
                                    const label =
                                      typeof p?.children === "string"
                                        ? p.children
                                        : Array.isArray(p?.children)
                                          ? p.children.filter((x) => typeof x === "string").join("")
                                          : "";
                                    if (label) {
                                      if (seenLabels.has(label)) continue;
                                      seenLabels.add(label);
                                    }
                                  }
                                  rest.unshift(item);
                                }
                                return (
                                  <div className="mt-4 pt-3.5 border-t border-slate-200/80 bg-slate-50/70 rounded-xl p-3">
                                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="text-blue-600"
                                      >
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      Exported Files & Downloads
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {rest}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <p className="my-3 leading-6 first:mt-0 last:mb-0 text-slate-700">
                                  {children}
                                </p>
                              );
                            },
                            ul: ({ children }) => (
                              <ul className="my-2 pl-6">{children}</ul>
                            ),
                            li: ({ children }) => (
                              <li className="mb-1">{children}</li>
                            ),
                            pre: ({ children }) => (
                              <pre className="bg-gray-50 p-3 rounded-md overflow-x-auto font-mono text-xs border border-gray-100">
                                {children}
                              </pre>
                            ),
                            code: ({ children }) => (
                              <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[0.85rem]">
                                {children}
                              </code>
                            ),
                            table: ({ children }) => (
                              <div className="my-4 overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="w-full border-collapse text-sm">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-gray-100 border-b border-gray-300">
                                {children}
                              </thead>
                            ),
                            tbody: ({ children }) => (
                              <tbody className="divide-y divide-gray-200">
                                {children}
                              </tbody>
                            ),
                            tr: ({ children }) => (
                              <tr className="divide-x divide-gray-200">
                                {children}
                              </tr>
                            ),
                            th: ({ children }) => (
                              <th className="px-4 py-2 text-left font-semibold text-slate-800 bg-gray-100">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-4 py-2 text-slate-700">
                                {children}
                              </td>
                            ),
                          }}
                        >
                          {message.finalAnswer || message.content}
                        </ReactMarkdown>

                        {/* Message-specific Image */}
                        {message.image && (
                          <div className="rounded-xl overflow-hidden border border-gray-100 bg-white mt-3">
                            <div className="relative">
                              <img
                                src={message.image as string}
                                alt="Generated chart"
                                className="rounded-xl w-full h-auto"
                              />
                              <button
                                onClick={() =>
                                  handleDownloadImage(
                                    message.image as string,
                                    "chart.png",
                                  )
                                }
                                className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#0C499C]"
                                title="Download image"
                                aria-label="Download image"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-slate-700"
                                >
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                  <polyline points="7 10 12 15 17 10"></polyline>
                                  <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Message-specific PDF Display & On-Demand Generator */}
                        {(() => {
                          const effectivePdfUrl =
                            message.pdfUrl ||
                            (() => {
                              const match = (
                                message.finalAnswer ||
                                message.content ||
                                ""
                              ).match(
                                /\[([^\]]+\.pdf)\]\((\/api\/files\/[a-zA-Z0-9_-]+)\)/i,
                              );
                              return match ? match[2] : undefined;
                            })();

                          if (!effectivePdfUrl) {
                            const text =
                              message.finalAnswer || message.content || "";
                            const hasAnalysis =
                              message.image ||
                              text.includes("query-results") ||
                              text.includes("<table") ||
                              text.includes("|") ||
                              text.includes("financial_volume");
                            if (hasAnalysis && !isLoading) {
                              return (
                                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between">
                                  <span className="text-xs text-slate-500 font-medium">
                                    Want an executive report of these findings?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendUserPrompt(
                                        "Generate and attach a formal PDF report for this analysis with a summary and the chart.",
                                      )
                                    }
                                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700 transition-all shadow-sm cursor-pointer"
                                    title="Generate PDF Report"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                      <polyline points="14 2 14 8 20 8"></polyline>
                                      <line x1="12" y1="18" x2="12" y2="12"></line>
                                      <line x1="9" y1="15" x2="15" y2="15"></line>
                                    </svg>
                                    Generate PDF Report
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          }

                          const fileName = decodeURIComponent(
                            effectivePdfUrl.split("/").pop() || "tradelab-report.pdf",
                          ).replace(/[^a-zA-Z0-9_.-]/g, "_");

                          return (
                            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-slate-50 mt-3 p-4">
                              <div className="flex items-center gap-3">
                                {/* PDF Icon */}
                                <div className="flex-shrink-0 w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center shadow-md">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                  </svg>
                                </div>
                                {/* PDF Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-slate-800 truncate">
                                    {fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Official verified report
                                  </div>
                                </div>
                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setViewingPdf(effectivePdfUrl);
                                    }}
                                    className="px-4 py-2 text-white rounded-lg shadow-sm transition-all focus:outline-none text-sm font-medium hover:opacity-90 cursor-pointer"
                                    style={{ backgroundColor: THEME_COLOR }}
                                    title="View PDF"
                                  >
                                    <span className="flex items-center gap-2">
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle
                                          cx="12"
                                          cy="12"
                                          r="3"
                                        ></circle>
                                      </svg>
                                      View
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDownloadFile(
                                        effectivePdfUrl,
                                        fileName.endsWith(".pdf")
                                          ? fileName
                                          : `${fileName}.pdf`,
                                      )
                                    }
                                    className="px-4 py-2 rounded-lg shadow-sm transition-all focus:outline-none text-sm font-medium inline-flex items-center hover:opacity-90 cursor-pointer"
                                    style={{
                                      border: `1px solid ${THEME_COLOR}`,
                                      color: THEME_COLOR,
                                      background: "#fff",
                                    }}
                                    title="Download PDF"
                                  >
                                    <span className="flex items-center gap-2">
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line
                                          x1="12"
                                          y1="15"
                                          x2="12"
                                          y2="3"
                                        ></line>
                                      </svg>
                                      Download
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* END OF EVENT-BASED PDF RENDERING - This is the ONLY PDF rendering system */}
                      </>
                    ) : (
                      <div className="text-slate-50">{message.content}</div>
                    )}
                  </div>
                  <div
                    className={`text-xs mt-2 px-2 py-0.5 rounded-xl inline-flex items-center gap-2 font-medium tracking-wide ${
                      message.type === "user"
                        ? "text-right bg-white/10 text-white/80"
                        : "text-left bg-slate-100 text-slate-600"
                    }`}
                  >
                    {getRelativeTime(message.timestamp)}
                    {message.type === "assistant" &&
                      message.toolStatus === "idle" && (
                        <button
                          onClick={() => {
                            handleCopyMessage(
                              message.id,
                              message.finalAnswer || message.content,
                            );
                          }}
                          className={`ml-2 p-1 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0C499C] ${
                            copiedMessageId === message.id
                              ? "text-green-600"
                              : "hover:bg-slate-200 hover:text-[#0C499C]"
                          }`}
                          title={
                            copiedMessageId === message.id
                              ? "Copied!"
                              : "Copy to clipboard"
                          }
                          aria-label={
                            copiedMessageId === message.id
                              ? "Message copied"
                              : "Copy message to clipboard"
                          }
                        >
                          {copiedMessageId === message.id ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                              <rect
                                x="8"
                                y="2"
                                width="8"
                                height="4"
                                rx="1"
                                ry="1"
                              ></rect>
                            </svg>
                          )}
                        </button>
                      )}
                    {message.type === "user" && (
                      <button
                        onClick={() => {
                          handleCopyMessage(message.id, message.content);
                        }}
                        className={`ml-2 p-1 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0C499C] ${
                          copiedMessageId === message.id
                            ? message.type === "user"
                              ? "text-white/80"
                              : "text-green-600"
                            : message.type === "user"
                              ? "hover:bg-white/20 hover:text-white/90"
                              : "hover:bg-slate-200 hover:text-[#0C499C]"
                        }`}
                        title={
                          copiedMessageId === message.id
                            ? "Copied!"
                            : "Copy to clipboard"
                        }
                        aria-label={
                          copiedMessageId === message.id
                            ? "Message copied"
                            : "Copy message to clipboard"
                        }
                      >
                        {copiedMessageId === message.id ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect
                              x="8"
                              y="2"
                              width="8"
                              height="4"
                              rx="1"
                              ry="1"
                            ></rect>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="max-w-4xl break-words mx-auto w-full self-start">
                  <div className="bg-white border border-gray-100 p-4 px-5 rounded-2xl rounded-bl-sm mr-auto max-w-full shadow-sm">
                    <div className="space-y-3">
                      {/* Skeleton loading animation */}
                      <div
                        className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded animate-pulse"
                        style={{ width: "80%" }}
                      ></div>
                      <div
                        className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded animate-pulse"
                        style={{ width: "95%" }}
                      ></div>
                      <div
                        className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded animate-pulse"
                        style={{ width: "75%" }}
                      ></div>
                    </div>
                    <div className="flex gap-2 items-center mt-4">
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          backgroundColor: THEME_COLOR,
                          animationDelay: "-0.24s",
                        }}
                      ></div>
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          backgroundColor: THEME_COLOR,
                          animationDelay: "-0.12s",
                        }}
                      ></div>
                      <div
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: THEME_COLOR }}
                      ></div>
                      <div className="ml-3 text-slate-500 text-xs">
                        Streaming response...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom Input Form - Only shown when there are messages */}
        {messages.length > 0 && (
          <div className="bg-white border-t border-gray-200 p-4">
            <form
              onSubmit={handleSubmit}
              className="flex gap-3 max-w-4xl mx-auto"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about your trading data analysis..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200"
                style={{
                  borderColor: query.trim() ? THEME_COLOR : "#E5E7EB",
                  boxShadow:
                    document.activeElement?.tagName === "INPUT"
                      ? `0 0 0 3px rgba(12, 73, 156, 0.1)`
                      : "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(12, 73, 156, 0.1)`;
                  e.currentTarget.style.borderColor = THEME_COLOR;
                  e.currentTarget.style.outline = "none";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = query.trim()
                    ? `0 0 0 3px rgba(12, 73, 156, 0.1)`
                    : "none";
                  e.currentTarget.style.borderColor = query.trim()
                    ? THEME_COLOR
                    : "#E5E7EB";
                }}
                disabled={isLoading || !ready}
                aria-label="Chat message input"
              />
              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? handleStopProcessing : undefined}
                disabled={!ready || (!isLoading && !query.trim())}
                className="text-white px-4 py-2 rounded-lg border-none font-medium cursor-pointer transition-all duration-200 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0C499C]"
                style={{
                  backgroundColor: isLoading
                    ? "#EF4444"
                    : !query.trim()
                      ? "#7FA8D1"
                      : THEME_COLOR,
                  cursor:
                    !isLoading && !query.trim() ? "not-allowed" : "pointer",
                  opacity: !isLoading && !query.trim() ? 0.6 : 1,
                }}
                aria-label={isLoading ? "Stop processing" : "Send message"}
              >
                {isLoading ? "Stop" : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Collapsible Sidebar: MCP Tools & Preferences */}
      <div
        className={`bg-white border-l border-slate-200 relative transition-[width] duration-300 flex flex-col ${
          isPanelOpen
            ? "w-[360px] min-w-[360px] max-w-[360px] flex-shrink-0"
            : "w-10 min-w-10 max-w-10 flex-shrink-0"
        }`}
      >
        <button
          className="absolute top-3.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0C499C] hover:opacity-90 z-20 cursor-pointer shadow-sm"
          style={{
            backgroundColor: THEME_COLOR,
            border: `1px solid ${THEME_COLOR}`,
          }}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          aria-label={
            isPanelOpen ? "Close sidebar panel" : "Open sidebar panel"
          }
          aria-expanded={isPanelOpen}
          title={isPanelOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${isPanelOpen ? "rotate-180" : ""}`}
          >
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        {isPanelOpen ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex items-center border-b border-slate-200 px-3 pt-3 pb-2 pr-11 gap-1.5 bg-slate-50/70">
              <button
                onClick={() => setSidebarTab("tools")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sidebarTab === "tools"
                    ? "bg-white text-[#0C499C] shadow-sm border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                🛠️ MCP Tools
              </button>
              <button
                onClick={() => setSidebarTab("prompts")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sidebarTab === "prompts"
                    ? "bg-white text-[#0C499C] shadow-sm border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                ⚙️ Preferences
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto">
              <div style={{ display: sidebarTab === "tools" ? "block" : "none" }}>
                <ToolsPanel ref={toolsPanelRef} />
              </div>
              {sidebarTab === "prompts" && <PromptsPanel />}
            </div>
          </div>
        ) : (
          /* Keep ToolsPanel mounted in hidden state when collapsed so toolsPanelRef persists */
          <div className="hidden">
            <ToolsPanel ref={toolsPanelRef} />
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      {viewingPdf && (
        <>
          {console.log("Rendering PdfViewer with file:", viewingPdf)}
          <PdfViewer
            file={viewingPdf}
            onClose={() => {
              console.log("Closing PDF viewer");
              setViewingPdf(null);
            }}
          />
        </>
      )}
    </div>
  );
}
