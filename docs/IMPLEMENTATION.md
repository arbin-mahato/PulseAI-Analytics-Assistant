# Implementation map

| Layer | Files | Responsibility |
|---|---|---|
| Dataset | script/data/seed.py, script/queries/*.sql | Reproducible linked activity, metric derivation, schema assertions, atomic warehouse replacement |
| Optional ClickHouse | script/data/seed_clickhouse.py | Copy exactly the same synthetic raw activity to a fresh ClickHouse instance |
| Query execution | src/lib/analytics/query.ts, worker/query.py | SQL routing, schema discovery, read-only validation, row/time/memory limits |
| MCP server | mcp_servers/tradelab_mcp_server.ts | Seven Zod-validated tools; standard MCP SDK client/server transport |
| Charts and PDFs | worker/analysis.py, assets/fonts | Trusted recipe execution, matplotlib charts, ReportLab PDFs with INR font |
| Provider adapters | agent/providers/{claude,groq,gemini}.ts | Convert shared messages/tools to native APIs and normalize responses |
| Provider routing | agent/providers/router.ts | Preference, missing-key fallback, request recovery and bounded quota waits |
| Agent | agent/tradelab_agent.ts | Bounded loop, actual MCP calls, execution events, valid tool-result history, artifact collection |
| Persistence | src/lib/runtime/store.ts | SQLite conversations, ownership, artifact metadata, run directories and conversation locks |
| Access control | src/lib/runtime/auth.ts, src/app/api/session | Signed cookies, workspace password, origin checks, request limits |
| Browser/API | src/app/chat, src/app/api | Existing chat and report UI, buffered SSE, provider control, conversations, files |
| Deployment | Dockerfile, compose.yaml, render.yaml, next.config.mjs | Single-server runtime, durable volume, optional frontend proxy |

## Preserved MCP interface

`getSchema`, `sql_query_writer`, `sql_query_executor`, `json_sql_query_executor`, `python_script_writer`, `python_script_executor`, and `pdfGenerator` are registered on `McpServer`. The agent discovers tool definitions via `Client.listTools()` and runs them via `Client.callTool()`. Providers receive those same schemas. The in-memory transport carries MCP messages; there is no switch statement substituting for the protocol.

The transport is local to each analysis request, not an externally exposed MCP endpoint. Adding a remote MCP endpoint would require its own authentication and deployment decisions.

## Important differences from the original

- The shared orchestration uses native model APIs instead of the Claude Agent SDK. A Claude key remains supported but is not needed for charts or PDF rendering.
- Database rows and types are generated from coherent activity rather than unrelated random metric values. The original private source data was not available.
- SQL execution is read-only and bounded. Python tools accept a validated recipe, not arbitrary code. Calculations belong in SQL; the trusted renderer supports bar, line, scatter, histogram, pie, box and heatmap charts.
- Files are addressed by opaque owner-checked IDs, not arbitrary filesystem paths or public GCS URLs.
- A workspace password replaces the incomplete Google OAuth/Prisma path. One password means one shared workspace, not independent named user accounts.
- Uploads are a file library, as in the original intent; they do not automatically become queryable trading data.
- Conversation history is durable in SQLite. Old whole turns may be dropped from model context to fit API budgets, while full history remains stored. Very old numerical follow-ups may require a fresh query.
- The UI shows execution status, not hidden chain-of-thought text.
- PDFs include the latest saved query result directly, or up to three selected result files. Each table includes up to 200 rows, with an explicit preview note for larger results; full query results remain downloadable as CSV/JSON. This avoids dropped rows when the model's report prose hits its output budget.
- Exact provider wording/analysis choices and original production figures are not guaranteed.

## Boundaries for production use

This is a single-server application with a small bounded analytics workload. Model calls can vary in speed, reliability and free-tier availability. It is not a high-availability service, reconciled accounting platform or full market-data feed. There is no cross-instance job queue, arbitrary Python execution, automatic file-retention job, Google OAuth or automatic real-broker import. SQL is limited to approved tables, 10,000 result rows and a 30-second worker lifetime.

Transient provider failures may switch providers before any new tool executes. Tool history is retained; completed tools are not replayed just because a model request failed. Gemini's native opaque response parts are preserved, and foreign-provider tool history is represented as text when entering Gemini so signatures are not fabricated.

## Commit history

The implementation branch starts from the original MVP commit and captures the pre-existing Groq migration as a baseline. Dataset creation, shared MCP/runtime, the provider contract, each of the three provider adapters, shared orchestration, browser/persistence, deployment and subsequent fixes are kept in separate commits. The original `tradelab` working directory is not modified.
