# TradeLab: Claude, Groq and Gemini with shared MCP analytics

Ask a question → the selected AI calls the original seven MCP tool names → SQL calculates results → TradeLab returns an answer, table, chart and/or downloadable PDF.

The app uses the standard MCP TypeScript SDK with a client/server connection. Only the provider adapters differ. Database calculations, Python chart rendering, PDF generation, storage and the chat interface are shared.

## Start locally

Install **Node.js 24** and **Python 3.9–3.12** (3.11 recommended), then:

```sh
npm ci
npm run setup
```

Add at least one key to `.env.local`:

```dotenv
GROQ_API_KEY=your_key
# GEMINI_API_KEY=your_key
# ANTHROPIC_API_KEY=your_key
```

```sh
npm run dev
```

Open http://localhost:3000. Local development creates a private browser session automatically. For a password-protected workspace, set `APP_ACCESS_PASSWORD` and restart. All people using that password share one workspace. Without a password, each browser has its own conversations/files; losing its cookie loses access to them.

No GCP, Postgres, Claude subscription or ClickHouse account is required. Keep `.env.local` private. Provider keys stay on the server. The existing `.env.local` is preserved by setup.

## What is replicated

| Original workflow | Implementation in this copy |
|---|---|
| Chat with ongoing analysis status | Existing chat UI, robust SSE, stop button, saved conversations |
| Claude agent | Shared bounded agent loop; native Claude Messages adapter |
| Groq / Gemini alternative | Native provider adapters, automatic missing-key fallback, rate-limit recovery |
| MCP analysis tools | Standard MCP SDK client/server using an in-memory transport; seven original tool names |
| Metric queries | All seven metric tables, original column names and typed values |
| Raw activity queries | Linked users, orders, fills, events and logs |
| Python charts | Validated declarative Python recipes rendered with pandas/matplotlib/seaborn |
| PDF reports | Local ReportLab renderer, tables, INR font and optional charts; no additional LLM call |
| Image / PDF / CSV / JSON downloads | Local files with owner-checked URLs and persistent metadata |
| File uploads | Public/private file library; uploads do not automatically change the analytics database |
| Sign in | Workspace password; Google OAuth/GCP configuration is no longer required |
| Deployment | Docker, persistent Render service, optional Vercel API rewrites, GitHub CI |

The application is a functional replication, not a byte-for-byte clone. Claude Agent SDK orchestration was replaced by a provider-independent loop; Claude remains available through its native API. Arbitrary model-authored Python is intentionally replaced by constrained chart recipes. Old Cloud Run workflows are archived under `docs/legacy-workflows`; they no longer auto-deploy.

**The included dataset is synthetic.** It covers the original schema and metrics, but does not contain the original company's private customer data or real market prices. Different models can produce different SQL choices and wording. Exact original business numbers or identical Claude answer quality cannot be reproduced without the original data and comparative evaluations.

## Try these questions

- Show the top 5 users by 30-day trading volume. Include a table and a bar chart.
- Compare the win rate and realized PnL of the 10 most active traders over 30 days.
- Which accounts have the highest rejection rates? Show counts as well as percentages.
- Show the daily realized PnL over the last 30 days for DEMO0001.
- Turn this analysis into a PDF report and include the chart.

Free API limits apply to every model call, so one question may need several calls and temporary waits. Auto mode tries configured providers in `LLM_FALLBACK_ORDER` (default Claude → Groq → Gemini). Selecting a provider makes it the first choice, with fallback still enabled. Missing keys are skipped. Both Groq and Gemini are supported; neither is a fake/mock fallback. A second key helps availability, but cannot guarantee unlimited free usage.

The tested Groq default is `qwen/qwen3.8-27b` with a 768-token output budget per call. The table/chart/PDF workflow completed with a real Groq key, including automatic quota waits. Models and account limits can change; use `GROQ_MODEL` or `GEMINI_MODEL` to override the defaults. Larger analyses can exceed free-tier limits even when small questions work.

## Dataset and metrics

`npm run build-db` generates linked synthetic activity and computes metrics from it; metrics are not independently randomized. The default snapshot has 100 accounts, roughly 17,500 orders, 16,000 fills and 164,000 activity events. Exact counts depend on the seed/date.

```sh
npm run build-db -- --seed 42 --users 100 --as-of 2026-09-11
```

This explicitly replaces the local warehouse, not saved conversations. Stop active analysis before reseeding. Existing answers/downloads keep their original values and should not be compared to a new snapshot without accounting for the date change. Container startup seeds only when the database does not exist.

See [DATA.md](docs/DATA.md) for schema, formulas, units, real-data requirements and optional ClickHouse seeding. The generated manifest records the snapshot date and seed. Rolling windows use that date via `as_of()`, so demonstrations do not silently become empty as time passes.

## Hosting

Start with the **whole application on Render**. The provided `render.yaml` uses a paid service plus a persistent disk for the database, conversations, uploads, charts and PDFs. [DEPLOYMENT.md](docs/DEPLOYMENT.md) has the steps and a free disposable-demo alternative.

Vercel can host the frontend with `/api/*` rewritten to Render. Python, SQLite, DuckDB and generated files must run on Render, not Vercel functions. Render's free filesystem is temporary, so it cannot provide permanent local storage; restarting can remove conversations and downloads. No deployment is created merely by running local setup.

## Verification

```sh
npm test              # provider contracts, real MCP calls, data integrity, sessions and SSE
npm run typecheck
npm run lint
npm run build
npm run test:browser  # after build; install Chromium with npx playwright install chromium
npm run test:live     # optional; spends configured provider quota using synthetic data
```

`test:live` saves its results under ignored `eval_outputs/`. Its default question checks for a returned answer, query-result JSON, chart and PDF. Claude and Gemini require their own keys for live verification. Mock provider tests verify request/response contracts but do not measure model answer quality. See [VALIDATION.md](docs/VALIDATION.md) for completed checks and untested deployment paths.

See [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the code map, commit responsibilities and remaining operational limits.
