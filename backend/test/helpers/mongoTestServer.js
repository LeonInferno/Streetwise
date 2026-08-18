import { MongoMemoryServer } from "mongodb-memory-server";
import { closeMongo } from "../../src/providers/mongo.js";
import { resetCacheIndexMemo } from "../../src/providers/cache.js";
import { resetAnonymousSearchIndexMemo } from "../../src/providers/anonymousSearch.js";

/** Every memoized index promise, so a new mongod does not inherit an old one. */
function resetIndexMemos() {
  resetCacheIndexMemo();
  resetAnonymousSearchIndexMemo();
}

/**
 * Boots a real in-memory mongod and points the app's provider at it via
 * MONGODB_URI. Real mongod, not a stub: the things worth testing here are index
 * behaviour, TTL semantics, and unique-constraint races, and a hand-rolled fake
 * would assert nothing about any of them.
 *
 * Used by the cache, baseline, and anonymousSearch suites.
 */
export async function startMongo() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = "test_db";
  resetIndexMemos();

  return {
    uri: mongod.getUri(),
    async stop() {
      await closeMongo();
      await mongod.stop();
      delete process.env.MONGODB_URI;
      delete process.env.MONGODB_DB;
      resetIndexMemos();
    },
  };
}
