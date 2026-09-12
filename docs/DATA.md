# Data and metric definitions

## Included source data

The seed generator (`script/data/seed.py`) creates one reproducible synthetic broker snapshot. All prices, PnL, customers and operational failures are fictional. Equity-like, futures-like and options-like instruments are used to exercise the schema; they are not a licensed exchange feed or a complete derivatives pricing model.

| Raw table | Relationships and purpose |
|---|---|
| analytics.users | One row per client; identity and lifecycle |
| analytics.orders | Order status, requested quantity, price and modifications |
| analytics.trades | Fills tied to orders; matched closing quantity and realized PnL |
| analytics.events | Activity, sessions, deposits/withdrawals, balance snapshots, latency/errors |
| log_aggregator.logs | Application error examples with string name/value arrays |

Partial fills, rejected/cancelled orders, inactive clients and new accounts are included. Non-trading accounts have zero counts and NULL undefined ratios. These cases are deliberate, not missing seed data.

## Metric tables

The seven SQL files under `script/queries` build **106 column occurrences**, including repeated client IDs and timestamps, across these tables:

| Table | Columns | Focus |
|---|---:|---|
| identity_and_lifecycle | 17 | First/last activity, age, engagement and lifecycle |
| trading_frequency | 20 | Counts, active days and frequency windows |
| financial_volume | 12 | Turnover, realized PnL and financial activity |
| behavioral_style | 22 | Product/asset mix, timing and trading style |
| risk_profile | 18 | Win/loss, variability, concentration and margin usage |
| platform_health | 14 | Rejections, order actions, latency and session failures |
| market_health | 3 | Relative market activity and volume ranking |

Canonical formulas are executable SQL. `src/content/db/metrics.json` documents each original column. Original ClickHouse SQL is retained under `script/queries/legacy-clickhouse` for comparison, not used to seed the new warehouse. The rewritten formulas correct observed issues including inconsistent buy/sell labels and rejection counts filtered to completed orders.

Conventions:

- Currency is INR; timestamps are local Asia/Kolkata time in the synthetic source.
- Volume is filled quantity × fill price and counts both buy and sell turnover. It is not profit or account equity.
- Realized PnL uses matched closing fills. Unrealized MTM, transfers and balance snapshots are separate.
- Rates and percentile-style fields are fractions. Multiply by 100 for percentage display.
- Undefined divisions return NULL. Never substitute an invented ratio.
- Snapshot metrics use the fixed `dataset_info.as_of` timestamp, accessible as DuckDB `as_of()`.
- Raw generated monetary values use floating-point columns; display rounded currency. For real accounting, adopt fixed-decimal amounts and a reconciled ledger.

The seed tests independently recalculate raw totals and verify fill/order links, schema coverage, population, rate bounds and reproducibility. These checks establish internal consistency; they do not validate the original business's undocumented metric assumptions.

## Optional ClickHouse

DuckDB is the default replacement for ClickHouse and needs no account. It is suitable for this single-server demo. SQLite stores application state, not the analytical warehouse.

To keep ClickHouse for raw activity while retaining local DuckDB metric tables:

```sh
docker compose --profile clickhouse up -d clickhouse
npm run seed:clickhouse
```

The loader copies the **same** raw snapshot used to calculate local metrics. It verifies row counts, skips an exact existing snapshot and refuses to overwrite pre-existing tables. It does not silently use the ClickHouse credentials in `.env.local`.

Set the app configuration and restart:

```dotenv
ANALYTICS_BACKEND=clickhouse
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=tradelab
CLICKHOUSE_PASSWORD=local-demo-only
```

If the app runs inside Compose, use `http://clickhouse:8123`. The sample password is only for a local instance bound to localhost. In production, use a dedicated read-only ClickHouse user for the app.

Remote demo seeding requires an explicit URL and `--allow-remote`, plus `CLICKHOUSE_SEED_USER` / `CLICKHOUSE_SEED_PASSWORD` in the shell environment. Use a fresh dedicated instance. An interrupted seed may leave partial tables; inspect them and use a fresh demo instance rather than overwriting anything automatically. This loader is for the included synthetic snapshot, not importing production brokerage data.

## Where real data can come from

To reproduce original numbers you need authorized exports from the original brokerage: users, orders, executions, funds/ledger events, app sessions, error/latency events, timestamps and metric definitions. Public stock-price datasets cannot supply private customer PnL, rejection rates, sessions or account behavior.

Exchange/vendor market data or your own broker exports can later add real prices/activity where licensing permits. The import mapping, timezone, corporate-action treatment, fees, fill matching, ledger reconciliation and metric rebuild must be defined before replacing the demo. No public dataset can honestly substitute for all the private inputs in this project.

PostgreSQL can replace DuckDB/ClickHouse with SQL rewrites, indexes and a metric refresh job. It is not a configuration-only swap. ClickHouse remains useful for much larger event volumes; DuckDB is the simplest self-contained starting point here.
