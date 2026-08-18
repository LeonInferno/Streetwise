import { ANONYMOUS_SEARCHES_COLLECTION } from "../config/constants.js";
import { getDb, isMongoConfigured } from "./mongo.js";

// Tracks which IPs have already spent their one login-free /api/score search.
//
// This is the half of the "one free search" gate that survives a fresh
// browser profile — frontend/lib/freeSearch.ts's localStorage flag is the
// fast, cosmetic half that avoids even attempting the request in the common
// case, but it resets the moment someone opens an incognito window. IP
// address does not.
//
// Same degrade-on-failure philosophy as cache.js: a Mongo outage here means
// "cannot verify this IP already searched", which must fail OPEN (treated as
// not-yet-used) rather than block a legitimate visitor because of a database
// hiccup that has nothing to do with them.

let indexPromise = null;

/** Creates the unique lookup index. Idempotent, memoized per process. */
export async function ensureAnonymousSearchIndexes() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const db = await getDb();
      if (!db) return false;
      await db
        .collection(ANONYMOUS_SEARCHES_COLLECTION)
        .createIndexes([{ key: { ip: 1 }, name: "ip_unique", unique: true }]);
      return true;
    })().catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

/** Test seam: forget the memoized index promise between in-memory servers. */
export function resetAnonymousSearchIndexMemo() {
  indexPromise = null;
}

/** Whether this IP has already used its free search. Fails open on any error. */
export async function hasUsedFreeSearch(ip) {
  if (!ip || !isMongoConfigured()) return false;

  try {
    const db = await getDb();
    if (!db) return false;
    const doc = await db.collection(ANONYMOUS_SEARCHES_COLLECTION).findOne({ ip });
    return Boolean(doc);
  } catch (err) {
    console.warn("[anonymousSearch] read failed, treating as not-yet-used:", err.message);
    return false;
  }
}

/**
 * Records that this IP has now used its free search.
 *
 * `$setOnInsert` + upsert rather than a plain insert: two concurrent first
 * searches from the same IP must not throw a duplicate-key error into the
 * response, since by the time either write lands the search has already
 * succeeded and the report is already on its way to the client.
 */
export async function markFreeSearchUsed(ip) {
  if (!ip || !isMongoConfigured()) return false;

  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .collection(ANONYMOUS_SEARCHES_COLLECTION)
      .updateOne({ ip }, { $setOnInsert: { ip, createdAt: new Date() } }, { upsert: true });
    return true;
  } catch (err) {
    console.warn("[anonymousSearch] write failed:", err.message);
    return false;
  }
}
