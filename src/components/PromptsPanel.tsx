"use client";
import { useEffect, useState } from "react";
export default function PromptsPanel() {
  const [value, setValue] = useState(""),
    [system, setSystem] = useState(""),
    [message, setMessage] = useState("Loading…");
  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((data) => {
        setValue(data.additional_instructions || "");
        setSystem(data.tradelab_system_prompt || "");
        setMessage(data.error || "");
      });
  }, []);
  return (
    <div className="p-4 space-y-4 overflow-auto h-full text-slate-800">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Response Preferences</h2>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          Choose the tone, level of detail, or report format you prefer for analyses and reports.
        </p>
      </div>

      <div>
        <label htmlFor="user-instructions" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Custom System Instructions:
        </label>
        <textarea
          id="user-instructions"
          aria-label="Additional instructions"
          maxLength={4000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Always format currency in INR, present data in concise markdown tables, and highlight key anomalies."
          className="w-full border border-slate-300 rounded-lg p-3 min-h-36 text-xs text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0C499C] focus:border-transparent shadow-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          className="bg-[#0C499C] hover:bg-[#093877] text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0C499C] cursor-pointer"
          onClick={async () => {
            try {
              const r = await fetch("/api/prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "additional_instructions", value }),
              });
              const data = await r.json();
              setMessage(r.ok ? "Preferences saved successfully." : data.error);
            } catch {
              setMessage("Could not save preferences.");
            }
          }}
        >
          Save preferences
        </button>
        {message && (
          <span role="status" className="text-xs text-slate-500 italic">
            {message}
          </span>
        )}
      </div>

      <div className="pt-2 border-t border-slate-200">
        <details className="group">
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer hover:text-[#0C499C] flex items-center gap-1 select-none">
            <span>►</span> Shared Analysis Instructions (Base Prompt)
          </summary>
          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed mt-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 overflow-x-auto max-h-72">
            {system}
          </pre>
        </details>
      </div>
    </div>
  );
}
