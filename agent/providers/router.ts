import { createGroqProvider } from './groq';
import { createClaudeProvider } from './claude';
import { createGeminiProvider } from './gemini';
import { ProviderError, type Provider, type ProviderName, type CompletionRequest } from './types';

const names:ProviderName[]=['claude','groq','gemini'];
export function configuredProviders():Provider[] {
 const env=process.env;
 return [env.ANTHROPIC_API_KEY&&createClaudeProvider({apiKey:env.ANTHROPIC_API_KEY,model:env.CLAUDE_MODEL||'claude-haiku-4-5'}),env.GROQ_API_KEY&&createGroqProvider({apiKey:env.GROQ_API_KEY,model:env.GROQ_MODEL||'openai/gpt-oss-120b'}),env.GEMINI_API_KEY&&createGeminiProvider({apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||'gemini-3.5-flash-lite'})].filter(Boolean) as Provider[];
}
export function providerOrder(preferred='auto',available=configuredProviders()) {
 const order=(process.env.LLM_FALLBACK_ORDER||'claude,groq,gemini').split(',').map(s=>s.trim()).filter(s=>names.includes(s as ProviderName));
 const wanted=preferred==='auto'?(process.env.LLM_PROVIDER||'auto'):preferred;
 if(wanted!=='auto'&&!names.includes(wanted as ProviderName))throw new Error('Unknown provider.');
 const priority=[...(wanted==='auto'?[]:[wanted]),...order,...names];
 return [...new Set(priority)].flatMap(name=>available.filter(p=>p.name===name));
}
export function createRouter(preferred='auto',available=configuredProviders(),status:(message:string)=>void=()=>{}) {
 const providers=providerOrder(preferred,available);let active=0;
 if(!providers.length)throw new Error('Add GROQ_API_KEY or GEMINI_API_KEY to .env.local, or configure ANTHROPIC_API_KEY, then restart TradeLab.');
 return { async complete(request:CompletionRequest) {
  let lastError:unknown;
  // Try each configured provider once per inference. Tool execution occurs only after a valid completion.
  for(let offset=0;offset<providers.length;offset++) {
   const index=(active+offset)%providers.length,p=providers[index];request.signal?.throwIfAborted();
   status(`Using ${p.name} (${p.model}).`);
   try {
    const completion=await p.complete(request);
    if(['length','max_tokens','MAX_TOKENS'].includes(completion.finishReason||''))throw new ProviderError(p.name,422,'Model reached its output limit.');
    if(!completion.text.trim()&&!completion.toolCalls.length)throw new ProviderError(p.name,422,'Model returned no answer.');
    if(completion.toolCalls.length>8 || new Set(completion.toolCalls.map(t=>t.id)).size!==completion.toolCalls.length)throw new ProviderError(p.name,422,'Model returned an invalid batch of tools.');
    active=index;return {...completion,provider:p.name,model:p.model};
   }catch(error) {
    if(request.signal?.aborted)throw error;
    lastError=error;status(`${p.name}: ${error instanceof ProviderError?error.message:'Request could not be completed.'}${offset+1<providers.length?' Trying the next configured provider.':''}`);
   }
  }
  if(lastError instanceof ProviderError)throw new Error(`${lastError.provider}: ${lastError.message}${lastError.status===429?' Free API quota is exhausted; wait before retrying or add a second provider key.':''}`);
  throw new Error('The configured AI providers could not respond. Check your connection and API keys.');
 }};
}
