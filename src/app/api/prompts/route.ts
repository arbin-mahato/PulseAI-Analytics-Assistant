import {getPrompts,updatePrompt} from '@/lib/prompts';import {requireOwner,checkOrigin,httpError,jsonBody} from '@/lib/runtime/auth';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{return Response.json(getPrompts(requireOwner(req)),{headers:{'cache-control':'no-store'}});}catch(e){return httpError(e);}}
export async function POST(req:Request){try{checkOrigin(req);const owner=requireOwner(req),{key,value}=await jsonBody(req);if(typeof key!=='string'||typeof value!=='string')throw new Error('Invalid prompt.');updatePrompt(key,value,owner);return Response.json({success:true});}catch(e){return httpError(e);}}
