# Environment setup

See [README.md](README.md) for local startup, [.env.example](.env.example) for all supported options, and [deployment instructions](docs/DEPLOYMENT.md).

Minimum configuration: one of `GROQ_API_KEY`, `GEMINI_API_KEY`, or `ANTHROPIC_API_KEY` in `.env.local`. No Google Cloud, Prisma/PostgreSQL or ClickHouse configuration is required for the default local dataset and storage.

Set `APP_ACCESS_PASSWORD` before public hosting. Never commit API keys. Old Google OAuth and GCS environment variables are no longer used by the active implementation.
