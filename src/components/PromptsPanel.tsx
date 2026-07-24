'use client';

import { useEffect, useState } from 'react';

interface Prompt {
  key: string;
  title: string;
  content: string;
}

export default function PromptsPanel() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const res = await fetch('/api/prompts');
        const data = await res.json();
        
        const promptsArray: Prompt[] = [
          {
            key: 'getSchema_prompt',
            title: 'GetSchema',
            content: data.getSchema_prompt || 'Not found',
          },
          {
            key: 'sql_query_writer_prompt',
            title: 'SQL Query Writer',
            content: data.sql_query_writer_prompt || 'Not found',
          },
          {
            key: 'sql_query_executor_prompt',
            title: 'SQL Query Executor',
            content: data.sql_query_executor_prompt || 'Not found',
          },
          {
            key: 'json_sql_query_executor_prompt',
            title: 'JSON SQL Executor',
            content: data.json_sql_query_executor_prompt || 'Not found',
          },
          {
            key: 'python_script_writer_prompt',
            title: 'Python Script Writer',
            content: data.python_script_writer_prompt || 'Not found',
          },
          {
            key: 'python_script_executor_prompt',
            title: 'Python Script Executor',
            content: data.python_script_executor_prompt || 'Not found',
          },
        ];
        
        setPrompts(promptsArray);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load prompts:', error);
        setLoading(false);
      }
    };

    loadPrompts();
  }, []);

  const handleEdit = (key: string, content: string) => {
    setEditingKey(editingKey === key ? null : key);
    setEditingContent(content);
  };

  const handleSave = async (key: string) => {
    try {
      console.log(`Saving prompt ${key}:`, editingContent);
      
      // Update backend
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editingContent }),
      });

      if (!response.ok) {
        throw new Error('Failed to save prompt');
      }

      // Update local state
      setPrompts(prompts.map(p => 
        p.key === key ? { ...p, content: editingContent } : p
      ));
      setEditingKey(null);
      setEditingContent('');
    } catch (error) {
      console.error('Failed to save prompt:', error);
      alert('Failed to save prompt. Please try again.');
    }
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditingContent('');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Loading prompts...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-50 to-white p-4">
      {/* Panel Title */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">System Prompts</h2>
        <p className="text-xs text-gray-500 mt-1">Edit system instructions for each tool</p>
      </div>

      {/* Prompts List */}
      <div className="space-y-3">
        {prompts.map((prompt) => (
          <div 
            key={prompt.key}
            className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:bg-gray-50 transition-all duration-200"
          >
            {/* Card Header - Always Visible */}
            <div className="flex items-center justify-between p-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {prompt.title}
              </h3>
              <button
                onClick={() => handleEdit(prompt.key, prompt.content)}
                className={`p-1.5 rounded-lg transition-all duration-200 ${
                  editingKey === prompt.key
                    ? 'text-gray-900 bg-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
                title="Edit prompt"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                  <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
              </button>
            </div>

            {/* Card Content - Expands in Edit Mode */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                editingKey === prompt.key ? 'max-h-96' : 'max-h-0'
              }`}
            >
              <div className="border-t border-gray-100 p-4 space-y-3">
                {/* Textarea in Edit Mode */}
                <textarea
                  value={editingKey === prompt.key ? editingContent : ''}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="text-sm text-gray-800 leading-relaxed resize-none w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-400 min-h-32"
                  placeholder="Enter prompt text..."
                />

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-xs font-semibold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-lg transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(prompt.key)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 rounded-lg transition-all duration-200"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Read-Only Preview - Shows When Not Editing */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                editingKey === prompt.key ? 'max-h-0' : 'max-h-32'
              }`}
            >
              <div className="border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap line-clamp-3">
                  {prompt.content}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}