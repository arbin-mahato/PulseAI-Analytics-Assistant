import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataRoot, ensureInside } from './config';

let connection: DatabaseSync | undefined;
let openedPath = '';
export function stateDb() {
  const location = path.join(dataRoot(), 'application.sqlite');
  if (connection && openedPath === location) return connection;
  connection?.close();
  fs.mkdirSync(dataRoot(), { recursive: true });
  connection = new DatabaseSync(location); openedPath = location;
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]', messages TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL, busy_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, session_id TEXT NOT NULL, run_id TEXT NOT NULL, filename TEXT NOT NULL, local_path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, public INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(owner, updated);
    CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(owner, created);
  `);
  return connection;
}
export type Conversation = { id: string; owner: string; title: string; history: string; messages: string; updated: number; busy_until: number };
export function conversation(owner: string, id?: string): Conversation {
  if (id) {
    const existing = stateDb().prepare('SELECT * FROM conversations WHERE id=? AND owner=?').get(id, owner);
    if (!existing) throw new Error('Conversation not found.');
    return existing as unknown as Conversation;
  }
  const newId = randomUUID();
  stateDb().prepare('INSERT INTO conversations(id,owner,title,updated) VALUES(?,?,?,?)').run(newId, owner, 'New conversation', Date.now());
  return conversation(owner, newId);
}
export function lockConversation(owner: string, id: string, timeoutMs: number) {
  const r = stateDb().prepare('UPDATE conversations SET busy_until=? WHERE id=? AND owner=? AND busy_until<?').run(Date.now() + timeoutMs, id, owner, Date.now());
  if (!r.changes) throw new Error('This conversation is already processing a request.');
}
export function saveConversation(owner: string, id: string, history: unknown[], messages: unknown[], title: string) {
  stateDb().prepare('UPDATE conversations SET history=?,messages=?,title=?,updated=? WHERE id=? AND owner=?').run(JSON.stringify(history), JSON.stringify(messages), title.slice(0,100), Date.now(), id, owner);
}
export function unlockConversation(owner: string, id: string) { stateDb().prepare('UPDATE conversations SET busy_until=0 WHERE id=? AND owner=?').run(id, owner); }
export function listConversations(owner: string) { return stateDb().prepare('SELECT id,title,updated FROM conversations WHERE owner=? ORDER BY updated DESC LIMIT 100').all(owner); }
export type Artifact = { id: string; owner: string; session_id: string; run_id: string; filename: string; local_path: string; mime: string; size: number; public: number; created: number };
export function artifact(id: string) { return stateDb().prepare('SELECT * FROM artifacts WHERE id=?').get(id) as Artifact | undefined; }
export function registerArtifact(ctx: RunContext, file: string, filename: string, mime: string, isPublic = false) {
  ensureInside(dataRoot(), file);
  const id = randomUUID(), size = fs.statSync(file).size;
  stateDb().prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,ctx.owner,ctx.sessionId,ctx.runId,filename,file,mime,size,isPublic?1:0,Date.now());
  return { id, filename, url: `/api/files/${id}`, mime, size };
}
export function ownedArtifacts(owner: string) {
  return stateDb().prepare('SELECT id,filename,mime,size,public,created FROM artifacts WHERE owner=? ORDER BY created DESC LIMIT 200').all(owner);
}
export type RunContext = { owner: string; sessionId: string; runId: string; directory: string; signal?: AbortSignal };
export function createRun(owner: string, sessionId: string, signal?: AbortSignal): RunContext {
  const runId = randomUUID(), directory = path.join(dataRoot(), 'runs', runId);
  fs.mkdirSync(directory, { recursive: true });
  return { owner, sessionId, runId, directory, signal };
}
export function resolveRunFile(ctx: RunContext, supplied: string) {
  const absolute = ensureInside(ctx.directory, path.resolve(ctx.directory, supplied));
  return ensureInside(ctx.directory, fs.realpathSync(absolute));
}
