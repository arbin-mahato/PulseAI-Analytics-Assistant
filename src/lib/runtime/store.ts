import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { dataRoot, ensureInside } from "./config";

const { Pool } = pg;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isPostgres(): boolean {
  return (
    process.env.PERSISTENCE_BACKEND === "postgres" ||
    Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL)
  );
}

export function getDatabaseBackend(): "postgres" | "sqlite" {
  return isPostgres() ? "postgres" : "sqlite";
}

let connection: DatabaseSync | undefined;
let openedPath = "";

export function stateDb() {
  const location = path.join(dataRoot(), "application.sqlite");
  if (connection && openedPath === location) return connection;
  connection?.close();
  fs.mkdirSync(dataRoot(), { recursive: true });
  connection = new DatabaseSync(location);
  openedPath = location;
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]', messages TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL, busy_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, session_id TEXT NOT NULL, run_id TEXT NOT NULL, filename TEXT NOT NULL, local_path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, public INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(owner, updated);
    CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(owner, created);
  `);
  return connection;
}

let pgPool: pg.Pool | undefined;
let pgInitPromise: Promise<void> | undefined;

export function getPgPool(): pg.Pool {
  if (pgPool) return pgPool;
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "postgresql://localhost:5432/tradelab";

  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  pgPool = new Pool({
    connectionString,
    ssl: isLocal
      ? undefined
      : {
          rejectUnauthorized: false,
        },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  return pgPool;
}

export async function initPgSchema(): Promise<void> {
  if (pgInitPromise) return pgInitPromise;
  pgInitPromise = (async () => {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        title TEXT NOT NULL,
        history TEXT NOT NULL DEFAULT '[]',
        messages TEXT NOT NULL DEFAULT '[]',
        updated BIGINT NOT NULL,
        busy_until BIGINT NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        session_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        local_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        size BIGINT NOT NULL,
        public INTEGER NOT NULL DEFAULT 0,
        created BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        hits INTEGER NOT NULL,
        reset BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(owner, updated DESC);
      CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(owner, created DESC);
    `);
  })();
  return pgInitPromise;
}

export async function closeStore(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = undefined;
    pgInitPromise = undefined;
  }
  if (connection) {
    connection.close();
    connection = undefined;
    openedPath = "";
  }
}

export type Conversation = {
  id: string;
  owner: string;
  title: string;
  history: string;
  messages: string;
  updated: number;
  busy_until: number;
};

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    owner: String(row.owner),
    title: String(row.title),
    history: String(row.history),
    messages: String(row.messages),
    updated: Number(row.updated),
    busy_until: Number(row.busy_until),
  };
}

function asThenable<T extends object>(obj: T): T & Promise<T> {
  const p = Promise.resolve(obj);
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      if (prop === "finally") return p.finally.bind(p);
      return Reflect.get(target, prop, receiver);
    },
  }) as T & Promise<T>;
}

export type ConversationResult = Conversation & Promise<Conversation>;

export function conversation(
  owner: string,
  id?: string,
): ConversationResult {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      if (id) {
        const res = await pool.query(
          "SELECT * FROM conversations WHERE id = $1 AND owner = $2",
          [id, owner],
        );
        if (!res.rows[0]) throw new Error("Conversation not found.");
        return mapConversation(res.rows[0]);
      }
      const newId = randomUUID();
      await pool.query(
        "INSERT INTO conversations(id, owner, title, updated, busy_until) VALUES($1, $2, $3, $4, 0)",
        [newId, owner, "New conversation", Date.now()],
      );
      return conversation(owner, newId);
    })() as unknown as ConversationResult;
  }

  // SQLite (synchronous)
  if (id) {
    const existing = stateDb()
      .prepare("SELECT * FROM conversations WHERE id=? AND owner=?")
      .get(id, owner);
    if (!existing) throw new Error("Conversation not found.");
    return asThenable(existing as unknown as Conversation);
  }
  const newId = randomUUID();
  stateDb()
    .prepare(
      "INSERT INTO conversations(id,owner,title,updated) VALUES(?,?,?,?)",
    )
    .run(newId, owner, "New conversation", Date.now());
  return conversation(owner, newId);
}

export function lockConversation(
  owner: string,
  id: string,
  timeoutMs: number,
): void | Promise<void> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const now = Date.now();
      const res = await pool.query(
        "UPDATE conversations SET busy_until = $1 WHERE id = $2 AND owner = $3 AND busy_until < $4",
        [now + timeoutMs, id, owner, now],
      );
      if ((res.rowCount ?? 0) === 0)
        throw new Error("This conversation is already processing a request.");
    })();
  }

  const r = stateDb()
    .prepare(
      "UPDATE conversations SET busy_until=? WHERE id=? AND owner=? AND busy_until<?",
    )
    .run(Date.now() + timeoutMs, id, owner, Date.now());
  if (!r.changes)
    throw new Error("This conversation is already processing a request.");
}

