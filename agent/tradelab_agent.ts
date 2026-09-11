import { randomUUID } from 'node:crypto';
import { connectMcp, type ToolOutput, type ToolArtifact } from '../mcp_servers/tradelab_mcp_server';
import { conversation, createRun, lockConversation, saveConversation, unlockConversation } from '../src/lib/runtime/store';
import { boundedNumber } from '../src/lib/runtime/config';
import { getPrompts } from '../src/lib/prompts';
import { createRouter } from './providers/router';
import type { AgentMessage, Provider } from './providers/types';

export type AgentEvent = {type:string; [key:string]:unknown};
export type AgentOptions = {owner?:string;provider?:string;signal?:AbortSignal;onEvent?:(event:AgentEvent)=>void;providers?:Provider[]};
type DisplayMessage={id:string;type:'user'|'assistant';content:string;timestamp:string;image?:string;pdfUrl?:string;toolStatus?:string};
export function recentHistory(history:AgentMessage[],maxChars=26000) {
 // Drop complete oldest user turns, never split an assistant tool call/result group.
 let start=0;
 while(JSON.stringify(history.slice(start)).length>maxChars) {
  const next=history.findIndex((m,i)=>i>start&&m.role==='user');if(next<0)break;start=next;
 }
 return history.slice(start);
}
export async function runTradeLabAgent(
 userQuery:string,existingSessionId?:string,
 onText:(text:string)=>void=()=>{},onThinking:(text:string)=>void=()=>{},onTool:(tool:string)=>void=()=>{},onImage:(path:string)=>void=()=>{},onSessionId:(id:string)=>void=()=>{},options:AgentOptions={}
) {
 const owner=options.owner||'cli',timeout=boundedNumber(process.env.AGENT_TIMEOUT_MS,240000,10000,600000);
 if(!userQuery.trim()||userQuery.length>8000)throw new Error('Enter a question between 1 and 8,000 characters.');
 const emit=(e:AgentEvent)=>options.onEvent?.(e);
 const status=(content:string)=>{onThinking(content);emit({type:'thinking',content});};
 const router=createRouter(options.provider,options.providers,status);
 const saved=conversation(owner,existingSessionId);lockConversation(owner,saved.id,timeout+10000);
 const history:AgentMessage[]=JSON.parse(saved.history),messages:DisplayMessage[]=JSON.parse(saved.messages);
 const answer:DisplayMessage={id:randomUUID(),type:'assistant',content:'',timestamp:new Date().toISOString(),toolStatus:'idle'};
 const artifacts:ToolArtifact[]=[];const signal=AbortSignal.any([AbortSignal.timeout(timeout),...(options.signal?[options.signal]:[])]);
 let mcp:Awaited<ReturnType<typeof connectMcp>>|undefined;
 onSessionId(saved.id);emit({type:'session_id',sessionId:saved.id});
 history.push({role:'user',content:userQuery});messages.push({id:randomUUID(),type:'user',content:userQuery,timestamp:new Date().toISOString()});
 try {
  mcp=await connectMcp(createRun(owner,saved.id,signal));const {tools}=await mcp.client.listTools();
  const prompts=getPrompts(owner);const system=prompts.tradelab_system_prompt+(prompts.additional_instructions?'\nUser response preferences:\n'+prompts.additional_instructions:'');
  const limit=boundedNumber(process.env.MAX_AGENT_TURNS,16,3,32);
  for(let turn=0;turn<limit;turn++) {
   signal.throwIfAborted();
   const result=await router.complete({system,messages:recentHistory(history),tools,signal});
   emit({type:'provider',provider:result.provider,model:result.model,usage:result.usage});
   history.push({role:'assistant',content:result.text,toolCalls:result.toolCalls.length?result.toolCalls:undefined,native:result.native});
   if(!result.toolCalls.length) {
    answer.content=result.text;
    const links=artifacts.filter(a=>!answer.content.includes(a.url)).map(a=>`[${a.filename}](${a.url})`);
    if(links.length)answer.content+='\n\nDownloads: '+links.join(' · ');
    onText(answer.content);emit({type:'content',content:answer.content});return {sessionId:saved.id,content:answer.content,artifacts};
   }
   for(const call of result.toolCalls) {
    signal.throwIfAborted();onTool(call.name);emit({type:'tool_start',tool:call.name});
    let output:ToolOutput;
    try {
     const response=await mcp.client.callTool({name:call.name,arguments:call.arguments},undefined,{signal,timeout:45000});
     output=response.structuredContent as ToolOutput;
     if(!output) {
      const content=response.content as {type:string;text?:string}[];
      output={success:false,error:content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')||'Tool returned no result.'};
     }
    }catch(error){output={success:false,error:signal.aborted?'Request stopped.':error instanceof Error?error.message:'Tool failed.'};}
    history.push({role:'tool',content:JSON.stringify(output),toolCallId:call.id,toolName:call.name});
    emit({type:'tool_complete',tool:call.name,success:output.success,error:output.error});
    for(const a of output.artifacts||[]) {
     artifacts.push(a);emit({type:'artifact',artifact:a});
     if(a.mime==='image/png'){answer.image=a.url;onImage(a.url);emit({type:'image_generated',imagePath:a.url});}
     if(a.mime==='application/pdf'){answer.pdfUrl=a.url;emit({type:'pdf_generated',pdfUrl:a.url});}
    }
   }
  }
  throw new Error('Analysis reached its step limit. Try a narrower question; completed downloads remain available.');
 }catch(error) {
  // Persist a valid transcript even if cancellation interrupts a batch of tool calls.
  const completed=new Set(history.filter(m=>m.role==='tool').map(m=>m.toolCallId));
  for(const m of [...history])for(const call of m.toolCalls||[])if(!completed.has(call.id))history.push({role:'tool',toolCallId:call.id,toolName:call.name,content:JSON.stringify({success:false,error:'Request interrupted before execution.'})});
  answer.content=signal.aborted?'Analysis stopped or timed out. You can retry.':error instanceof Error?error.message:'Analysis failed.';
  history.push({role:'assistant',content:answer.content});throw new Error(answer.content);
 }finally {
  try{messages.push(answer);saveConversation(owner,saved.id,history,messages,messages[0]?.content||'Conversation');}finally{unlockConversation(owner,saved.id);await mcp?.close();}
 }
}
