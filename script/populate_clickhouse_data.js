/**
 * Populate ClickHouse Cloud with sample trading analytics data
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

console.log(
  `🔌 Connecting to ClickHouse: ${CLICKHOUSE_CONFIG.host}:${CLICKHOUSE_CONFIG.port}`,
);

async function executeQuery(query) {
  return new Promise((resolve, reject) => {
    const path = `/?user=${CLICKHOUSE_CONFIG.user}&password=${CLICKHOUSE_CONFIG.password}&database=${CLICKHOUSE_CONFIG.db}`;

    const options = {
      hostname: CLICKHOUSE_CONFIG.host,
      port: CLICKHOUSE_CONFIG.port,
      path: path,
      method: "POST",
      rejectUnauthorized: false,
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
 * Generate sample data
 */
function generateSampleData() {
  const userIds = ["A05973", "A06064", "A06072", "A06073", "A06129"];
  const symbols = ["RELIANCE", "TCS", "INFY", "HDFC", "ICICI"];
  const dates = [];

  // Generate last 90 days
  for (let i = 90; i > 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split("T")[0]);
  }

  return {
    orders: generateOrders(userIds, symbols, dates),
    fills: generateFills(userIds, symbols, dates),
    pnl: generatePnL(userIds, symbols, dates),
    riskMetrics: generateRiskMetrics(userIds, dates),
    marketData: generateMarketData(symbols, dates),
  };
}

function generateOrders(userIds, symbols, dates) {
  const orders = [];
  for (const userId of userIds) {
    for (let i = 0; i < 50; i++) {
      const date = dates[Math.floor(Math.random() * dates.length)];
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);

      orders.push({
        id: `ORD_${userId}_${i}`,
        user_id: userId,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        side: Math.random() > 0.5 ? "BUY" : "SELL",
        quantity: Math.floor(Math.random() * 100) + 1,
        price: (Math.random() * 5000 + 500).toFixed(2),
        status: "FILLED",
        created_at: `${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
        updated_at: `${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      });
    }
  }
  return orders;
}

