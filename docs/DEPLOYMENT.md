# Deployment

## Recommended: complete application on Render

This is one Node/Python application with a persistent local data directory. Deploying the whole app on Render avoids cross-site cookies and the Vercel API proxy timeout.

1. Push the implementation branch to your own GitHub repository.
2. In Render, create a Blueprint from that repository/branch and review `render.yaml`.
3. The Blueprint provisions the web service, a 1 GB persistent disk for generated artifacts/analytics, and a managed PostgreSQL database (`tradelab-db`) that automatically populates `DATABASE_URL`.
4. Set `APP_ACCESS_PASSWORD` to a strong password and add `GROQ_API_KEY`. You can also add `GEMINI_API_KEY` and `ANTHROPIC_API_KEY`; any one provider is sufficient.
5. `APP_SESSION_SECRET` is generated automatically. `TRADELAB_DATA_DIR=/app/data` is on the persistent disk for generated PDF/chart files and analytical DuckDB storage.
6. Open the Render URL, sign in, ask for a table/chart/PDF, and refresh the page to confirm the conversation persists.

Render provides `RENDER_EXTERNAL_URL`, which the app uses for cookie/origin checks. If using a custom domain, set `APP_ORIGIN` to that exact HTTPS origin (no trailing slash).

### Dual-Database Architecture
- **Analytical Metrics**: Processed by DuckDB (or optional ClickHouse) directly on linked order/fill records.
- **Application State & Conversations**: Persisted in PostgreSQL when `DATABASE_URL` (or `POSTGRES_URL`) is defined, falling back automatically to zero-config SQLite locally. All database tables and indexes (`conversations`, `artifacts`, `settings`, `rate_limits`) are provisioned automatically on first startup.

## Free Render demo

For a disposable demonstration, create a free Docker web service manually and omit the persistent disk. Keep password protection enabled and add a provider key.

The database is regenerated after filesystem resets; conversations, uploaded files and generated downloads are **not durable**. Render free services also spin down after inactivity. This is not equivalent to the persistent Blueprint. See [Render free-service documentation](https://render.com/docs/free) and [persistent disk documentation](https://render.com/docs/disks).

Keeping the original dataset snapshot cheap/free on your own machine is straightforward. Guaranteed always-on, permanent hosting and unlimited model usage are not supplied by free API keys.

## Optional: Vercel frontend, Render backend

The repository can build the frontend on Vercel while routing API calls to Render:

- Deploy the full backend on Render as above.
- Import the same branch into Vercel with Node 24 and Next.js.
- On **Vercel only**, set `TRADELAB_BACKEND_URL=https://your-backend.onrender.com`, then rebuild. No provider keys or Python setup are needed on Vercel.
- On **Render**, set `APP_ORIGIN=https://your-frontend.vercel.app` (or its custom domain).
- Keep `TRADELAB_BACKEND_URL` unset on Render to avoid a rewrite loop.

`next.config.mjs` places external `/api/*` rewrites before local API routes. The browser uses one origin, including file URLs and the signed session cookie. Use the Vercel URL consistently; the backend's direct sign-in form will reject browser POSTs from its own origin once APP_ORIGIN is set to the frontend.

**Limitation:** Vercel documents a 120-second external proxy timeout. A free-tier model may need longer after rate-limit waits. Such analyses can be interrupted in the split setup; use the direct Render deployment for longer requests. A durable background-job API would be required to remove that limitation. [Vercel limits](https://vercel.com/docs/limits)

## Docker locally

```sh
cp .env.example .env.local  # only if .env.local does not exist yet
# Edit .env.local: one provider key plus APP_ACCESS_PASSWORD.
docker compose up --build
```

Open http://localhost:3000. The named `tradelab-data` volume persists across container recreation. `docker compose down -v` deletes volumes; do not use it if you want to keep the data.

For an intentionally public demo you may explicitly set `ALLOW_PUBLIC_DEMO=true` without a password, but visitors can consume the server's model quota. Private hosting uses `APP_ACCESS_PASSWORD`.

## What you must supply

- At least one valid API key with available quota. Adding both Groq and Gemini improves fallback availability.
- Your Render account/repository connection and your choice of disposable free service versus paid persistence.
- A workspace password. A domain is optional.
- Original brokerage exports only if you require the original real business numbers. The bundled synthetic dataset already supports the complete demo workflow.

GCP and a GCS bucket are not required. This deployment stores images/PDFs on disk. Moving to an object store later also requires moving durable application state if the backend filesystem is ephemeral.
