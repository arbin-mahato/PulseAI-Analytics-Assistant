"""Copy the SAME linked synthetic snapshot to an empty ClickHouse instance.
Never reads .env credentials or touches a remote target without explicit flags.
"""

import argparse, base64, datetime, hashlib, json, os, sys, urllib.request, urllib.parse
from pathlib import Path
import duckdb


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://localhost:8123")
    p.add_argument(
        "--warehouse",
        default=str(Path(__file__).resolve().parents[2] / "data/warehouse.duckdb"),
    )
    p.add_argument("--allow-remote", action="store_true")
    a = p.parse_args()
    url = urllib.parse.urlparse(a.url)
    if url.scheme not in {"http", "https"} or url.username or url.password:
        raise ValueError("Use an HTTP(S) URL without embedded credentials.")
    if url.hostname not in {"localhost", "127.0.0.1", "::1"} and not a.allow_remote:
        raise ValueError(
            "Remote seeding requires --allow-remote and an empty, dedicated demo database."
        )
    user = os.environ.get("CLICKHOUSE_SEED_USER", "tradelab")
    password = os.environ.get("CLICKHOUSE_SEED_PASSWORD", "local-demo-only")
    auth = base64.b64encode((user + ":" + password).encode()).decode()

    def query(sql, body=None):
        target = (
            a.url.rstrip("/") + "/?" + urllib.parse.urlencode({"query": sql})
            if body is not None
            else a.url
        )
        req = urllib.request.Request(
            target,
            data=body if body is not None else sql.encode(),
            headers={"Authorization": "Basic " + auth},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.read().decode()

    con = duckdb.connect(a.warehouse, read_only=True)
    tables = [
        "analytics.users",
        "analytics.orders",
        "analytics.trades",
        "analytics.events",
        "log_aggregator.logs",
    ]
    if not con.execute("SELECT synthetic FROM dataset_info").fetchone()[0]:
        raise ValueError("This loader is only for the synthetic demo snapshot.")
    fingerprint = hashlib.sha256(Path(a.warehouse).read_bytes()).hexdigest()
    for database in ["analytics", "log_aggregator"]:
        query("CREATE DATABASE IF NOT EXISTS " + database)
    exists = query("EXISTS TABLE analytics._tradelab_seed").strip() == "1"
    if exists:
        saved = query(
            "SELECT fingerprint FROM analytics._tradelab_seed FORMAT TabSeparated"
        ).strip()
        if saved == fingerprint:
            for table in tables:
                if (
                    int(query("SELECT count() FROM " + table))
                    != con.execute("SELECT count(*) FROM " + table).fetchone()[0]
                ):
                    raise ValueError(
                        "The existing demo has changed. Use a fresh database for reseeding."
                    )
            print("This exact snapshot is already seeded.")
            return
        raise ValueError(
            "A different demo snapshot already exists. Use a fresh ClickHouse volume; existing data is preserved."
        )
    # Preflight ALL tables before writing; never replace existing user tables.
    for table in tables:
        if query("EXISTS TABLE " + table).strip() == "1":
            raise ValueError(
                "Table already exists: "
                + table
                + ". Choose a fresh, dedicated ClickHouse instance."
            )
    mappings = {
        "VARCHAR": "String",
        "JSON": "String",
        "DOUBLE": "Float64",
        "FLOAT": "Float32",
        "BIGINT": "Int64",
        "INTEGER": "Int32",
        "BOOLEAN": "Bool",
        "TIMESTAMP": "DateTime64(6, 'Asia/Kolkata')",
        "VARCHAR[]": "Array(String)",
    }
    for table in tables:
        columns = con.execute("DESCRIBE " + table).fetchall()
        defs = []
        for name, kind, *_ in columns:
            typ = mappings[kind]
            defs.append(
                "`"
                + name
                + "` "
                + (typ if typ.startswith("Array(") else "Nullable(" + typ + ")")
            )
        query(
            "CREATE TABLE "
            + table
            + " ("
            + ", ".join(defs)
            + ") ENGINE=MergeTree ORDER BY tuple()"
        )
        cursor = con.execute("SELECT * FROM " + table)
        count = 0
        while True:
            rows = cursor.fetchmany(1000)
            if not rows:
                break

            def encode(value):
                return (
                    value.isoformat(sep=" ")
                    if isinstance(value, datetime.datetime)
                    else (
                        value.isoformat() if isinstance(value, datetime.date) else value
                    )
                )

            body = (
                "\n".join(
                    json.dumps(
                        {col[0]: encode(value) for col, value in zip(columns, row)},
                        allow_nan=False,
                    )
                    for row in rows
                )
                + "\n"
            )
            query("INSERT INTO " + table + " FORMAT JSONEachRow", body.encode())
            count += len(rows)
        actual = int(query("SELECT count() FROM " + table))
        if actual != count:
            raise ValueError("Row verification failed for " + table)
        print(table + ": " + str(count) + " verified rows")
    query("CREATE TABLE analytics._tradelab_seed (fingerprint String) ENGINE=TinyLog")
    query(
        "INSERT INTO analytics._tradelab_seed FORMAT JSONEachRow",
        json.dumps({"fingerprint": fingerprint}).encode(),
    )
    print(
        "ClickHouse raw tables and local metrics now use the same synthetic snapshot."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Seeding failed: " + str(error), file=sys.stderr)
        sys.exit(1)
