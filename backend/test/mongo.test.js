import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startMongo } from "./helpers/mongoTestServer.js";
import { getDb, dropConnection } from "../src/providers/mongo.js";

// Regression coverage for the "stale serverless connection" bug: a provider
// catching an operation failure on an already-connected client used to have
// no way to make getDb() stop handing out that same broken connection —
// dropConnection() is what fixes that, and this is what proves it actually
// does.

let mongo;

beforeAll(async () => {
  mongo = await startMongo();
});

afterAll(async () => {
  await mongo.stop();
});

describe("dropConnection", () => {
  it("getDb() memoizes: two calls before any drop return the same connection", async () => {
    const first = await getDb();
    const second = await getDb();
    expect(first).toBe(second);
  });

  it("forces the next getDb() call to open a fresh, working connection", async () => {
    const before = await getDb();
    expect(before).toBeTruthy();

    dropConnection();

    const after = await getDb();
    expect(after).toBeTruthy();
    // A genuinely new connection, not the same memoized one handed back again.
    expect(after).not.toBe(before);

    // And it actually works — not just a distinct object.
    await after.collection("dropConnectionSmokeTest").insertOne({ ok: true });
    const doc = await after
      .collection("dropConnectionSmokeTest")
      .findOne({ ok: true });
    expect(doc?.ok).toBe(true);
  });
});
