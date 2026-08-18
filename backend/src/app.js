import express from "express";
import { healthRouter } from "./routes/health.js";
import { scoreRouter } from "./routes/score.js";
import { complaintsRouter } from "./routes/complaints.js";
import { explanationRouter } from "./routes/explanation.js";
import { optionalAuth } from "./middleware/requireAuth.js";
import { HttpError } from "./lib/errors.js";
import { BadRequestError } from "./lib/validate.js";

/** Custom response headers the browser must be allowed to read cross-origin. */
const COMPLAINTS_HEADERS = ["X-Complaints-Truncated", "X-Complaints-Limit"];

/**
 * Builds the Express app without starting a listener, so tests and the entry
 * point share exactly one wiring path.
 */
export function createApp() {
  const app = express();
  // Vercel (and any reverse proxy) puts the real client IP in X-Forwarded-For;
  // without this, req.ip resolves to the proxy's address for every request,
  // which would make the per-IP free-search limit apply to nobody in
  // particular. `true` trusts the immediate proxy hop, which is exactly what
  // sits in front of this app in every deployment target it runs on.
  app.set("trust proxy", true);
  app.use(express.json());

  // Frontend is served from a different origin during development.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    // Authorization must be listed or the browser's preflight rejects every
    // authenticated cross-origin request before it is ever sent.
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    // Without this, browser JS cannot READ our custom headers even though they
    // arrive — /api/complaints reports its truncation there, and the frontend
    // would silently see `undefined` instead.
    res.set("Access-Control-Expose-Headers", COMPLAINTS_HEADERS.join(","));
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // --- public --------------------------------------------------------------
  // /health stays open deliberately. A deploy health check and a keep-warm ping
  // have no credentials, and a 401 there reads to the host as a failed deploy.
  // It exposes only "the process is up", which is not worth protecting.
  app.use(healthRouter);

  // --- data routes -----------------------------------------------------------
  // Auth is OPTIONAL here, not required: the frontend gates most searches
  // behind login, but that gate is a product decision made client-side (see
  // ReportView's free-search check), not something these routes enforce. A
  // request with a valid token still gets `req.auth` populated, in case a
  // route wants it later.
  app.use(optionalAuth);
  app.use(scoreRouter);
  app.use(complaintsRouter);
  app.use(explanationRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Central error handler. Routes throw BadRequestError (400) via the shared
  // validator and HttpError subclasses (401/409/503) from the auth layer;
  // anything else is a 500 with no internals leaked.
  app.use((err, req, res, next) => {
    // Dispatch on error TYPE, never on `err.status` alone. SocrataError also
    // carries a `status`, but it is the UPSTREAM's status, not ours — a generic
    // "4xx means client error" branch here would forward Socrata's 400 body
    // (query text and all) to the browser as if we had rejected the request.
    // Hence: SocrataError first, and our own errors matched by class.

    // The upstream being down is not our bug, and a 500 tells the frontend
    // nothing it can act on. 503 + a distinct code lets it say "NYC's data
    // service is unavailable, try again" instead of "something broke".
    if (err?.name === "SocrataError") {
      console.error("[upstream]", err.message);
      return res.status(503).json({
        error: "upstream_unavailable",
        details: "NYC Open Data is not responding; try again shortly.",
      });
    }

    // Ours: BadRequestError (400) from the validator and HttpError subclasses
    // (401/409/503) from the auth layer. Both already carry a safe
    // machine-readable code as `message` and prose in `details`, neither
    // derived from an internal exception, so forwarding both leaks nothing.
    if (err instanceof HttpError || err instanceof BadRequestError) {
      if (err.status === 401) {
        // RFC 7235: a 401 must say how to authenticate. Some HTTP clients will
        // not attach credentials on retry without it.
        res.set("WWW-Authenticate", 'Bearer realm="api"');
      }
      if (err.status >= 500) {
        // A 503 here means our own user store is unreachable — worth logging,
        // unlike a routine 400.
        console.error("[auth]", err.message, err.details ?? "");
      }
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    console.error("[error]", err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
