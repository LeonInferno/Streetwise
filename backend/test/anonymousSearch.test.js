import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startMongo } from "./helpers/mongoTestServer.js";
import {
  hasUsedFreeSearch,
  markFreeSearchUsed,
  ensureAnonymousSearchIndexes,
} from "../src/providers/anonymousSearch.js";
import { getDb, isMongoConfigured, closeMongo } from "../src/providers/mongo.js";
import { ANONYMOUS_SEARCHES_COLLECTION } from "../src/config/constants.js";

const IP = "203.0.113.7";

let mongo;

beforeAll(async () => {
  mongo = await startMongo();
});

afterAll(async () => {
  await mongo.stop();
});

beforeEach(async () => {
  const db = await getDb();
  await db.collection(ANONYMOUS_SEARCHES_COLLECTION).deleteMany({});
});

describe("hasUsedFreeSearch / markFreeSearchUsed", () => {
  it("is false for an IP that has never searched", async () => {
    expect(await hasUsedFreeSearch(IP)).toBe(false);
  });

  it("becomes true once that IP's free search is marked used", async () => {
    await markFreeSearchUsed(IP);
    expect(await hasUsedFreeSearch(IP)).toBe(true);
  });

  it("tracks IPs independently", async () => {
    await markFreeSearchUsed(IP);
    expect(await hasUsedFreeSearch("203.0.113.99")).toBe(false);
  });

  it("marking the same IP twice does not throw (concurrent first searches)", async () => {
    await Promise.all([markFreeSearchUsed(IP), markFreeSearchUsed(IP)]);
    expect(await hasUsedFreeSearch(IP)).toBe(true);

    const db = await getDb();
    const count = await db
      .collection(ANONYMOUS_SEARCHES_COLLECTION)
      .countDocuments({ ip: IP });
    expect(count).toBe(1);
  });

  it("treats a missing IP as not-yet-used rather than throwing", async () => {
    expect(await hasUsedFreeSearch(undefined)).toBe(false);
    expect(await markFreeSearchUsed(undefined)).toBe(false);
  });
});

describe("degradation", () => {
  it("fails open (not-yet-used) and does not throw when MONGODB_URI is unset", async () => {
    const uri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    try {
      expect(isMongoConfigured()).toBe(false);
      expect(await hasUsedFreeSearch(IP)).toBe(false);
      expect(await markFreeSearchUsed(IP)).toBe(false);
    } finally {
      process.env.MONGODB_URI = uri;
    }
  });

  it("fails open and does not throw when Mongo is unreachable", async () => {
    // The failure that matters in production: Atlas is configured but down.
    // A legitimate anonymous visitor must still get their free search, not a
    // 500 caused by a database outage that has nothing to do with them.
    const good = process.env.MONGODB_URI;
    // Drop the still-cached live connection first, or getDb() would just
    // hand back the working in-memory mongod instead of ever attempting the
    // dead URI below.
    await closeMongo();
    process.env.MONGODB_URI = "mongodb://127.0.0.1:1/deadhost";
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = "300";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(await hasUsedFreeSearch(IP)).toBe(false);
      expect(await markFreeSearchUsed(IP)).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      await closeMongo();
      delete process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS;
      process.env.MONGODB_URI = good;
    }
  });
});

describe("ensureAnonymousSearchIndexes", () => {
  it("creates a unique index on ip", async () => {
    await ensureAnonymousSearchIndexes();
    const db = await getDb();
    const indexes = await db.collection(ANONYMOUS_SEARCHES_COLLECTION).indexes();
    const ipIndex = indexes.find((idx) => idx.name === "ip_unique");
    expect(ipIndex).toBeTruthy();
    expect(ipIndex.unique).toBe(true);
  });
});
