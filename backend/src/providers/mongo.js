import { MongoClient } from "mongodb";
import { ServiceUnavailableError } from "../lib/errors.js";

// Connection management only — no collection logic lives here (that is cache.js
// for complaints, users.js / sessions.js for auth).
//
// TWO accessors, and the choice between them is a statement about the caller:
//
//   getDb()      returns `null` when Mongo is missing or unreachable. For
//                callers that can degrade — the cache treats it as a miss,
//                because an absent cache is a slower app, not a broken one.
//   requireDb()  throws 503. For callers that CANNOT degrade — auth, where
//                continuing without a user store would read a database outage
//                as "no such user", or worse, as success.
//
// Nothing here throws on startup, so a Mongo outage stays a per-request failure
// rather than a dead process. Whether the app should have BOOTED without a URI
// at all is decided in index.js, not here: since M7 added auth, it should not.

const DEFAULT_DB_NAME = "should_i_live_here";

let connectPromise = null;
let activeClient = null;

/** Read at call time, not import time, so a URI can arrive after boot. */
export function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * Connects lazily and memoizes. Returns `null` when no URI is configured.
 * A failed connection clears the memo so the next request retries rather than
 * being stuck with a rejected promise for the process lifetime.
 */
export async function getDb() {
  if (!isMongoConfigured()) return null;

  if (!connectPromise) {
    const uri = process.env.MONGODB_URI;
    connectPromise = (async () => {
      // Fail fast. A hung driver would otherwise sit on the request thread well
      // past the point where the user has given up on the page. Overridable so
      // tests can exercise the unreachable-Mongo path without a 5s stall.
      const timeoutMs =
        Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000;
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: timeoutMs,
        connectTimeoutMS: timeoutMs,
        // A serverless container can sit idle between invocations for far
        // longer than a connection stays healthy — Atlas (or a network
        // intermediary) closes it from its side while this process is
        // frozen, and the driver has no way to know until it tries to use
        // it. Recycling idle connections well before that point means fewer
        // requests ever hit a stale one in the first place; dropConnection()
        // below is what recovers the ones that still do.
        maxIdleTimeMS: 10000,
      });
      await client.connect();
      activeClient = client;
      return client.db(process.env.MONGODB_DB || DEFAULT_DB_NAME);
    })().catch((err) => {
      connectPromise = null;
      activeClient = null;
      throw err;
    });
  }

  return connectPromise;
}

/**
 * The strict counterpart to `getDb`, for callers that CANNOT degrade.
 *
 * Everything above treats a missing database as "no cache", which is right for
 * the cache and wrong for auth: silently continuing without a user store during
 * a login is how a database outage turns into an authentication bypass. Auth
 * providers use this and let the 503 propagate.
 */
export async function requireDb() {
  if (!isMongoConfigured()) {
    throw new ServiceUnavailableError(
      "auth_unavailable",
      "MONGODB_URI is not configured; authentication cannot run."
    );
  }
  let db;
  try {
    db = await getDb();
  } catch (err) {
    // The driver's message can name the host and credentials; keep it in our
    // logs and hand the client a generic one.
    console.error("[mongo] required connection failed:", err.message);
    throw new ServiceUnavailableError(
      "auth_unavailable",
      "The account database is unreachable; try again shortly."
    );
  }
  if (!db) {
    throw new ServiceUnavailableError("auth_unavailable", "No database configured.");
  }
  return db;
}

/** Closes the pool. Used by tests and by graceful shutdown. */
export async function closeMongo() {
  const client = activeClient;
  connectPromise = null;
  activeClient = null;
  if (client) await client.close();
}

/**
 * Drops the memoized connection so the next getDb() call reconnects from
 * scratch, instead of continuing to hand out a connection an operation just
 * proved is dead.
 *
 * getDb() already clears the memo when the INITIAL connect() call itself
 * rejects — but a connection that connected successfully and only goes stale
 * later (Atlas's own idle-connection reaper, a network blip, a serverless
 * container thawing with a TLS session the far end has since closed) fails on
 * some LATER operation instead, and nothing cleared the memo for that case.
 * Providers call this from their catch blocks so one stale connection costs
 * one failed request, not every request until the process restarts.
 *
 * Fire-and-forget close: the connection is already broken, so there is
 * nothing useful to await or react to if closing it cleanly also fails.
 */
export function dropConnection() {
  const client = activeClient;
  connectPromise = null;
  activeClient = null;
  if (client) client.close().catch(() => {});
}
