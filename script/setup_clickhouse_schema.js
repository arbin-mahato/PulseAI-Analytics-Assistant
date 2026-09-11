/**
 * Setup ClickHouse Cloud Analytics Schema
 * Creates trading analytics tables for TradeLab
 */

import dotenv from "dotenv";
import https from "https";

dotenv.config({ path: ".env.local" });

const CLICKHOUSE_CONFIG = {
  host: process.env.CLICKHOUSE_HOST || "",
  user: process.env.CLICKHOUSE_USER || "default",
  password: process.env.CLICKHOUSE_PASSWORD || "",
  db: process.env.CLICKHOUSE_DB || "default",
  port: 8443,
};

// Parse URL if it contains scheme (https://...)
if (CLICKHOUSE_CONFIG.host && CLICKHOUSE_CONFIG.host.includes("://")) {
  try {
    const url = new URL(CLICKHOUSE_CONFIG.host);
    CLICKHOUSE_CONFIG.host = url.hostname;
    CLICKHOUSE_CONFIG.user = url.username || CLICKHOUSE_CONFIG.user;
    CLICKHOUSE_CONFIG.password = url.password || CLICKHOUSE_CONFIG.password;
  } catch (err) {
    console.error("❌ Failed to parse CLICKHOUSE_HOST URL:", err.message);
    process.exit(1);
  }
}

// Fallback to CLICKHOUSE_URL if CLICKHOUSE_HOST not provided
if (!CLICKHOUSE_CONFIG.host && process.env.CLICKHOUSE_URL) {
  try {
    const url = new URL(process.env.CLICKHOUSE_URL);
    CLICKHOUSE_CONFIG.host = url.hostname;
    CLICKHOUSE_CONFIG.user = url.username || "default";
    CLICKHOUSE_CONFIG.password = url.password || "";
  } catch (err) {
    console.error("❌ Failed to parse CLICKHOUSE_URL:", err.message);
    process.exit(1);
  }
}

if (!CLICKHOUSE_CONFIG.host) {
  console.error(
    "❌ CLICKHOUSE_HOST or CLICKHOUSE_URL not configured in .env.local",
  );
  process.exit(1);
}

console.log(`🔌 Connecting to ClickHouse: ${CLICKHOUSE_CONFIG.host}:${CLICKHOUSE_CONFIG.port}`);

/**
 * Execute ClickHouse query
 */
async function executeQuery(query) {
  return new Promise((resolve, reject) => {
    const path = `/?user=${CLICKHOUSE_CONFIG.user}&password=${CLICKHOUSE_CONFIG.password}&database=${CLICKHOUSE_CONFIG.db}`;

    const options = {
      hostname: CLICKHOUSE_CONFIG.host,
      port: CLICKHOUSE_CONFIG.port,
      path: path,
      method: "POST",
      rejectUnauthorized: false, // For self-signed certs
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": Buffer.byteLength(query),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(query);
    req.end();
  });
}

/**
 * Create analytics tables
 */
async function setupSchema() {
  const tables = [
    {
      name: "orders",
      sql: `
        CREATE TABLE IF NOT EXISTS orders (
          id String,
          user_id String,
          symbol String,
          side String,
          quantity Float64,
          price Float64,
          status String,
          created_at DateTime,
          updated_at DateTime
        ) ENGINE = MergeTree()
        ORDER BY (user_id, created_at)
      `,
    },
    {
      name: "fills",
      sql: `
        CREATE TABLE IF NOT EXISTS fills (
          id String,
          order_id String,
          user_id String,
          symbol String,
          filled_qty Float64,
          fill_price Float64,
          commission Float64,
          created_at DateTime
        ) ENGINE = MergeTree()
        ORDER BY (user_id, created_at)
      `,
    },
    {
      name: "pnl",
      sql: `
        CREATE TABLE IF NOT EXISTS pnl (
          user_id String,
          symbol String,
          entry_price Float64,
          exit_price Float64,
          quantity Float64,
          realized_pnl Float64,
          percentage_return Float64,
          trade_date DateTime,
          close_date DateTime
        ) ENGINE = MergeTree()
        ORDER BY (user_id, trade_date)
      `,
    },
    {
      name: "risk_metrics",
      sql: `
        CREATE TABLE IF NOT EXISTS risk_metrics (
          user_id String,
          date DateTime,
          portfolio_value Float64,
          var_95 Float64,
          sharpe_ratio Float64,
          max_drawdown Float64,
          win_rate Float64,
          avg_win Float64,
          avg_loss Float64
        ) ENGINE = MergeTree()
        ORDER BY (user_id, date)
      `,
    },
    {
      name: "market_data",
      sql: `
        CREATE TABLE IF NOT EXISTS market_data (
          symbol String,
          date DateTime,
          open Float64,
          high Float64,
          low Float64,
          close Float64,
          volume Float64,
          volatility Float64
        ) ENGINE = MergeTree()
        ORDER BY (symbol, date)
      `,
    },
    {
      name: "execution_analytics",
      sql: `
        CREATE TABLE IF NOT EXISTS execution_analytics (
          user_id String,
          execution_date DateTime,
          total_orders UInt32,
          successful_orders UInt32,
          failed_orders UInt32,
          avg_fill_time Float64,
          slippage Float64,
          commission_paid Float64
        ) ENGINE = MergeTree()
        ORDER BY (user_id, execution_date)
      `,
    },
    {
      name: "behavioral_analytics",
      sql: `
        CREATE TABLE IF NOT EXISTS behavioral_analytics (
          user_id String,
          analysis_date DateTime,
          avg_order_size Float64,
          preferred_symbols String,
          preferred_time_of_day String,
          risk_tolerance String,
          trading_style String,
          avg_hold_time Float64
        ) ENGINE = MergeTree()
        ORDER BY (user_id, analysis_date)
      `,
    },
  ];

  for (const table of tables) {
    try {
      console.log(`📊 Creating table: ${table.name}...`);
      await executeQuery(table.sql);
      console.log(`✅ Table created: ${table.name}`);
    } catch (err) {
      console.error(`❌ Error creating ${table.name}:`, err.message);
    }
  }

  console.log("\n✨ ClickHouse schema setup complete!");
}

setupSchema().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
