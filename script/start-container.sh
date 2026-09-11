#!/bin/sh
set -eu
mkdir -p "${TRADELAB_DATA_DIR:-/app/data}"
if [ ! -f "${METRIC_STORE_DB_PATH:-${TRADELAB_DATA_DIR:-/app/data}/warehouse.duckdb}" ]; then
  node script/build_db.js
fi
exec node server.js
