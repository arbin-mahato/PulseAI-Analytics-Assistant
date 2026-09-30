"""Reproducible synthetic broker activity. No real customer or market data."""

import argparse, datetime as dt, hashlib, json, os, random, tempfile
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = {
    "analytics.users": {
        "client_id": "VARCHAR",
        "name": "VARCHAR",
        "email": "VARCHAR",
        "created_at": "TIMESTAMP",
        "last_seen": "TIMESTAMP",
    },
    "analytics.orders": {
        "order_id": "VARCHAR",
        "client_id": "VARCHAR",
        "_timestamp": "TIMESTAMP",
        "modified_at": "TIMESTAMP",
        "login_id": "VARCHAR",
        "status": "VARCHAR",
        "order_details": "JSON",
        "symbol": "VARCHAR",
        "asset_class": "VARCHAR",
        "side": "VARCHAR",
        "quantity": "DOUBLE",
        "price": "DOUBLE",
        "order_type": "VARCHAR",
        "product_type": "VARCHAR",
        "previous_price": "DOUBLE",
        "is_modified": "BOOLEAN",
        "filled_quantity": "DOUBLE",
    },
    "analytics.trades": {
        "trade_id": "VARCHAR",
        "order_id": "VARCHAR",
        "client_id": "VARCHAR",
        "_timestamp": "TIMESTAMP",
        "trade_details": "JSON",
        "symbol": "VARCHAR",
        "asset_class": "VARCHAR",
        "side": "VARCHAR",
        "quantity": "DOUBLE",
        "price": "DOUBLE",
        "realized_pnl": "DOUBLE",
        "holding_seconds": "DOUBLE",
        "closed_quantity": "DOUBLE",
    },
    "analytics.events": {
        "event_id": "VARCHAR",
        "client_id": "VARCHAR",
        "_timestamp": "TIMESTAMP",
        "event_name": "VARCHAR",
        "session_id": "VARCHAR",
        "platform": "VARCHAR",
        "ip_address": "VARCHAR",
        "app_version": "VARCHAR",
        "event_data": "JSON",
        "http_url": "VARCHAR",
        "http_status": "INTEGER",
        "http_duration_ms": "DOUBLE",
        "text": "VARCHAR",
        "deposit": "DOUBLE",
        "withdraw": "DOUBLE",
        "blocked_margin": "DOUBLE",
        "opening_cash": "DOUBLE",
        "realized_mtm": "DOUBLE",
        "unrealized_mtm": "DOUBLE",
    },
    "log_aggregator.logs": {
        "_timestamp": "TIMESTAMP",
        "service": "VARCHAR",
        "string_names": "VARCHAR[]",
        "string_values": "VARCHAR[]",
    },
}


