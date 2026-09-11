import {randomUUID} from 'node:crypto';
import {type Provider,type ProviderOptions,postJson,argumentsObject} from './types';
export function createGeminiProvider(options:ProviderOptions):Provider {
 return {name:'gemini',model:options.model,async complete(request){
  const contents:{role:'user'|'model';parts:unknown[]}[]=[];
  for(const message of request.messages) {
   const role=message.role==='assistant'?'model':'user';
   let parts:unknown[];
   if(message.role==='tool') {
    let response:unknown;try {response=JSON.parse(message.content);}catch {response={result:message.content};}
    parts=[{functionResponse:{name:message.toolName,...(message.toolCallId?.startsWith('gemini_generated_')?{}:{id:message.toolCallId}),response}}];
   } else if(message.native?.provider==='gemini') {
    // Preserve all opaque response parts (including thought signatures) verbatim.
    parts=message.native.parts;
   } else parts=[...(message.content?[{text:message.content}]:[]),...(message.toolCalls||[]).map(c=>({functionCall:{id:c.id,name:c.name,args:c.arguments}}))];
   if(!parts.length)continue;
   if(contents.at(-1)?.role===role)contents.at(-1)!.parts.push(...parts);else contents.push({role,parts});
  }
  const result=await postJson('gemini',`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,{'x-goog-api-key':options.apiKey},{systemInstruction:{parts:[{text:request.system}]},contents,tools:[{functionDeclarations:request.tools.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.inputSchema}))}],generationConfig:{maxOutputTokens:4096}},options,request.signal);
  const candidate=result.candidates?.[0];const parts=candidate?.content?.parts as {text?:string;thought?:boolean;functionCall?:{id?:string;name:string;args:unknown}}[];
  if(!Array.isArray(parts))throw new Error('Gemini returned no completion.');
  return {text:parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('\n'),toolCalls:parts.filter(p=>p.functionCall).map(p=>({id:p.functionCall!.id||`gemini_generated_${randomUUID()}`,name:p.functionCall!.name,arguments:argumentsObject(p.functionCall!.args)})),native:{provider:'gemini',parts},usage:{input:result.usageMetadata?.promptTokenCount||0,output:(result.usageMetadata?.candidatesTokenCount||0)+(result.usageMetadata?.thoughtsTokenCount||0)},finishReason:candidate.finishReason};
 }};
}
