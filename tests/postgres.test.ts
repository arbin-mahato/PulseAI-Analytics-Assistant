import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import {
  isPostgres,
  getDatabaseBackend,
  initPgSchema,
  conversation,
  lockConversation,
  saveConversation,
  unlockConversation,
  listConversations,
  artifact,
  registerArtifact,
  ownedArtifacts,
  findArtifactById,
  findArtifactPath,
  findLatestArtifactIds,
  getSetting,
  setSetting,
  checkRateLimit,
  getBusyConversationsCount,
  closeStore,
  createRun,
} from "../src/lib/runtime/store";

const TEST_DB_URL =
  process.env.DATABASE_URL || "postgresql://localhost:5432/tradelab_test";

test("PostgreSQL store persistence and parity", async (t) => {
  // Configure environment for PostgreSQL
  process.env.DATABASE_URL = TEST_DB_URL;
  closeStore();

  assert.equal(isPostgres(), true);
  assert.equal(getDatabaseBackend(), "postgres");

  try {
    await initPgSchema();
  } catch (err) {
    t.skip(`Skipping PostgreSQL test: unable to connect to ${TEST_DB_URL} (${(err as Error).message})`);
    return;
  }

  const testOwner = `test-user-${Date.now()}`;

  // 1. Conversation lifecycle
  const conv1 = await conversation(testOwner);
  assert.ok(conv1.id);
  assert.equal(conv1.owner, testOwner);
  assert.equal(conv1.title, "New conversation");

  const fetched = await conversation(testOwner, conv1.id);
  assert.equal(fetched.id, conv1.id);
  assert.equal(fetched.owner, testOwner);

  // Cross-owner boundary check
  await assert.rejects(
    async () => await conversation("other-user", conv1.id),
    /Conversation not found/,
  );

  // Locking
  await lockConversation(testOwner, conv1.id, 60000);
  assert.equal(await getBusyConversationsCount(), 1);

  // Second lock attempt should fail while busy
  await assert.rejects(
    async () => await lockConversation(testOwner, conv1.id, 60000),
    /already processing a request/,
  );

  await unlockConversation(testOwner, conv1.id);
  assert.equal(await getBusyConversationsCount(), 0);

  // Save conversation state
  const mockHistory = [{ role: "user", content: "Hello Postgres" }];
  const mockMessages = [{ id: "m1", type: "user", content: "Hello Postgres" }];
  await saveConversation(
    testOwner,
    conv1.id,
    mockHistory,
    mockMessages,
    "Updated Title for Postgres",
  );

  const updatedConv = await conversation(testOwner, conv1.id);
  assert.equal(updatedConv.title, "Updated Title for Postgres");
  assert.deepEqual(JSON.parse(updatedConv.history), mockHistory);
  assert.deepEqual(JSON.parse(updatedConv.messages), mockMessages);

  // List conversations
  const list = await listConversations(testOwner);
  assert.ok(list.length >= 1);
  assert.equal(list[0].id, conv1.id);
  assert.equal(list[0].title, "Updated Title for Postgres");

  // 2. Artifacts
  const runCtx = createRun(testOwner, conv1.id);
  const sampleFilePath = path.join(runCtx.directory, "test-data.json");
  await fs.writeFile(sampleFilePath, JSON.stringify({ a: 1, b: 2 }));

  const registered = await registerArtifact(
    runCtx,
    sampleFilePath,
    "test-data.json",
    "application/json",
  );
  assert.ok(registered.id);
  assert.equal(registered.filename, "test-data.json");
  assert.equal(registered.mime, "application/json");

  // Query artifact by id
  const fetchedArt = await artifact(registered.id);
  assert.ok(fetchedArt);
  assert.equal(fetchedArt?.filename, "test-data.json");
  assert.equal(fetchedArt?.owner, testOwner);

  // Find artifact by ID with matching owner and session
  const foundArt = await findArtifactById(registered.id, testOwner, conv1.id);
  assert.ok(foundArt);
  assert.equal(foundArt?.local_path, sampleFilePath);

  // Find artifact path with mime match
  const foundPath = await findArtifactPath(
    sampleFilePath,
    testOwner,
    conv1.id,
    ["application/json"],
  );
  assert.equal(foundPath, sampleFilePath);

  // Find latest artifact IDs
  const latestIds = await findLatestArtifactIds(
    testOwner,
    conv1.id,
    ["application/json"],
    1,
  );
  assert.equal(latestIds.length, 1);
  assert.equal(latestIds[0], registered.id);

  // Owned artifacts list
  const owned = await ownedArtifacts(testOwner);
  assert.ok(owned.some((a) => a.id === registered.id));

  // 3. Settings (key-value storage)
  const testKey = `setting-${Date.now()}`;
  const initialSetting = await getSetting(testKey);
  assert.equal(initialSetting, undefined);

  await setSetting(testKey, "test-setting-value");
  const storedSetting = await getSetting(testKey);
  assert.equal(storedSetting, "test-setting-value");

  // 4. Rate Limiting
  const rateLimitKey = `rate-${Date.now()}`;
  // 3 requests allowed in 60s
  await checkRateLimit(rateLimitKey, 3, 60000);
  await checkRateLimit(rateLimitKey, 3, 60000);
  await checkRateLimit(rateLimitKey, 3, 60000);

  // 4th call should throw 429
  await assert.rejects(
    async () => await checkRateLimit(rateLimitKey, 3, 60000),
    (err: unknown) => (err as { status?: number })?.status === 429,
  );

  // Clean up
  closeStore();
});

test("Fallback to SQLite when DATABASE_URL is unset", () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.PERSISTENCE_BACKEND;
  closeStore();

  assert.equal(isPostgres(), false);
  assert.equal(getDatabaseBackend(), "sqlite");

  const conv = conversation("sqlite-test-user");
  assert.ok(conv.id);
  assert.equal(conv.owner, "sqlite-test-user");
});