export function saveConversation(
  owner: string,
  id: string,
  history: unknown[],
  messages: unknown[],
  title: string,
): void | Promise<void> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      await pool.query(
        "UPDATE conversations SET history = $1, messages = $2, title = $3, updated = $4 WHERE id = $5 AND owner = $6",
        [
          JSON.stringify(history),
          JSON.stringify(messages),
          title.slice(0, 100),
          Date.now(),
          id,
          owner,
        ],
      );
    })();
  }

  stateDb()
    .prepare(
      "UPDATE conversations SET history=?,messages=?,title=?,updated=? WHERE id=? AND owner=?",
    )
    .run(
      JSON.stringify(history),
      JSON.stringify(messages),
      title.slice(0, 100),
      Date.now(),
      id,
      owner,
    );
}

export function unlockConversation(
  owner: string,
  id: string,
): void | Promise<void> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      await pool.query(
        "UPDATE conversations SET busy_until = 0 WHERE id = $1 AND owner = $2",
        [id, owner],
      );
    })();
  }

  stateDb()
    .prepare("UPDATE conversations SET busy_until=0 WHERE id=? AND owner=?")
    .run(id, owner);
}

export function listConversations(
  owner: string,
):
  | Array<{ id: string; title: string; updated: number }>
  | Promise<Array<{ id: string; title: string; updated: number }>> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT id, title, updated FROM conversations WHERE owner = $1 ORDER BY updated DESC LIMIT 100",
        [owner],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        updated: Number(r.updated),
      }));
    })();
  }

  return stateDb()
    .prepare(
      "SELECT id,title,updated FROM conversations WHERE owner=? ORDER BY updated DESC LIMIT 100",
    )
    .all(owner) as Array<{ id: string; title: string; updated: number }>;
}

export type Artifact = {
  id: string;
  owner: string;
  session_id: string;
  run_id: string;
  filename: string;
  local_path: string;
  mime: string;
  size: number;
  public: number;
  created: number;
};

function mapArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: String(row.id),
    owner: String(row.owner),
    session_id: String(row.session_id),
    run_id: String(row.run_id),
    filename: String(row.filename),
    local_path: String(row.local_path),
    mime: String(row.mime),
    size: Number(row.size),
    public: Number(row.public),
    created: Number(row.created),
  };
}

export type ArtifactResult = Artifact & Promise<Artifact | undefined>;

export function artifact(
  id: string,
): ArtifactResult | undefined {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query("SELECT * FROM artifacts WHERE id = $1", [
        id,
      ]);
      if (!res.rows[0]) return undefined;
      return mapArtifact(res.rows[0]);
    })() as unknown as ArtifactResult;
  }

  const row = stateDb().prepare("SELECT * FROM artifacts WHERE id=?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? asThenable(mapArtifact(row)) : undefined;
}

export function registerArtifact(
  ctx: RunContext,
  file: string,
  filename: string,
  mime: string,
  isPublic = false,
):
  | { id: string; filename: string; url: string; mime: string; size: number }
  | Promise<{
      id: string;
      filename: string;
      url: string;
      mime: string;
      size: number;
    }> {
  ensureInside(dataRoot(), file);
  const id = randomUUID();
  const size = fs.statSync(file).size;
  const result = { id, filename, url: `/api/files/${id}`, mime, size };

  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      await pool.query(
        "INSERT INTO artifacts (id, owner, session_id, run_id, filename, local_path, mime, size, public, created) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          id,
          ctx.owner,
          ctx.sessionId,
          ctx.runId,
          filename,
          file,
          mime,
          size,
          isPublic ? 1 : 0,
          Date.now(),
        ],
      );
      return result;
    })();
  }

  stateDb()
    .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(
      id,
      ctx.owner,
      ctx.sessionId,
      ctx.runId,
      filename,
      file,
      mime,
      size,
      isPublic ? 1 : 0,
      Date.now(),
    );
  return result;
}

export function ownedArtifacts(
  owner: string,
): Artifact[] | Promise<Artifact[]> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT id, filename, local_path, mime, size, public, created, owner, session_id, run_id FROM artifacts WHERE owner = $1 ORDER BY created DESC LIMIT 200",
        [owner],
      );
      return res.rows.map(mapArtifact);
    })();
  }

  return stateDb()
    .prepare(
      "SELECT id,filename,mime,size,public,created FROM artifacts WHERE owner=? ORDER BY created DESC LIMIT 200",
    )
    .all(owner) as unknown as Artifact[];
}

export function getSetting(
  key: string,
): string | undefined | Promise<string | undefined> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT value FROM settings WHERE key = $1",
        [key],
      );
      return res.rows[0]?.value ? String(res.rows[0].value) : undefined;
    })();
  }
  const row = stateDb()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(key) as { value?: string } | undefined;
  return row?.value ? String(row.value) : undefined;
}

