import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { runTradeLabAgent,recentHistory } from '../agent/tradelab_agent';import { ProviderError,type Provider,type Completion } from '../agent/providers/types';import { conversation } from '../src/lib/runtime/store';
process.env.TRADELAB_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'tradelab-agent-'));process.env.METRIC_STORE_DB_PATH=path.resolve('data/warehouse.duckdb');
const reply=(text:string,calls:Completion['toolCalls']=[]):Completion=>({text,toolCalls:calls,usage:{input:1,output:1}});
test('fallback retains verified MCP results, executes each tool once and persists conversation',async()=>{
 let calls=0,failed=0;const events:{type:string;[key:string]:unknown}[]=[];
 const providers:Provider[]=[{name:'claude',model:'test',async complete(){failed++;throw new ProviderError('claude',401,'Rejected.');}},{name:'groq',model:'test',async complete(req){calls++;if(calls===1)return reply('',[{id:'schema',name:'getSchema',arguments:{}}]);assert.equal(req.messages.at(-1)?.role,'tool');assert.equal(JSON.parse(req.messages.at(-1)!.content).success,true);return reply('The dataset is synthetic.');}}];
 const result=await runTradeLabAgent('Inspect the dataset',undefined,undefined,undefined,undefined,undefined,undefined,{owner:'test-owner',providers,onEvent:e=>events.push(e)});
 assert.equal(failed,1);assert.equal(calls,2);assert.equal(events.filter(e=>e.type==='tool_start').length,1);
 assert.equal(JSON.parse(conversation('test-owner',result!.sessionId).messages).length,2);
 assert.throws(()=>conversation('another-owner',result!.sessionId));
});
test('history trimming preserves whole tool groups',()=>{const history=[{role:'user' as const,content:'old'.repeat(100)},{role:'assistant' as const,content:'',toolCalls:[{id:'a',name:'getSchema',arguments:{}}]},{role:'tool' as const,content:'result',toolCallId:'a'},{role:'user' as const,content:'new'}];assert.deepEqual(recentHistory(history,30),[history[3]]);});
