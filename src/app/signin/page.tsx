"use client";
import { useEffect, useState } from "react";
export default function SignInPage() {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/session").then((r) => {
      if (r.ok) window.location.replace("/chat");
    });
  }, []);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-slate-50">
      <img
        src="/TradeLab Mobile logo.png"
        alt="TradeLab"
        width="64"
        height="64"
      />
      <h1 className="text-3xl font-bold">Welcome to TradeLab</h1>
      <p>Enter your workspace access password.</p>
      <form
        className="flex flex-col gap-4 w-full max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            window.location.replace("/chat");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Access password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded-lg p-3"
        />
        <button
          disabled={busy}
          className="bg-[#0C499C] text-white rounded-lg p-3"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