function generateFills(userIds, symbols, dates) {
  const fills = [];
  for (const userId of userIds) {
    for (let i = 0; i < 50; i++) {
      const date = dates[Math.floor(Math.random() * dates.length)];
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);

      fills.push({
        id: `FILL_${userId}_${i}`,
        order_id: `ORD_${userId}_${i}`,
        user_id: userId,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        filled_qty: Math.floor(Math.random() * 100) + 1,
        fill_price: (Math.random() * 5000 + 500).toFixed(2),
        commission: (Math.random() * 100).toFixed(2),
        created_at: `${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      });
    }
  }
  return fills;
}

function generatePnL(userIds, symbols, dates) {
  const pnl = [];
  for (const userId of userIds) {
    for (const symbol of symbols) {
      for (let i = 0; i < 10; i++) {
        const tradeDate = dates[Math.floor(Math.random() * 60)];
        const closeDate = dates[Math.floor(Math.random() * dates.length)];

        const entry = Math.random() * 5000 + 500;
        const exit = entry * (1 + (Math.random() - 0.5) * 0.1);
        const qty = Math.floor(Math.random() * 50) + 1;
        const pnlAmount = (exit - entry) * qty;
        const returnPct = (((exit - entry) / entry) * 100).toFixed(2);

        pnl.push({
          user_id: userId,
          symbol: symbol,
          entry_price: entry.toFixed(2),
          exit_price: exit.toFixed(2),
          quantity: qty,
          realized_pnl: pnlAmount.toFixed(2),
          percentage_return: returnPct,
          trade_date: tradeDate,
          close_date: closeDate,
        });
      }
    }
  }
  return pnl;
}

function generateRiskMetrics(userIds, dates) {
  const metrics = [];
  for (const userId of userIds) {
    for (const date of dates.slice(0, 30)) {
      metrics.push({
        user_id: userId,
        date: date,
        portfolio_value: (Math.random() * 5000000 + 1000000).toFixed(2),
        var_95: (Math.random() * 100000).toFixed(2),
        sharpe_ratio: (Math.random() * 2).toFixed(2),
        max_drawdown: (Math.random() * 30).toFixed(2),
        win_rate: (Math.random() * 100).toFixed(2),
        avg_win: (Math.random() * 50000).toFixed(2),
        avg_loss: (Math.random() * -50000).toFixed(2),
      });
    }
  }
  return metrics;
}

function generateMarketData(symbols, dates) {
  const data = [];
  for (const symbol of symbols) {
    for (const date of dates) {
      const open = Math.random() * 5000 + 500;
      const close = open * (1 + (Math.random() - 0.5) * 0.05);

      data.push({
        symbol: symbol,
        date: date,
        open: open.toFixed(2),
        high: Math.max(open, close) * (1 + Math.random() * 0.02),
        low: Math.min(open, close) * (1 - Math.random() * 0.02),
        close: close.toFixed(2),
        volume: (Math.random() * 1000000).toFixed(0),
        volatility: (Math.random() * 50).toFixed(2),
      });
    }
  }
  return data;
}

/**
 * Insert data into ClickHouse
 */
async function populateData() {
  const data = generateSampleData();

  try {
    // Insert orders
    console.log("📊 Inserting orders...");
    let orderValues = data.orders
      .map(
        (o) =>
          `('${o.id}', '${o.user_id}', '${o.symbol}', '${o.side}', ${o.quantity}, ${o.price}, '${o.status}', '${o.created_at}', '${o.updated_at}')`,
      )
      .join(",");
    await executeQuery(`INSERT INTO orders VALUES ${orderValues}`);
    console.log(`✅ Inserted ${data.orders.length} orders`);

    // Insert fills
    console.log("📊 Inserting fills...");
    let fillValues = data.fills
      .map(
        (f) =>
          `('${f.id}', '${f.order_id}', '${f.user_id}', '${f.symbol}', ${f.filled_qty}, ${f.fill_price}, ${f.commission}, '${f.created_at}')`,
      )
      .join(",");
    await executeQuery(`INSERT INTO fills VALUES ${fillValues}`);
    console.log(`✅ Inserted ${data.fills.length} fills`);

    // Insert PnL
    console.log("📊 Inserting PnL data...");
    let pnlValues = data.pnl
      .map(
        (p) =>
          `('${p.user_id}', '${p.symbol}', ${p.entry_price}, ${p.exit_price}, ${p.quantity}, ${p.realized_pnl}, ${p.percentage_return}, '${p.trade_date}', '${p.close_date}')`,
      )
      .join(",");
    await executeQuery(`INSERT INTO pnl VALUES ${pnlValues}`);
    console.log(`✅ Inserted ${data.pnl.length} PnL records`);

    // Insert risk metrics
    console.log("📊 Inserting risk metrics...");
    let riskValues = data.riskMetrics
      .map(
        (r) =>
          `('${r.user_id}', '${r.date}', ${r.portfolio_value}, ${r.var_95}, ${r.sharpe_ratio}, ${r.max_drawdown}, ${r.win_rate}, ${r.avg_win}, ${r.avg_loss})`,
      )
      .join(",");
    await executeQuery(`INSERT INTO risk_metrics VALUES ${riskValues}`);
    console.log(`✅ Inserted ${data.riskMetrics.length} risk metrics`);

    // Insert market data
    console.log("📊 Inserting market data...");
    let marketValues = data.marketData
      .map(
        (m) =>
          `('${m.symbol}', '${m.date}', ${m.open}, ${m.high}, ${m.low}, ${m.close}, ${m.volume}, ${m.volatility})`,
      )
      .join(",");
    await executeQuery(`INSERT INTO market_data VALUES ${marketValues}`);
    console.log(`✅ Inserted ${data.marketData.length} market data points`);

    console.log("\n✨ Sample data population complete!");
    console.log(
      "🎉 ClickHouse is ready for analytics queries and chart generation!",
    );
  } catch (err) {
    console.error("❌ Error populating data:", err.message);
    process.exit(1);
  }
}

populateData();