export function setSetting(
  key: string,
  value: string,
): void | Promise<void> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [key, value],
      );
    })();
  }
  stateDb()
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, value);
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs = 60000,
): void | Promise<void> {
  const now = Date.now();
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      await pool.query("DELETE FROM rate_limits WHERE reset < $1", [now]);
      const res = await pool.query(
        "INSERT INTO rate_limits (key, hits, reset) VALUES ($1, 1, $2) ON CONFLICT (key) DO UPDATE SET hits = rate_limits.hits + 1 RETURNING hits",
        [key, now + windowMs],
      );
      if (Number(res.rows[0]?.hits) > max) {
        throw new HttpError(429, "Too many requests. Please wait a minute.");
      }
    })();
  }

  const db = stateDb();
  db.prepare("DELETE FROM rate_limits WHERE reset<?").run(now);
  const row = db
    .prepare(
      "INSERT INTO rate_limits(key,hits,reset) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
    )
    .get(key, now + windowMs) as { hits?: number } | undefined;
  if (Number(row?.hits) > max) {
    throw new HttpError(429, "Too many requests. Please wait a minute.");
  }
}

export function getBusyConversationsCount(
  now = Date.now(),
): number | Promise<number> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT COUNT(*) AS n FROM conversations WHERE busy_until > $1",
        [now],
      );
      return Number(res.rows[0]?.n || 0);
    })();
  }
  const busy = stateDb()
    .prepare("SELECT COUNT(*) AS n FROM conversations WHERE busy_until>?")
    .get(now) as { n?: number } | undefined;
  return Number(busy?.n || 0);
}

export function findArtifactPath(
  candidate: string,
  owner: string,
  sessionId: string,
  mimes: string[],
): string | undefined | Promise<string | undefined> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT local_path FROM artifacts WHERE local_path = $1 AND owner = $2 AND session_id = $3 AND mime = ANY($4::text[])",
        [candidate, owner, sessionId, mimes],
      );
      return res.rows[0]?.local_path
        ? String(res.rows[0].local_path)
        : undefined;
    })();
  }
  const placeholders = mimes.map(() => "?").join(",");
  const row = stateDb()
    .prepare(
      `SELECT local_path FROM artifacts WHERE local_path=? AND owner=? AND session_id=? AND mime IN (${placeholders})`,
    )
    .get(candidate, owner, sessionId, ...mimes) as
    | { local_path?: string }
    | undefined;
  return row?.local_path ? String(row.local_path) : undefined;
}

export function findArtifactById(
  id: string,
  owner: string,
  sessionId: string,
  mime?: string,
): Artifact | undefined | Promise<Artifact | undefined> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const sql = mime
        ? "SELECT * FROM artifacts WHERE id = $1 AND owner = $2 AND session_id = $3 AND mime = $4"
        : "SELECT * FROM artifacts WHERE id = $1 AND owner = $2 AND session_id = $3";
      const params = mime
        ? [id, owner, sessionId, mime]
        : [id, owner, sessionId];
      const res = await pool.query(sql, params);
      return res.rows[0] ? mapArtifact(res.rows[0]) : undefined;
    })();
  }
  const sql = mime
    ? "SELECT * FROM artifacts WHERE id=? AND owner=? AND session_id=? AND mime=?"
    : "SELECT * FROM artifacts WHERE id=? AND owner=? AND session_id=?";
  const params = mime ? [id, owner, sessionId, mime] : [id, owner, sessionId];
  return stateDb().prepare(sql).get(...params) as Artifact | undefined;
}

export function findLatestArtifactIds(
  owner: string,
  sessionId: string,
  mimes: string[],
  limit = 1,
): string[] | Promise<string[]> {
  if (isPostgres()) {
    return (async () => {
      await initPgSchema();
      const pool = getPgPool();
      const res = await pool.query(
        "SELECT id FROM artifacts WHERE owner = $1 AND session_id = $2 AND mime = ANY($3::text[]) ORDER BY created DESC LIMIT $4",
        [owner, sessionId, mimes, limit],
      );
      return res.rows.map((r) => String(r.id));
    })();
  }
  const placeholders = mimes.map(() => "?").join(",");
  const rows = stateDb()
    .prepare(
      `SELECT id FROM artifacts WHERE owner=? AND session_id=? AND mime IN (${placeholders}) ORDER BY created DESC LIMIT ?`,
    )
    .all(owner, sessionId, ...mimes, limit) as { id: string }[];
  return rows.map((r) => String(r.id));
}

export type RunContext = {
  owner: string;
  sessionId: string;
  runId: string;
  directory: string;
  signal?: AbortSignal;
};

export function createRun(
  owner: string,
  sessionId: string,
  signal?: AbortSignal,
): RunContext {
  const runId = randomUUID(),
    directory = path.join(dataRoot(), "runs", runId);
  fs.mkdirSync(directory, { recursive: true });
  return { owner, sessionId, runId, directory, signal };
}

export function resolveRunFile(ctx: RunContext, supplied: string) {
  const absolute = ensureInside(
    ctx.directory,
    path.resolve(ctx.directory, supplied),
  );
  return ensureInside(ctx.directory, fs.realpathSync(absolute));
}
