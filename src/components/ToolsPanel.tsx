import React, { useState, useImperativeHandle, forwardRef } from 'react';

interface ThinkingLog {
  type: 'thinking' | 'tool_start' | 'tool_complete';
  text: string;
  timestamp: string;
  tool?: string;
}

interface ToolState {
  executed: boolean;
}

export interface ToolsPanelRef {
  markToolExecuted: (toolKey: string) => void;
  resetTools: () => void;
  appendThinking: (text: string) => void;
  getThinkingLog: () => ThinkingLog[];
}

const toolsData: Record<string, { name: string; description: string; icon: string }> = {
  getSchema: {
    name: 'Get Schema',
    description: 'Inspect tables, columns, and data types',
    icon: '🔍',
  },
  sql_query_writer: {
    name: 'SQL Query Writer',
    description: 'Validate and save structured SQL queries',
    icon: '✍️',
  },
  sql_query_executor: {
    name: 'SQL Query Executor',
    description: 'Execute SQL queries and export CSV downloads',
    icon: '📊',
  },
  json_sql_query_executor: {
    name: 'JSON SQL Executor',
    description: 'Execute SQL queries and return JSON rows',
    icon: '📋',
  },
  python_script_writer: {
    name: 'Python Script Writer',
    description: 'Generate safe pandas & matplotlib chart recipes',
    icon: '🐍',
  },
  python_script_executor: {
    name: 'Python Script Executor',
    description: 'Securely render and save chart artifacts',
    icon: '📈',
  },
  pdfGenerator: {
    name: 'PDF Report Generator',
    description: 'Compile findings, charts, and tables into PDF',
    icon: '📄',
  },
};

const initializeToolStates = () => {
  return Object.keys(toolsData).reduce((acc, key) => {
    acc[key] = { executed: false };
    return acc;
  }, {} as Record<string, ToolState>);
};

const ToolsPanel = forwardRef<ToolsPanelRef>((props, ref) => {
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>(initializeToolStates());
  const [thinkingLog, setThinkingLog] = useState<ThinkingLog[]>([]);

  useImperativeHandle(ref, () => ({
    markToolExecuted: (toolKey: string) => {
      // Handle legacy or mapped aliases
      const normalizedKey = toolKey === 'sql_query_creator' ? 'sql_query_writer' : toolKey;
      setToolStates((prev) => ({
        ...prev,
        [normalizedKey]: { executed: true },
      }));
    },
    resetTools: () => {
      setToolStates(initializeToolStates());
      setThinkingLog([]);
    },
    appendThinking: (text: string) => {
      const newLog: ThinkingLog = {
        type: 'thinking',
        text,
        timestamp: new Date().toLocaleTimeString(),
      };
      setThinkingLog((prev) => [...prev, newLog]);
    },
    getThinkingLog: () => {
      return thinkingLog;
    },
  }));

  return (
    <div className="space-y-4 p-4 text-slate-800">
      <div>
        <h3 className="text-lg font-bold text-slate-900">MCP Tools</h3>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Standard Model Context Protocol tools available to the assistant during analytical workflows.
        </p>
      </div>

      <div className="space-y-2">
        {Object.entries(toolsData).map(([key, tool]) => {
          const isExecuted = toolStates[key]?.executed;
          return (
            <div
              key={key}
              className={`flex items-start justify-between p-2.5 rounded-lg border transition-all ${
                isExecuted
                  ? 'bg-emerald-50/70 border-emerald-300 shadow-sm'
                  : 'bg-white border-slate-200 hover:bg-slate-50/80'
              }`}
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <span className="text-base select-none mt-0.5">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-semibold text-xs text-slate-900 leading-snug">{tool.name}</h4>
                    {isExecuted && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{tool.description}</p>
                </div>
              </div>
              <div className="ml-2 flex-shrink-0 pt-0.5">
                {isExecuted ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full border border-slate-300 bg-slate-100"></span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ToolsPanel.displayName = 'ToolsPanel';

export default ToolsPanel;