def create_fixture(seed=42, users=100, as_of=None):
    rng = random.Random(seed)
    anchor = dt.datetime.fromisoformat(as_of or dt.date.today().isoformat()).replace(
        hour=23, minute=59, second=59
    )
    rows = {k: [] for k in SCHEMAS}
    symbols = [
        ("RELIANCE", "EQUITY", 2500),
        ("TCS", "EQUITY", 3800),
        ("INFY", "EQUITY", 1600),
        ("HDFCBANK", "EQUITY", 1500),
        ("SBIN", "EQUITY", 750),
        ("NIFTY-OPT", "OPTIONS", 200),
        ("BANKNIFTY-FUT", "FUTURES", 48000),
    ]
    # Deliberately fictional identities. They give charts and reports credible labels
    # without using a real person's trading information.
    first_names = [
        "Aarav", "Aditi", "Ananya", "Arjun", "Dev", "Diya", "Ishaan", "Isha",
        "Kabir", "Kavya", "Kiran", "Meera", "Neel", "Nisha", "Pranav", "Priya",
        "Rahul", "Rhea", "Rohan", "Sana", "Siddharth", "Simran", "Tanvi", "Varun",
        "Ved", "Zoya",
    ]
    last_names = [
        "Bansal", "Chopra", "Desai", "Gupta", "Iyer", "Jain", "Kapoor", "Mehta",
        "Nair", "Patel", "Reddy", "Shah", "Singh", "Verma",
    ]

    def add(table, **row):
        rows[table].append(row)

    for i in range(users):
        cid = f"INB-24-{100001 + i}"
        name = f"{first_names[i % len(first_names)]} {last_names[(i // len(first_names)) % len(last_names)]}"
        inactive = i % 13 == 0
        new = i % 17 == 0
        busy = i % 9 == 0
        start = anchor - dt.timedelta(days=20 if new else 400 + rng.randrange(90))
        seen = anchor - dt.timedelta(days=65 if inactive else rng.randrange(3))
        add(
            "analytics.users",
            client_id=cid,
            name=name,
            email=f"{name.lower().replace(' ', '.')}@accounts.invalid",
            created_at=start,
            last_seen=seen,
        )
        if inactive:
            continue
        lifetime = min(400, (anchor - start).days)
        realized = []
        for j in range(200 if busy else 90):
            ago = rng.randrange(1, max(lifetime, 2))
            day = anchor - dt.timedelta(days=ago)
            while day.weekday() > 4:
                day -= dt.timedelta(days=1)
            if day < start:
                continue
            opened = day.replace(
                hour=9 + rng.randrange(6),
                minute=rng.randrange(30),
                second=rng.randrange(45),
            )
            symbol, asset, base = symbols[
                (i % len(symbols)) if i % 7 == 0 else rng.randrange(len(symbols))
            ]
            price = round(base * (1 + rng.uniform(-0.08, 0.08)), 2)
            qty = float(rng.randrange(1, 20) * (1 if asset != "EQUITY" else 10))
            overnight = j % 7 == 0
            closed = opened + dt.timedelta(
                seconds=rng.randrange(60, 12000), days=1 if overnight else 0
            )
            while closed.weekday() > 4:
                closed += dt.timedelta(days=1)
            if closed >= anchor:
                closed = anchor - dt.timedelta(minutes=10)
            pnl_bias = 0.012 if i % 4 == 0 else -0.012 if i % 4 == 1 else 0
            exit_price = round(price * (1 + pnl_bias + rng.uniform(-0.025, 0.025)), 2)
            status = rng.choices(
                ["COMPLETE", "CANCEL_CONFIRMED", "REJECTED", "PARTIAL"], [80, 8, 7, 5]
            )[0]
            filled = (
                qty
                if status == "COMPLETE"
                else max(1, qty // 2) if status == "PARTIAL" else 0
            )
            for side, when, value, q, st in [
                ("BUY", opened, price, qty, status),
                ("SELL", closed, exit_price, filled, "COMPLETE"),
            ]:
                if side == "SELL" and not filled:
                    continue
                oid = f"{cid}-{j:04d}-{side}"
                modified = j % 5 == 0
                order_type = (
                    "STOP" if j % 8 == 0 else "MARKET" if j % 3 == 0 else "LIMIT"
                )
                order = {
                    "price": value,
                    "quantity": q,
                    "side": 1 if side == "BUY" else 2,
                    "type": order_type,
                    "prodType": "DELIVERY" if overnight else "INTRADAY",
                    "prevModifyPrice": round(value * 0.999, 2),
                    "description": {"tradingSymbol": symbol, "instrumentName": asset},
                }
                add(
                    "analytics.orders",
                    order_id=oid,
                    client_id=cid,
                    _timestamp=when,
                    modified_at=when + dt.timedelta(seconds=20 if modified else 5),
                    login_id=f"{cid}-{when.date()}",
                    status=st,
                    order_details=json.dumps(order),
                    symbol=symbol,
                    asset_class=asset,
                    side=side,
                    quantity=q,
                    price=value,
                    order_type=order_type,
                    product_type=order["prodType"],
                    previous_price=order["prevModifyPrice"],
                    is_modified=modified,
                    filled_quantity=filled,
                )
                if filled:
                    pnl = (
                        round((exit_price - price) * filled, 2) if side == "SELL" else 0
                    )
                    add(
                        "analytics.trades",
                        trade_id=oid + "-F",
                        order_id=oid,
                        client_id=cid,
                        _timestamp=when + dt.timedelta(seconds=30),
                        trade_details=json.dumps({"OriginalVol": filled}),
                        symbol=symbol,
                        asset_class=asset,
                        side=side,
                        quantity=filled,
                        price=value,
                        realized_pnl=pnl,
                        holding_seconds=(
                            (closed - opened).total_seconds() if side == "SELL" else 0
                        ),
                        closed_quantity=filled if side == "SELL" else 0,
                    )
                    if side == "SELL":
                        realized.append((when, pnl))
        deposit = 100000.0
        withdraw = 0.0
        for ago in range(lifetime, 0, -1):
            when = (anchor - dt.timedelta(days=ago)).replace(
                hour=10 + i % 5, minute=0, second=0
            )
            if when < start:
                continue
            if ago % 29 == 0:
                deposit += 5000
            if ago % 71 == 0:
                withdraw += 2000
            pnl = sum(v for t, v in realized if t <= when)
            balance = deposit - withdraw + pnl
            result = {
                "deposit": deposit,
                "withdraw": withdraw,
                "blocked_margin": max(0, balance * 0.2),
                "opening_cash": 0.0,
                "realized_mtm": pnl,
                "unrealized_mtm": 100.0 if ago % 7 == 0 else 0.0,
            }
            for n in range(2 if ago % 10 == 0 else 5):
                url = [
                    "/user/funds/margins",
                    "/api/v1/dashboard/pins",
                    "/orders",
                    "/orders",
                    "/orders",
                ][n]
                text = ["", "", "Portfolio", "Orders", ""][n]
                kind = "Click" if text else "HTTP Request"
                status = 429 if i % 11 == 0 and n == 1 else 200
                duration = 800.0 if i % 11 == 0 else 80.0 + rng.randrange(80)
                payload = {
                    "http_url": url,
                    "http_status": str(status),
                    "http_duration_ms": duration,
                    "text": text,
                    "http_response_preview": json.dumps({"result": result}),
                }
                add(
                    "analytics.events",
                    event_id=f"{cid}-{ago}-{n}",
                    client_id=cid,
                    _timestamp=when + dt.timedelta(minutes=n * 3),
                    event_name=kind,
                    session_id=f"{cid}-{ago}",
                    platform="web" if (i + n) % 3 else "android",
                    ip_address=f"192.0.2.{1+i%250}",
                    app_version="3.0.0",
                    event_data=json.dumps(payload),
                    http_url=url,
                    http_status=status,
                    http_duration_ms=duration,
                    text=text,
                    **result,
                )
        if i % 4 == 0:
            add(
                "log_aggregator.logs",
                _timestamp=seen,
                service="auth",
                string_names=["msg"],
                string_values=["Token expired"],
            )
    return anchor, rows


def build(output, seed=42, users=100, as_of=None):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    anchor, rows = create_fixture(seed, users, as_of)
    staging = output.with_name(output.name + ".building")
    if staging.exists():
        staging.unlink()
    db = duckdb.connect(str(staging))
    db.execute("SET threads=1")
    db.execute("SET max_memory='128MB'")
    try:
        for schema in ["analytics", "log_aggregator", "metric_helpers"]:
            db.execute(f"CREATE SCHEMA {schema}")
        for table, cols in SCHEMAS.items():
            db.execute(
                f"CREATE TABLE {table} ("
                + ", ".join(f'"{k}" {v}' for k, v in cols.items())
                + ")"
            )
            if rows[table]:
                # JSON import is much faster than individual Python-to-DuckDB inserts.
                with tempfile.NamedTemporaryFile(
                    mode="w", suffix=".jsonl", delete=False
                ) as f:
                    temp = Path(f.name)
                    for row in rows[table]:
                        f.write(json.dumps(row, default=str) + "\n")
                try:
                    db.execute(
                        f"INSERT INTO {table} SELECT * FROM read_json_auto(?, maximum_object_size=16777216)",
                        [str(temp)],
                    )
                finally:
                    temp.unlink()
        db.execute(f"CREATE MACRO as_of() AS TIMESTAMP '{anchor.isoformat(sep=' ')}'")
        db.execute(
            "CREATE TABLE dataset_info (seed INTEGER, as_of TIMESTAMP, synthetic BOOLEAN, currency VARCHAR, timezone VARCHAR, users INTEGER, version VARCHAR)"
        )
        db.execute(
            "INSERT INTO dataset_info VALUES (?, ?, true, ?, ?, ?, ?)",
            [seed, anchor, "INR", "Asia/Kolkata", users, "synthetic-broker-v2"],
        )
        db.execute(
            "CREATE VIEW metric_helpers.daily AS SELECT client_id, CAST(_timestamp AS DATE) AS day, sum(realized_pnl) pnl, sum(quantity*price) volume, count(*) trades FROM analytics.trades GROUP BY 1,2"
        )
        db.execute(
            "CREATE VIEW metric_helpers.sessions30 AS SELECT client_id, session_id, min(_timestamp) started, date_diff('minute', min(_timestamp), max(_timestamp)) duration, count(*) events, count(*) FILTER(WHERE event_name='HTTP Request') requests FROM analytics.events WHERE _timestamp >= as_of()-INTERVAL '30 days' GROUP BY 1,2"
        )
        db.execute(
            "CREATE VIEW metric_helpers.symbol90 AS SELECT client_id,symbol,sum(quantity*price) volume FROM analytics.trades WHERE _timestamp >= as_of()-INTERVAL '90 days' GROUP BY 1,2"
        )
        for query in sorted((ROOT / "script/queries").glob("[1-7]_*.sql")):
            db.execute(query.read_text())
        expected = json.loads((ROOT / "src/content/db/metrics.json").read_text())
        for table, columns in expected.items():
            actual = [r[0] for r in db.execute(f"DESCRIBE {table}").fetchall()]
            assert set(actual) == {c["name"] for c in columns}, (table, actual)
            assert db.execute(
                f"SELECT count(*),count(DISTINCT client_id) FROM {table}"
            ).fetchone() == (users, users), table
        assert (
            db.execute(
                "SELECT count(*) FROM analytics.trades t LEFT JOIN analytics.orders o USING(order_id) WHERE o.order_id IS NULL"
            ).fetchone()[0]
            == 0
        )
        assert (
            db.execute(
                "SELECT count(*) FROM trading_frequency WHERE trade_count_1d>trade_count_7d OR trade_count_7d>trade_count_30d OR trade_count_30d>trade_count_90d"
            ).fetchone()[0]
            == 0
        )
        db.execute("CHECKPOINT")
    finally:
        db.close()
    os.replace(staging, output)
    manifest = {
        "seed": seed,
        "as_of": anchor.isoformat(),
        "synthetic": True,
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "version": "synthetic-broker-v2",
        "tables": {k: len(v) for k, v in rows.items()},
        "metric_tables": {k: users for k in expected},
        "schema": SCHEMAS,
    }
    output.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    print(json.dumps({k: v for k, v in manifest.items() if k != "schema"}, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=str(ROOT / "data/warehouse.duckdb"))
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--users", type=int, default=100)
    p.add_argument("--as-of", default=None)
    a = p.parse_args()
    assert 2 <= a.users <= 1000, "users must be between 2 and 1000"
    build(a.output, a.seed, a.users, a.as_of)
