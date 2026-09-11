import { warehousePath } from '../runtime/config';
import { pythonJson } from '../runtime/process';
import metrics from '../../content/db/metrics.json';

export type QueryResult = { columns: { name: string; type: string }[]; rows: Record<string, unknown>[]; row_count: number };
export type SchemaResult = { columns: { schema: string; table: string; column: string; type: string }[]; dataset: Record<string, unknown> };
export function localSchema(signal?: AbortSignal) { return pythonJson<SchemaResult>('query.py', { action: 'schema', database_path: warehousePath() }, signal); }
export async function executeQuery(database: string, query: string, signal?: AbortSignal): Promise<QueryResult> {
  if (!['metric_store','analytics','log_aggregator'].includes(database)) throw new Error('Select metric_store, analytics, or log_aggregator.');
  if (database !== 'metric_store' && process.env.ANALYTICS_BACKEND === 'clickhouse') {
    const validated = await pythonJson<{query: string}>('query.py', { action:'validate', dialect:'clickhouse', query }, signal);
    const url = process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
    if (!url) throw new Error('ClickHouse is selected but CLICKHOUSE_URL is not configured.');
    const {createClient}=await import('@clickhouse/client');
    const client = createClient({ url, username:process.env.CLICKHOUSE_USER || 'default', password:process.env.CLICKHOUSE_PASSWORD, database, request_timeout:30000 });
    try {
      const result = await client.query({ query:validated.query, format:'JSON', abort_signal:signal, clickhouse_settings:{ readonly:'1', max_execution_time:20, max_result_rows:'10000', result_overflow_mode:'throw', max_memory_usage:'268435456' } });
      const data = await result.json<{meta:{name:string;type:string}[];data:Record<string,unknown>[]}>();
      if(!data.meta)throw new Error('ClickHouse did not return column metadata.');
      return { columns:data.meta, rows:data.data, row_count:data.data.length };
    } finally { await client.close(); }
  }
  return pythonJson<QueryResult>('query.py', { database_path:warehousePath(), query, max_rows:10000 }, signal);
}
export async function schemaFor(tables?: string[], signal?: AbortSignal) {
  const schema = await localSchema(signal);
  if (process.env.ANALYTICS_BACKEND === 'clickhouse') {
    const url=process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_HOST;
    if(!url) throw new Error('ClickHouse is selected but not configured.');
    const {createClient}=await import('@clickhouse/client');
    const client=createClient({url,username:process.env.CLICKHOUSE_USER || 'default',password:process.env.CLICKHOUSE_PASSWORD});
    try {
      const res=await client.query({query:"SELECT database AS schema, table AS table, name AS column, type AS type FROM system.columns WHERE database IN ('analytics','log_aggregator') ORDER BY database,table,position",format:'JSONEachRow',abort_signal:signal});
      schema.columns=[...schema.columns.filter(c=>c.schema==='main'),...await res.json<SchemaResult['columns'][number]>()];
    } finally {await client.close();}
  }
  const groups = new Map<string, SchemaResult['columns']>();
  for (const col of schema.columns) {
    const name = col.schema === 'main' ? col.table : `${col.schema}.${col.table}`;
    groups.set(name,[...(groups.get(name)||[]),col]);
  }
  return { dataset:schema.dataset, dialect:process.env.ANALYTICS_BACKEND==='clickhouse'?'metric_store: DuckDB; analytics/log_aggregator: ClickHouse':'DuckDB for all databases',
    tables:Array.from(groups,([table,columns]) => ({ table,database:columns[0].schema==='main'?'metric_store':columns[0].schema,
      ...(tables?.includes(table) || tables?.includes(table.split('.').pop()!) ? {columns:columns.map(c=>({name:c.column,type:c.type,description:(metrics as Record<string,{name:string;description:string}[]>)[c.table]?.find(m=>m.name===c.column)?.description}))} : {column_count:columns.length}) })),
    instructions:'Call getSchema with the specific table names to retrieve columns. Join on client_id; trades join orders on order_id. Money is INR. Rate/percentile fields are fractions 0–1, multiply by 100 for display. Counts are numbers. NULL means unavailable, not zero. Use the dataset as_of date for windows; data is synthetic. as_of() exists in DuckDB.' };
}
