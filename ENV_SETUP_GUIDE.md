# TradeLab Local Setup Guide - Environment Variables

Complete step-by-step guide to generate and configure all environment variables for local development with free API credits maximized.

---

## Table of Contents
1. [Anthropic API Configuration](#1-anthropic-api-configuration)
2. [NextAuth Configuration](#2-nextauth-configuration)
3. [Google OAuth Configuration](#3-google-oauth-configuration)
4. [Database Configuration](#4-database-configuration)
5. [Google Cloud Storage (Optional)](#5-google-cloud-storage-optional)
6. [Summary `.env.local` Template](#summary-envlocal-template)
7. [Tips to Maximize Free Credits](#tips-to-maximize-free-credits)

---

## 1. Anthropic API Configuration

### `ANTHROPIC_API_KEY`
**What it is**: Your API key to authenticate with Anthropic's Claude models.

**Where to get it:**
1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in with your Google/GitHub account
3. Accept the terms and conditions
4. Navigate to **"API Keys"** from the left sidebar
5. Click **"Create Key"** button
6. Give it a name like `"tradelab-local-dev"`
7. Click **"Create"**
8. **Copy the key** (starts with `sk-ant-`) - You won't see it again!
9. Paste into your `.env.local` file

**Example:**
```
ANTHROPIC_API_KEY=YOUR_API_KEY...
```

**Important Notes:**
- ✅ Free tier: $5 USD/month
- ✅ Resets on same date each month
- ⚠️ Keep this secret! Don't commit to Git
- 🔒 Add `.env.local` to `.gitignore` (already done in most projects)

**How to verify it works:**
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

---

## 2. NextAuth Configuration

NextAuth handles user authentication. You need:

### `NEXTAUTH_SECRET`
**What it is**: A random secret key to encrypt session tokens.

**How to generate it:**

**Option A: Using OpenSSL (Recommended - macOS/Linux):**
```bash
openssl rand -base64 32
```
Output will look like: `FaJlr8/cKbX1m9V2pXy3q+W7z9oAb4C5dEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhI=`

**Option B: Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Option C: Using Node.js (Alternative):**
```bash
npm exec -- tsx -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Paste into `.env.local`:**
```
NEXTAUTH_SECRET=FaJlr8/cKbX1m9V2pXy3q+W7z9oAb4C5dEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhI=
```

---

### `NEXTAUTH_URL`
**What it is**: The URL where your app is running (for OAuth callbacks).

**For local development:**
```
NEXTAUTH_URL=http://localhost:3000
```

**For production (later):**
```
NEXTAUTH_URL=https://your-domain.com
```

---

## 3. Google OAuth Configuration

This allows users to sign in with Google (optional but recommended for testing).

### Getting Google OAuth Credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a Project"** at the top
3. Click **"NEW PROJECT"**
4. Name it `"tradelab-local"` and click **"Create"**
5. Wait for project to be created, then select it
6. In the search bar, search for **"OAuth 2.0 Consent Screen"**
7. Click on **"OAuth consent screen"**
8. Select **"External"** user type and click **"Create"**
9. Fill in:
   - **App name**: `TradeLab Local`
   - **User support email**: Your email
   - **Developer contact**: Your email
10. Click **"Save and Continue"**
11. Skip scopes (leave empty) and click **"Save and Continue"**
12. Review and click **"Back to Dashboard"**

### Now Create OAuth Credentials:

1. In the sidebar, go to **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Select **"Web application"**
4. Name it `"tradelab-local"`
5. Under **"Authorized JavaScript origins"**, add:
   ```
   http://localhost:3000
   ```
6. Under **"Authorized redirect URIs"**, add:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
7. Click **"Create"**
8. A popup shows your credentials:
   - Copy the **Client ID**
   - Copy the **Client Secret**

**Paste into `.env.local`:**
```
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
```

---

## 4. Database Configuration

### Option A: DuckDB (Recommended for Local Development)

DuckDB is **already built-in** and requires no setup!

**`DUCKDB_NAME`** (Optional - defaults to `metric_store.duckdb`):
```
DUCKDB_NAME=metric_store.duckdb
```

**Setup DuckDB tables:**
```bash
npm run build-db
```

This creates a local database with sample trading metrics. **Done!** ✅

---

### Option B: PostgreSQL (For User Auth Database)

If you want persistent user/session storage:

**Using Docker (Easiest):**
```bash
docker pull postgres:latest
docker run -d --name tradelab-postgres \
  -e POSTGRES_USER=tradelab \
  -e POSTGRES_PASSWORD=localpassword123 \
  -e POSTGRES_DB=tradelab \
  -p 5432:5432 \
  postgres:latest
```

**Verify it's running:**
```bash
docker ps | grep tradelab-postgres
```

**`DATABASE_URL`** for `.env.local`:
```
DATABASE_URL=postgresql://tradelab:localpassword123@localhost:5432/tradelab
```

**Initialize Prisma migrations:**
```bash
npm run generate
npm run migrate:deploy
```

---

### Option C: ClickHouse (For Production Analytics Data)

If you have real trading data and want to use ClickHouse:

**Using Docker:**
```bash
docker pull clickhouse/clickhouse-server:latest
docker run -d --name tradelab-clickhouse \
  -p 8123:8123 \
  -p 9000:9000 \
  clickhouse/clickhouse-server:latest
```

**Verify it's running:**
```bash
curl http://localhost:8123/?query=SELECT%201
```

**`CLICKHOUSE_HOST`** for `.env.local`:
```
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=default
```

---

## 5. Google Cloud Storage (Optional)

This is for uploading generated PDFs and images. **Skip this if you want to test locally without file uploads.**

### If you want to enable it:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Use the same project as Google OAuth
3. Search for **"Cloud Storage"** and click **"Create Bucket"**
4. Name it uniquely: `tradelab-files-{your-username}`
5. Select **"Region"** closest to you
6. Click **"Create"**
7. Go to **"Service Accounts"** in the sidebar
8. Click **"Create Service Account"**
9. Name: `tradelab-app`
10. Click **"Create and Continue"**
11. Grant role: **"Storage Admin"**
12. Click **"Continue"** then **"Done"**
13. Click on the service account you just created
14. Go to **"Keys"** tab
15. Click **"Add Key"** → **"Create new key"**
16. Select **"JSON"** and click **"Create"**
17. This downloads a JSON file - save it somewhere safe (e.g., `~/gcs-key.json`)

**For `.env.local`:**
```
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=tradelab-files-{your-username}
GOOGLE_APPLICATION_CREDENTIALS=/Users/arbin/gcs-key.json
```

**⚠️ Important:**
- Add the JSON key file to `.gitignore`
- Never commit this file to Git

---

## 6. Summary `.env.local` Template

Create a file named `.env.local` in the project root and fill in the values:

```bash
# ============================================
# ANTHROPIC AI CONFIGURATION
# ============================================
ANTHROPIC_API_KEY=sk-ant-v0-YOUR_KEY_HERE

# ============================================
# AUTHENTICATION (NextAuth)
# ============================================
NEXTAUTH_SECRET=YOUR_RANDOM_SECRET_HERE
NEXTAUTH_URL=http://localhost:3000

# ============================================
# GOOGLE OAUTH
# ============================================
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET_HERE

# ============================================
# DATABASE - OPTION A: DUCKDB (Local/Recommended)
# ============================================
DUCKDB_NAME=metric_store.duckdb

# ============================================
# DATABASE - OPTION B: POSTGRESQL (User/Session Storage)
# ============================================
# Uncomment if using PostgreSQL
# DATABASE_URL=postgresql://tradelab:localpassword123@localhost:5432/tradelab

# ============================================
# DATABASE - OPTION C: CLICKHOUSE (Analytics Data)
# ============================================
# Uncomment if using ClickHouse
# CLICKHOUSE_HOST=http://localhost:8123
# CLICKHOUSE_USER=default
# CLICKHOUSE_PASSWORD=
# CLICKHOUSE_DB=default

# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development

# ============================================
# GOOGLE CLOUD STORAGE (Optional - for PDFs)
# ============================================
# Uncomment if you want to upload files
# GCS_PROJECT_ID=your-project-id
# GCS_BUCKET_NAME=tradelab-files-{your-username}
# GOOGLE_APPLICATION_CREDENTIALS=/Users/arbin/gcs-key.json
```

---

## 7. Tips to Maximize Free Credits

### Strategy 1: Use DuckDB Cache ✅
```
✅ Instead of querying ClickHouse repeatedly
✅ Pre-calculate metrics in DuckDB
✅ Run queries on the cached DuckDB tables
✅ Saves ~70% of API calls
```

### Strategy 2: Batch Your Testing
```
✅ Test multiple queries in one session
✅ Use conversation history to avoid repeating context
✅ Each API call costs tokens - fewer calls = more testing
```

### Strategy 3: Write Better Prompts
```
❌ BAD: "Show me traders"
✅ GOOD: "Show me top 10 traders by profit in the last 30 days with 
          their win rate and risk profile"
```
Better prompts = fewer Claude corrections = fewer tokens used

### Strategy 4: Use Local Models for Simple Tasks
```
✅ Schema retrieval - cache the response locally
✅ Data validation - use JavaScript/Python validation
✅ Report formatting - don't use Claude for formatting
✅ Only use Claude for complex analysis tasks
```

### Strategy 5: Monitor Your Usage
```bash
# Check API usage in Anthropic Dashboard:
https://console.anthropic.com/account/usage

# Log all API calls locally:
Enable DEBUG mode in your app
```

### Strategy 6: Optimize Database Queries
```
✅ Use LIMIT clauses to reduce data transfer
✅ Select only needed columns
✅ Use WHERE filters to reduce data size
❌ Don't request millions of records
```

### Example Month Budget ($5 = ~500K tokens)
```
- High complexity queries: ~5000 tokens each = ~100 queries
- Medium complexity queries: ~2000 tokens each = ~250 queries
- Simple queries: ~500 tokens each = ~1000 queries

Recommendation: Mix of all types, heavily using DuckDB cache
```

---

## Quick Start Checklist

- [ ] **Step 1:** Get `ANTHROPIC_API_KEY` from https://console.anthropic.com/
- [ ] **Step 2:** Generate `NEXTAUTH_SECRET` using `openssl rand -base64 32`
- [ ] **Step 3:** Set `NEXTAUTH_URL=http://localhost:3000`
- [ ] **Step 4:** Create Google OAuth credentials (optional but recommended)
- [ ] **Step 5:** Set `DUCKDB_NAME=metric_store.duckdb`
- [ ] **Step 6:** Create `.env.local` with all variables
- [ ] **Step 7:** Run `npm install`
- [ ] **Step 8:** Run `npm run build-db`
- [ ] **Step 9:** Run `npm run dev`
- [ ] **Step 10:** Open http://localhost:3000 and test!

---

## Verification Steps

### Test Anthropic API:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-haiku-20241022","max_tokens":100,"messages":[{"role":"user","content":"Say hello"}]}'
```

### Test Next.js Server:
```bash
npm run dev
# Should see: Ready in 1234ms
# Open http://localhost:3000
```

### Test Chat:
1. Sign in (use Google OAuth or email)
2. Go to `/chat`
3. Ask: "What is my database schema?"
4. Should return database structure

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ANTHROPIC_API_KEY not found` | Make sure `.env.local` is in project root, not `.env` |
| `Auth session failed` | Check `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set |
| `Database connection refused` | Make sure PostgreSQL/ClickHouse containers are running |
| `Google login fails` | Verify OAuth redirect URI is `http://localhost:3000/api/auth/callback/google` |
| `Out of free credits` | Wait for monthly reset or add payment method to Anthropic console |

---

## Next Steps

After setup:
1. Read [README.md](README.md) for project overview
2. Test queries in `/chat` interface
3. Monitor Anthropic usage dashboard
4. Start building your analytics queries!

---

**Need help?** Check the console for error messages - they're usually descriptive!
