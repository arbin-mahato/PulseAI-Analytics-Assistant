"""Read-only, bounded SQL. No model SQL can access files/network/extensions."""

import datetime, decimal, json, math, sys
import duckdb, sqlglot
from sqlglot import exp

ALLOWED_SCHEMAS = {"main", "analytics", "log_aggregator"}
ALLOWED_TABLES = {
    "identity_and_lifecycle",
    "trading_frequency",
    "financial_volume",
    "behavioral_style",
    "risk_profile",
    "platform_health",
    "market_health",
    "dataset_info",
    "users",
    "orders",
    "trades",
    "events",
    "logs",
}
FORBIDDEN_FUNCTIONS = {
    "read_csv",
    "read_csv_auto",
    "read_json",
    "read_json_auto",
    "read_json_objects",
    "read_ndjson",
    "read_parquet",
    "parquet_scan",
    "csv_scan",
    "sqlite_scan",
    "postgres_scan",
    "mysql_scan",
    "http_get",
    "url",
    "file",
    "s3",
    "remote",
    "remoteSecure",
    "readfile",
    "glob",
    "query",
    "query_table",
    "getenv",
    "current_setting",
    "duckdb_settings",
    "duckdb_secrets",
    "duckdb_extensions",
}


def validate(sql, dialect="duckdb"):
    if not isinstance(sql, str) or len(sql) > 20000:
        raise ValueError("SQL must be a string of at most 20000 characters.")
    parsed = sqlglot.parse(sql, read=dialect)
    if len(parsed) != 1 or not isinstance(parsed[0], exp.Query):
        raise ValueError("Only one read-only SELECT or WITH query is allowed.")
    tree = parsed[0]
    for node in tree.walk():
        if isinstance(
            node,
            (
                exp.Insert,
                exp.Update,
                exp.Delete,
                exp.Create,
                exp.Drop,
                exp.Command,
                exp.Copy,
                exp.Into,
                exp.Merge,
            ),
        ):
            raise ValueError("Only read-only analytics are allowed.")
        if isinstance(node, exp.Func):
            name = node.name if isinstance(node, exp.Anonymous) else node.sql_name()
            if name.lower() in {
                x.lower() for x in FORBIDDEN_FUNCTIONS
            } or name.lower().startswith(("read_", "duckdb_", "pragma_")):
                raise ValueError("External data and system functions are disabled.")
    ctes = {n.alias_or_name for n in tree.find_all(exp.CTE)}
    for table in tree.find_all(exp.Table):
        if not isinstance(table.this, exp.Identifier):
            raise ValueError("Table functions are disabled.")
        if table.catalog or (table.db and table.db not in ALLOWED_SCHEMAS):
            raise ValueError("Database is not permitted.")
        if table.name not in ALLOWED_TABLES and table.name not in ctes:
            raise ValueError("Table is not permitted: " + table.name)
    return tree.sql(dialect=dialect)


def safe(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, int) and abs(value) > 9007199254740991:
        return str(value)
    if isinstance(value, dict):
        return {k: safe(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [safe(v) for v in value]
    return value


def execute(request):
    if request.get("action") == "validate":
        return {"query": validate(request["query"], request.get("dialect", "duckdb"))}
    db = duckdb.connect(
        request["database_path"],
        read_only=True,
        config={
            "enable_external_access": "false",
            "threads": "1",
            "memory_limit": "128MB",
        },
    )
    try:
        if request.get("action") == "schema":
            schema = db.execute(
                "SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_schema IN ('main','analytics','log_aggregator') ORDER BY table_schema,table_name,ordinal_position"
            ).fetchall()
            return {
                "columns": [
                    dict(zip(["schema", "table", "column", "type"], r)) for r in schema
                ],
                "dataset": dict(
                    zip(
                        [
                            "seed",
                            "as_of",
                            "synthetic",
                            "currency",
                            "timezone",
                            "users",
                            "version",
                        ],
                        safe(db.execute("SELECT * FROM dataset_info").fetchone()),
                    )
                ),
            }
        sql = validate(request["query"])
        db.execute(sql)
        columns = [{"name": c[0], "type": str(c[1])} for c in db.description]
        maximum = min(10000, max(1, int(request.get("max_rows", 10000))))
        rows = db.fetchmany(maximum + 1)
        if len(rows) > maximum:
            raise ValueError(
                f"Result exceeds {maximum} rows. Aggregate the data or add a LIMIT."
            )
        names = [c["name"] for c in columns]
        return {
            "columns": columns,
            "rows": [dict(zip(names, safe(r))) for r in rows],
            "row_count": len(rows),
        }
    finally:
        db.close()


if __name__ == "__main__":
    try:
        print(json.dumps(execute(json.load(sys.stdin)), allow_nan=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
