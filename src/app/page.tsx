import Link from "next/link";

export default function RootPage() {
  return (
    <main className="min-h-screen bg-linear-to-br from-slate-50 via-white to-blue-50 text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#0C499C]">PulseAI Analytics Assistant</p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Ask questions about trading data in plain English.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          This project helps you explore trading metrics, run SQL queries, and generate charts and PDF reports with an AI assistant.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-full bg-[#0C499C] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-[#093d83]"
          >
            Open the chat
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Learn more
          </a>
        </div>

        <div id="features" className="mt-16 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm backdrop-blur">
            <h2 className="text-sm font-semibold text-slate-900">Ask naturally</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Type trading questions the way you would ask a teammate.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm backdrop-blur">
            <h2 className="text-sm font-semibold text-slate-900">Run analysis</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">The assistant can query the database and return useful results.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-left shadow-sm backdrop-blur">
            <h2 className="text-sm font-semibold text-slate-900">Generate reports</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Charts and PDF reports are created automatically when needed.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

