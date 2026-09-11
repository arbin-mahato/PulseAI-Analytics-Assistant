import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectMcp, type ToolOutput } from '../mcp_servers/tradelab_mcp_server';
import { createRun } from '../src/lib/runtime/store';

process.env.METRIC_STORE_DB_PATH=path.resolve('data/warehouse.duckdb');
process.env.TRADELAB_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'tradelab-mcp-'));
process.env.ANALYTICS_BACKEND='duckdb';
test('all seven tools execute through actual MCP, including charts and PDFs without Claude',async()=>{
  const ctx=createRun('test-owner','test-conversation');const mcp=await connectMcp(ctx);
  const call=async(name:string,args:Record<string,unknown>)=>{
    const result=await mcp.client.callTool({name,arguments:args});
    return result.structuredContent as unknown as ToolOutput & {data:Record<string,unknown>};
  };
  try {
    assert.deepEqual((await mcp.client.listTools()).tools.map(t=>t.name).sort(),['getSchema','sql_query_writer','sql_query_executor','json_sql_query_executor','python_script_writer','python_script_executor','pdfGenerator'].sort());
    const schema=await call('getSchema',{tables:['financial_volume']});assert.equal(schema.success,true);
    const denied=await call('sql_query_writer',{database:'metric_store',query:'DELETE FROM financial_volume'});assert.equal(denied.success,false);
    const written=await call('sql_query_writer',{database:'metric_store',query:'SELECT client_id,total_volume_30d FROM financial_volume ORDER BY total_volume_30d DESC LIMIT 5'});assert.equal(written.success,true, written.error);
    const json=await call('json_sql_query_executor',{file_path:written.data.file_path});assert.equal(json.success,true,json.error);assert.equal(json.data.row_count,5);
    const csv=await call('sql_query_executor',{file_path:written.data.file_path});assert.equal(csv.success,true,csv.error);
    const source='from tradelab_analysis import run\nrun('+JSON.stringify({data_file:json.data.file_path,chart:'bar',x:'client_id',y:'total_volume_30d',title:'Trading volume (₹)'})+')';
    const script=await call('python_script_writer',{script_content:source});assert.equal(script.success,true,script.error);
    const chart=await call('python_script_executor',{script_path:script.data.file_path});assert.equal(chart.success,true,chart.error);assert.equal(chart.artifacts?.[0].mime,'image/png');
    const pdf=await call('pdfGenerator',{content:'# Test report\nVerified amount: ₹1,000\n\n| Metric | Value |\n|---|---|\n| Volume | ₹1,000 |',image_ids:[chart.artifacts![0].id]});assert.equal(pdf.success,true,pdf.error);assert.ok(pdf.artifacts![0].size>1000);
    assert.equal((await call('python_script_writer',{script_content:'import os\nos.system("echo unsafe")'})).success,false);
  } finally {await mcp.close();}
});
