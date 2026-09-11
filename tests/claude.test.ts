import test from 'node:test';
import assert from 'node:assert/strict';
import {createClaudeProvider} from '../agent/providers/claude';
test('Claude sends shared MCP schemas and groups multiple tool results correctly',async()=>{
 let body:{messages:{role:string;content:{type:string}[]}[];tools:unknown[]}={messages:[],tools:[]};
 const provider=createClaudeProvider({apiKey:'test',model:'claude-haiku-4-5',fetch:async(_url,init)=>{body=JSON.parse(String(init?.body));assert.equal((init?.headers as Record<string,string>)['x-api-key'],'test');return Response.json({content:[{type:'text',text:'Verified result'},{type:'tool_use',id:'c3',name:'getSchema',input:{tables:['risk_profile']}}],usage:{input_tokens:15,output_tokens:4}});}});
 const result=await provider.complete({system:'s',messages:[{role:'user',content:'analyze'},{role:'assistant',content:'',toolCalls:[{id:'c1',name:'getSchema',arguments:{}},{id:'c2',name:'getSchema',arguments:{}}]},{role:'tool',toolCallId:'c1',toolName:'getSchema',content:'one'},{role:'tool',toolCallId:'c2',toolName:'getSchema',content:'two'}],tools:[{name:'getSchema',inputSchema:{type:'object'}}]});
 assert.equal(body.messages.length,3);assert.equal(body.messages[2].content.length,2);assert.equal(body.messages[2].content[0].type,'tool_result');assert.equal(result.toolCalls[0].id,'c3');assert.equal(result.text,'Verified result');
});
