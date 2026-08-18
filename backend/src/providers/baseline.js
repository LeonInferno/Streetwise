import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BASELINE_COLLECTION,
  BASELINE_ID,
  BUCKET_NAMES,
} from "../config/constants.js";
import { getDb, isMongoConfigured, dropConnection } from "./mongo.js";

// Loads the citywide baseline the scorer compares against.
//
// TWO sources, in order: the Mongo `baseline` collection, then the committed
// src/config/baseline.json. The committed copy is not a nicety — it means the
// API produces real scores on a fresh clone with no Mongo and no credentials,
// and it means a Mongo outage costs latency rather than turning every score
// into "no_baseline". Mongo wins when present so the baseline can be refreshed
// without a redeploy.

const COMMITTED_PATH = fileURLToPath(
  new URL("../config/baseline.json", import.meta.url)
);

/** Every bucket across both tiers — the baseline must cover all of them. */
const ALL_BUCKETS = Object.values(BUCKET_NAMES).flat();

/**
 * A baseline missing a bucket would score that bucket against `undefined` and
 * quietly hand out a free 100. Reject the whole document instead; falling back
 * to the committed copy (or to no_baseline) is honest, a half-baseline is not.
 */
export function isValidBaseline(doc) {
  if (!doc || typeof doc !== "object" || !doc.perBucket) return false;
  return ALL_BUCKETS.every((bucket) => {
    const entry = doc.perBucket[bucket];
    return (
      entry &&
      Number.isFinite(entry.median) &&
      Number.isFinite(entry.p90) &&
      entry.median >= 0 &&
      entry.p90 >= 0
    );
  });
}

async function readFromMongo() {
  if (!isMongoConfigured()) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const doc = await db
      .collection(BASELINE_COLLECTION)
      .findOne({ _id: BASELINE_ID });
    if (!isValidBaseline(doc)) {
      if (doc) console.warn("[baseline] mongo doc is incomplete, ignoring it");
      return null;
    }
    return { ...doc, source: "mongo" };
  } catch (err) {
    console.warn("[baseline] mongo read failed:", err.message);
    dropConnection();
    return null;
  }
}

async function readCommitted() {
  try {
    const doc = JSON.parse(await readFile(COMMITTED_PATH, "utf8"));
    if (!isValidBaseline(doc)) {
      console.warn("[baseline] committed baseline.json is incomplete");
      return null;
    }
    return { ...doc, source: "file" };
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("[baseline] committed baseline unreadable:", err.message);
    }
    return null;
  }
}

let baselinePromise = null;

/**
 * The baseline, memoized for the process lifetime — it changes only when
 * scripts/buildBaseline.js is rerun, so re-reading it per request would be a
 * Mongo round trip on the hot path for a value that never moves.
 *
 * @returns {Promise<object|null>} null when no baseline exists anywhere, which
 *   the scorer surfaces as confidence "low" / reason "no_baseline".
 */
export async function loadBaseline({ forceRefresh = false } = {}) {
  if (forceRefresh) baselinePromise = null;

  if (!baselinePromise) {
    baselinePromise = (async () => {
      const doc = (await readFromMongo()) ?? (await readCommitted());
      if (!doc) {
        console.warn(
          "[baseline] none found — scores will be marked low-confidence. " +
            "Run `npm run baseline`."
        );
      }
      return doc;
    })().catch((err) => {
      baselinePromise = null;
      throw err;
    });
  }

  return baselinePromise;
}

/** Test seam / script seam: drop the memoized baseline. */
export function resetBaselineMemo() {
  baselinePromise = null;
}

/**
 * Upserts the baseline document. Used only by scripts/buildBaseline.js — the
 * request path never writes here.
 *
 * @returns {Promise<boolean>} false when Mongo is absent or the write failed;
 *   the script still writes the committed JSON copy in that case.
 */
export async function saveBaseline(doc) {
  if (!isMongoConfigured()) return false;
  try {
    const db = await getDb();
    if (!db) return false;
    const { _id, ...rest } = doc;
    await db
      .collection(BASELINE_COLLECTION)
      .replaceOne({ _id: _id ?? BASELINE_ID }, { ...rest }, { upsert: true });
    return true;
  } catch (err) {
    console.warn("[baseline] mongo write failed:", err.message);
    dropConnection();
    return false;
  }
}

export { COMMITTED_PATH as BASELINE_FILE_PATH };
