import path from "node:path";
import DuckDB from "duckdb";
import fs from "node:fs";

type Database = InstanceType<typeof DuckDB.Database>;

// Path to the local DuckDB file (metric_store.duckdb in db folder)
export const DB_PATH = process.env.METRIC_STORE_DB_PATH || path.resolve(process.cwd(), "db", "metric_store.duckdb");

// DuckDB connection pool and initialization state
let db: Database | null = null;
let dbInitialized = false;
let dbInitializing = false;
let dbInitPromise: Promise<Database> | null = null;

// Retry configuration for handling lock contention
const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const initializeDatabase = async (): Promise<Database> => {
  // If already initialized, return immediately
  if (db && dbInitialized) {
    return db;
  }

  // If currently initializing, wait for the promise
  if (dbInitializing && dbInitPromise) {
    return dbInitPromise;
  }

  // Start initialization with retry logic
  dbInitializing = true;
  dbInitPromise = attemptDatabaseInitialization();

  try {
    return await dbInitPromise;
  } finally {
    dbInitializing = false;
  }
};

const attemptDatabaseInitialization = async (): Promise<Database> => {
  let lastError: any = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      // Check if database file exists
      if (fs.existsSync(DB_PATH)) {
        console.log(`Attempting to open DuckDB (attempt ${attempt + 1}/${RETRY_ATTEMPTS})...`);
      } else {
        console.log(`DuckDB file not found at ${DB_PATH}, will create on first write`);
      }

      return await new Promise<Database>((resolve, reject) => {
        // Open with default options (read-write)
        db = new DuckDB.Database(DB_PATH, (err: any) => {
          if (err) {
            console.warn(`DuckDB initialization error (attempt ${attempt + 1}): ${err.message}`);
            reject(err);
          } else {
            dbInitialized = true;
            console.log('✅ DuckDB database initialized successfully');
            resolve(db!);
          }
        });
      });
    } catch (error: any) {
      lastError = error;

      // Check if it's a lock error
      const isLockError = error?.code === 'DUCKDB_NODEJS_ERROR' || 
                         error?.message?.includes('database is locked') ||
                         error?.message?.includes('IO');

      if (isLockError && attempt < RETRY_ATTEMPTS - 1) {
        // Calculate exponential backoff delay
        const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        console.warn(`Database locked or IO error. Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      } else if (!isLockError) {
        // Non-lock error, don't retry
        console.error('Fatal DuckDB initialization error:', error.message);
        dbInitialized = false;
        db = null;
        throw error;
      }
    }
  }

  // All retries exhausted
  console.error(`Failed to initialize DuckDB after ${RETRY_ATTEMPTS} attempts`);
  dbInitialized = false;
  db = null;
  throw new Error(`Failed to initialize DuckDB after ${RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
};

// Helper to wrap callback-based db.all() into Promise with retry logic
const dbAll = async (database: Database, sql: string, params: any[] = []): Promise<any[]> => {
  if (!database) {
    throw new Error('Database not initialized');
  }

  let lastError: any = null;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await new Promise<any[]>((resolve, reject) => {
        database.all(sql, ...params, (err: any, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error: any) {
      lastError = error;

      // Check if it's a lock error
      const isLockError = error?.code === 'DUCKDB_NODEJS_ERROR' || 
                         error?.message?.includes('database is locked') ||
                         error?.message?.includes('IO');

      if (isLockError && attempt < RETRY_ATTEMPTS - 1) {
        const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        console.warn(`Query lock contention (attempt ${attempt + 1}). Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      } else {
        // Not a lock error or last attempt, give up
        console.error(`DuckDB Query Error (attempt ${attempt + 1}):`, error.message);
        throw error;
      }
    }
  }

  // All retries exhausted
  throw new Error(`Query failed after ${RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
};

// Minimal clickhouse-compatible wrapper used by the codebase.
// We expose an object named `clickhouse` with a `query` method
// that accepts the same shape used across the repo: { query, format, query_params }
// and returns an object with `.json()` that resolves to an array of row objects.
export const clickhouse = {
  async query(opts: { query: string; format?: string; query_params?: Record<string, any> }) {
    const { query, query_params } = opts;

    // Very small param substitution for `{name:Type}` param syntax used in repo's queries.
    // We'll replace occurrences like {databaseName:String} with $1, $2, etc. for DuckDB binding
    let sql = query;
    const params: any[] = [];

    if (query_params) {
      let paramIndex = 1;
      for (const [k, v] of Object.entries(query_params)) {
        // Replace all occurrences of `{${k}:...}` with `$${paramIndex}` for DuckDB binding
        const re = new RegExp(`\\{\\s*${k}:[^}]+\\}`, "g");
        sql = sql.replace(re, `$${paramIndex}`);
        params.push(v);
        paramIndex++;
      }
    }

    // Remove ClickHouse-specific formatting hints like `FORMAT JSONEachRow` if present
    sql = sql.replace(/FORMAT\s+JSONEachRow/ig, "");
    sql = sql.trim();

    // Initialize database if needed, then execute query
    const database = await initializeDatabase();
    const rows = await dbAll(database, sql, params);
    
    return { json: async () => rows };
  },
};

// Export async function to get database instance (ensures it's initialized)
export const getDatabase = async (): Promise<Database> => {
  return initializeDatabase();
};

// Also export the underlying DuckDB Database instance for modules that need PRAGMA access
// This is a getter that ensures database is initialized before use
export const duckdbInstance = {
  all: async (sql: string, ...params: any[]): Promise<any[]> => {
    const database = await initializeDatabase();
    return dbAll(database, sql, params);
  },
  // Legacy sync-style API for backward compatibility (still returns promise)
  async execRaw(sql: string, ...params: any[]): Promise<any[]> {
    const database = await initializeDatabase();
    return dbAll(database, sql, params);
  }
};

// Create a sqlite-compatible interface for backward compatibility
export const sqlite = {
  prepare: (sql: string) => ({
    all: async (params?: any) => {
      const database = await initializeDatabase();
      const paramArray = params ? Object.values(params) : [];
      return dbAll(database, sql, paramArray);
    }
  })
};
