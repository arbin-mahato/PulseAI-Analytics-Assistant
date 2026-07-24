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

const toolsData = {
  getSchema: { name: 'GetSchema', description: 'Fetch database schema and documentation' },
  sql_query_creator: { name: 'SQL Query Creator', description: 'Create and save SQL queries to JSON files' },
  sql_query_executor: { name: 'SQL Query Executor', description: 'Execute SQL queries from JSON files and return CSV results' },
  json_sql_query_executor: { name: 'JSON SQL Query Executor', description: 'Execute SQL queries from JSON files and return JSON results' },
  python_script_writer: { name: 'Python Script Writer', description: 'Generate Python scripts for analysis' },
  python_script_executor: { name: 'Python Script Executor', description: 'Execute Python scripts' },
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

  React.useEffect(() => {
    console.log('ToolsPanel mounted/updated with toolStates:', toolStates);
    console.log('Thinking log:', thinkingLog);
  }, [toolStates, thinkingLog]);

  useImperativeHandle(ref, () => ({
    markToolExecuted: (toolKey: string) => {
      console.log('markToolExecuted called for:', toolKey);
      setToolStates(prev => {
        const updated = { ...prev, [toolKey]: { executed: true } };
        console.log('Updated toolStates:', updated);
        return updated;
      });
    },
    resetTools: () => {
      console.log('resetTools called');
      setToolStates(initializeToolStates());
      setThinkingLog([]);
    },
    appendThinking: (text: string) => {
      console.log('appendThinking called with:', text);
      const newLog: ThinkingLog = {
        type: 'thinking',
        text,
        timestamp: new Date().toLocaleTimeString(),
      };
      setThinkingLog(prev => [...prev, newLog]);
    },
    getThinkingLog: () => {
      return thinkingLog;
    },
  }));

  return (
    <div className="space-y-2">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Thinking Log</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto text-xs text-gray-600 space-y-1">
          {thinkingLog.length === 0 ? (
            <p className="text-gray-400">Waiting for thinking logs...</p>
          ) : (
            thinkingLog.map((log, idx) => (
              <div key={idx} className="text-xs">
                <span className="text-gray-500">[{log.timestamp}]</span> {log.text}
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Tools Used</h3>
        <div className="space-y-2">
          {Object.entries(toolsData).map(([key, tool]) => (
            <div
              key={key}
              className={`flex items-center justify-between p-3 rounded-lg border shadow-sm transition-all ${
                toolStates[key]?.executed
                  ? 'bg-green-50 border-green-400 shadow-md'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex-1">
                <h4 className="font-semibold text-sm text-gray-800">{tool.name}</h4>
                <p className="text-xs text-gray-600 mt-0.5">{tool.description}</p>
              </div>
              <div className="ml-3 flex-shrink-0">
                {toolStates[key]?.executed ? (
                  <span className="text-lg">✅</span>
                ) : (
                  <span className="inline-block w-5 h-5 rounded-full border-2 border-gray-300 bg-gray-100"></span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

ToolsPanel.displayName = 'ToolsPanel';

export default ToolsPanel;