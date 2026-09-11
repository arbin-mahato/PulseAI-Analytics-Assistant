import { createHmac,randomBytes,randomUUID,timingSafeEqual,createHash } from 'node:crypto';
import { stateDb } from './store';
const COOKIE='tradelab_session';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
function secret() {
 if(process.env.APP_SESSION_SECRET)return process.env.APP_SESSION_SECRET;
 const saved=stateDb().prepare('SELECT value FROM settings WHERE key=?').get('session-secret');if(saved)return String(saved.value);
 const value=randomBytes(32).toString('hex');stateDb().prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('session-secret',value);
 return String(stateDb().prepare('SELECT value FROM settings WHERE key=?').get('session-secret')!.value);
}
const signature=(value:string)=>createHmac('sha256',secret()).update(value).digest('base64url');
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function isLocked(){return Boolean(process.env.APP_ACCESS_PASSWORD);}
export function productionCheck(){if(process.env.NODE_ENV==='production'&&!isLocked()&&process.env.ALLOW_PUBLIC_DEMO!=='true')throw new HttpError(503,'Set APP_ACCESS_PASSWORD or explicitly enable ALLOW_PUBLIC_DEMO=true before hosting.');}
export function ownerOf(request:Request):string|undefined {
 const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token)return;
 try {const [value,sig]=token.split('.');if(!sig||!equal(signature(value),sig))return;const data=JSON.parse(Buffer.from(value,'base64url').toString());if(typeof data.owner!=='string'||data.expires<Date.now()||data.gate!==gate())return;return data.owner;}catch{return;}
}
function gate(){return createHash('sha256').update(process.env.APP_ACCESS_PASSWORD||'local').digest('hex').slice(0,16);}
export function requireOwner(request:Request){productionCheck();const owner=ownerOf(request);if(!owner)throw new HttpError(401,'Sign in to continue.');return owner;}
export function cookieFor(owner:string,request:Request){const value=Buffer.from(JSON.stringify({owner,expires:Date.now()+30*86400000,gate:gate()})).toString('base64url');return `${COOKIE}=${value}.${signature(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||request.url).protocol==='https:'?'; Secure':''}`;}
export function expiredCookie(){return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;}
export function checkOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==(process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL||new URL(request.url).origin))throw new HttpError(403,'Request origin is not allowed.');}
export function loginOwner(password:unknown){if(typeof password!=='string'||!equal(createHash('sha256').update(password).digest('hex'),createHash('sha256').update(process.env.APP_ACCESS_PASSWORD||'').digest('hex')))throw new HttpError(401,'Incorrect access password.');return 'workspace-owner';}
export function guestOwner(){return randomUUID();}
export function httpError(error:unknown){return Response.json({error:error instanceof Error?error.message:'Request failed.'},{status:error instanceof HttpError?error.status:400});}
export function rateLimit(key:string,max:number,windowMs=60000){
 const db=stateDb();db.exec('CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset INTEGER NOT NULL)');
 const now=Date.now();db.prepare('DELETE FROM rate_limits WHERE reset<?').run(now);
 const row=db.prepare('INSERT INTO rate_limits(key,hits,reset) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').get(key,now+windowMs);
 if(Number(row?.hits)>max)throw new HttpError(429,'Too many requests. Please wait a minute.');
}
export async function readLimited(request:Request,limit:number){const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Missing request body.');const chunks:Uint8Array[]=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Request is too large.');}chunks.push(value);}return Buffer.concat(chunks);}
export async function jsonBody(request:Request,limit=20000){try{return JSON.parse((await readLimited(request,limit)).toString('utf8'));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON.');}}
