# Verification record

Verified locally on 12 September 2026 using Node 24, Python 3.9 and Chromium. The dataset snapshot is fixed at 11 September 2026, seed 42.

| Check | Result |
|---|---|
| JavaScript/TypeScript tests | 14 passed: provider contracts, fallback, sessions, path ownership, MCP and SSE |
| Python tests | 12 passed: independent metric calculations, reproducibility, raw relationships, SQL constraints, chart recipes and report preview disclosure |
| Chromium browser checks | 3 passed: private upload/download isolation, visible stream errors, restored conversation/chart and rendered PDF |
| Production build | Passed, including TypeScript validation |
| ESLint | Passed with no errors; 11 advisory warnings remain for image/navigation recommendations and unused fields in the old ThinkingPanel |
| Live Groq workflow | Passed with `qwen/qwen3.8-27b`, using the existing local key and real MCP calls |

The live question requested the five users with the highest 30-day trading volume, a table, a bar chart and a PDF containing the table/chart. The result included all five rows and generated JSON, PNG and PDF downloads. Per-minute API throttling occurred; bounded waits completed successfully. PDF text was extracted and compared with every client ID and rounded amount in the saved SQL result. All five matched. No original customer data was sent to the provider.

The local snapshot contains 100 synthetic users, 17,561 orders, 16,190 fills, 164,018 activity events and 23 example application logs. Each of the seven metric tables has 100 rows, covering all 106 original column occurrences. The smaller fixture used by automated data tests is separate from this warehouse.

Local evidence is under ignored `eval_outputs/` and `test-results/`; generated data and API credentials are not committed. The browser fixture exercises the actual application and MCP renderer without consuming model quota. It is not itself a live model test.

## Checks still requiring external access

- **Claude and Gemini live responses:** native adapters and cross-provider history are tested with simulated API responses. No usable Claude/Gemini keys were supplied for live calls.
- **Docker and actual ClickHouse:** configuration and loader are implemented; the local Docker daemon was unavailable. CI is configured to build the image, start it, verify its health endpoint and confirm initial database creation. That CI run is not claimed as passed here. Optional ClickHouse integration has not been exercised against a running instance.
- **Render/Vercel deployment:** files and instructions are ready. No hosting service, paid disk, domain or public deployment was created. The optional Vercel proxy requires deployed verification and can time out on longer analyses.
- **Original answer parity:** original private data and a baseline of expected production answers were not supplied. Synthetic-data consistency and one live report workflow do not establish identical model quality for every possible question.

Re-run the commands in the README after changing provider models or dependency versions. A failed live test may reflect API quota or model availability; its error must be resolved before treating that provider as verified.
