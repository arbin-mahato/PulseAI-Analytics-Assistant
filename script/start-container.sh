#!/bin/sh
set -eu
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=320}"
mkdir -p "${TRADELAB_DATA_DIR:-/app/data}"
if [ ! -f "${METRIC_STORE_DB_PATH:-${TRADELAB_DATA_DIR:-/app/data}/warehouse.duckdb}" ]; then
  node script/build_db.js
fi
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
