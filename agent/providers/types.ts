export type ProviderName = 'claude' | 'groq' | 'gemini';
export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type AgentMessage = {
  role: 'user'|'assistant'|'tool'; content: string;
  toolCalls?: ToolCall[]; toolCallId?: string; toolName?: string;
  native?: {provider:ProviderName; parts:unknown[]};
};
export type ToolDefinition = { name:string; description?:string; inputSchema:Record<string,unknown> };
export type CompletionRequest = { system:string; messages:AgentMessage[]; tools:ToolDefinition[]; signal?:AbortSignal };
export type Completion = { text:string; toolCalls:ToolCall[]; native?:AgentMessage['native']; usage:{input:number;output:number}; finishReason?:string };
export type Provider = { name:ProviderName; model:string; complete:(request:CompletionRequest)=>Promise<Completion> };
export type ProviderOptions = { apiKey:string; model:string; fetch?:typeof fetch };
export class ProviderError extends Error {
  constructor(public provider:ProviderName, public status:number, message:string, public retryAfterMs=0) {super(message);this.name='ProviderError';}
}
export async function postJson(name:ProviderName,url:string,headers:Record<string,string>,body:unknown,options:ProviderOptions,signal?:AbortSignal) {
  const response=await (options.fetch || fetch)(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])])});
  const payload=await response.json().catch(()=>({error:{message:'Provider returned an invalid response.'}}));
  if(!response.ok) {
    const delay=response.headers.get('retry-after');const seconds=delay?Number(delay):0;
    const wait=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(delay||'')-Date.now());
    // API error bodies may contain account identifiers. Keep public errors concise.
    const message=response.status===429?'Rate limit reached.':response.status===401||response.status===403?'Provider credentials were rejected.':response.status===400?'Provider rejected the model request.':response.status===404?'Selected model is unavailable.':'Provider request failed.';
    throw new ProviderError(name,response.status,message,Math.min(wait||0,60000));
  }
  return payload;
}
export function argumentsObject(input:unknown):Record<string,unknown> {
  const value=typeof input==='string'?JSON.parse(input):input;
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Model returned invalid tool arguments.');
  return value as Record<string,unknown>;
}
