interface ThinkingStep {
  timestamp: string;
  type: "tool_start" | "tool_complete" | "reasoning" | "status" | "thinking";
  tool?: string;
  content: string;
  output?: unknown;
}

interface ThinkingPanelProps {
  thinkingLog: ThinkingStep[];
  isExpanded: boolean;
  onToggle: () => void;
  currentTool?: string;
  toolStatus?: "running" | "completed" | "idle";
}

export default function ThinkingPanel({
  thinkingLog,
  isExpanded,
  onToggle,
}: ThinkingPanelProps) {
  if (!thinkingLog || thinkingLog.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors cursor-pointer"
      >
        <span className="text-xs">{isExpanded ? "▼" : "▶"}</span>
        <span className="font-medium">Show thinking</span>
      </button>

      {isExpanded && (
        <div className="mt-3 pl-4 border-l-2 border-gray-300 dark:border-gray-600 space-y-3 text-sm bg-gray-50 dark:bg-gray-900 p-3 rounded max-h-96 overflow-y-auto">
          {thinkingLog.map((step, index) => (
            <div key={index} className="text-gray-700 dark:text-gray-300">
              <div className="flex items-start gap-2 mb-1">
                <span className="text-gray-500 dark:text-gray-500 text-xs flex-shrink-0">
                  [{step.timestamp}]
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-200 flex-shrink-0">
                  {step.type === "tool_start" && `🔧 ${step.tool} started`}
                  {step.type === "tool_complete" && `✅ ${step.tool} completed`}
                  {step.type === "reasoning" && "🧠 Thinking"}
                  {step.type === "status" && "📌 Status"}
                  {step.type === "thinking" && "🧠 Thinking"}
                </span>
              </div>
              {step.content && (
                <div className="ml-2 text-gray-600 dark:text-gray-400 font-normal whitespace-pre-wrap leading-relaxed">
                  {step.content}
                </div>
              )}
              {Boolean(step.output) && (
                <pre className="mt-2 ml-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
