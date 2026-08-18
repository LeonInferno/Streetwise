import { createApp } from "./app.js";
import { ensureCacheIndexes } from "./providers/cache.js";
import { ensureAnonymousSearchIndexes } from "./providers/anonymousSearch.js";
import { closeMongo, isMongoConfigured } from "./providers/mongo.js";
import { loadBaseline } from "./providers/baseline.js";
import { isSupabaseConfigured } from "./providers/supabase.js";
import { isMockMode } from "./services/scoreService.js";

const PORT = Number(process.env.PORT) || 3001;

// Auth guards every data route, so a missing prerequisite means the app can
// serve nothing but /health. Refusing to start is better than booting into a
// server that 500s on every request and looks like a code bug.
if (!isSupabaseConfigured()) {
  console.error(
    "[auth] FATAL: SUPABASE_URL and/or SUPABASE_SECRET_KEY are unset.\n" +
      "        Find them in the Supabase dashboard under Project Settings ->\n" +
      "        API / API Keys, then put them in .env."
  );
  process.exit(1);
}
if (!isMongoConfigured()) {
  console.error(
    "[auth] FATAL: MONGODB_URI is REQUIRED and is unset.\n" +
      "        Mongo stores user accounts and sessions, and auth guards every\n" +
      "        data route — so without it the app can serve nothing but /health.\n" +
      "        `docker compose up` provides one; see README.md."
  );
  process.exit(1);
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

// Index creation is deliberately NOT awaited before listening. A slow Atlas
// cluster must not stop the app from answering /health, which is what a host
// uses to decide the deploy succeeded. (The URI itself is checked above — this
// is about latency, not absence.)
ensureCacheIndexes()
  .then(() => console.log("[cache] indexes ready"))
  .catch((err) => console.warn("[cache] index setup failed:", err.message));

ensureAnonymousSearchIndexes()
  .then(() => console.log("[anonymousSearch] indexes ready"))
  .catch((err) => console.warn("[anonymousSearch] index setup failed:", err.message));

if (isMockMode()) {
  console.warn("[mode] USE_MOCK_DATA is set — serving MOCK data, not live 311");
} else {
  // Warmed at boot, not on the first request: it is memoized for the process
  // lifetime, so paying for it here keeps it off the first user's latency.
  // Not awaited, for the same reason index creation is not.
  loadBaseline()
    .then((baseline) =>
      console.log(
        baseline
          ? `[baseline] loaded ${baseline._id} from ${baseline.source} ` +
              `(${baseline.sampleSize ?? "?"} sample points)`
          : "[baseline] MISSING — scores will be low-confidence. Run `npm run baseline`."
      )
    )
    .catch((err) => console.warn("[baseline] load failed:", err.message));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      closeMongo().finally(() => process.exit(0));
    });
  });
}
