import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiProvider} from '../agent/providers/gemini';
test('Gemini retains opaque function-call parts across turns and uses native function responses',async()=>{
 const parts=[{functionCall:{name:'getSchema',args:{tables:['risk_profile']}},thoughtSignature:'opaque-signature'}];
 let body:{contents:{parts:unknown[]}[]}={contents:[]};
 const provider=createGeminiProvider({apiKey:'test',model:'gemini-test',fetch:async(_url,init)=>{body=JSON.parse(String(init?.body));assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],'test');return Response.json({candidates:[{content:{parts},finishReason:'STOP'}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:4}});}});
 const first=await provider.complete({system:'s',messages:[{role:'user',content:'risk'}],tools:[]});
 assert.equal(first.toolCalls[0].name,'getSchema');assert.deepEqual(first.native?.parts,parts);
 await provider.complete({system:'s',messages:[{role:'user',content:'risk'},{role:'assistant',content:'',toolCalls:first.toolCalls,native:first.native},{role:'tool',toolName:'getSchema',toolCallId:first.toolCalls[0].id,content:'{"success":true}'}],tools:[]});
 assert.deepEqual(body.contents[1].parts,parts);assert.deepEqual(body.contents[2].parts,[{functionResponse:{name:'getSchema',response:{success:true}}}]);
});
