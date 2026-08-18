import { Router } from "express";
import { validateCoords } from "../lib/validate.js";
import { buildScoreReport } from "../services/scoreService.js";
import { hasUsedFreeSearch, markFreeSearchUsed } from "../providers/anonymousSearch.js";
import { UnauthorizedError } from "../lib/errors.js";

export const scoreRouter = Router();

/**
 * POST /api/score  body: { lat, lng }
 *
 * Response shape is FROZEN (see CLAUDE.md); M5 swapped the mock for real
 * Socrata + baseline data without changing any existing field. The additive
 * `confidence` / `bucketConfidence` / `bucketScores` / `meta` fields are safe
 * for a frontend to ignore.
 *
 * Auth is optional (see middleware/requireAuth.js's optionalAuth) — but an
 * anonymous caller (no req.auth) gets exactly one free search per IP. This is
 * the server-side half of that gate; frontend/lib/freeSearch.ts's localStorage
 * flag is the cosmetic half that skips the request in the common case, but
 * resets with any fresh browser profile, so this IP check is what actually
 * enforces the limit.
 */
scoreRouter.post("/api/score", async (req, res, next) => {
  try {
    const { lat, lng } = validateCoords(req.body ?? {});

    if (!req.auth) {
      const alreadyUsed = await hasUsedFreeSearch(req.ip);
      if (alreadyUsed) {
        throw new UnauthorizedError(
          "free_search_used",
          "You've used your free search. Log in to keep searching."
        );
      }
    }

    const report = await buildScoreReport(lat, lng);
    if (!req.auth) await markFreeSearchUsed(req.ip);
    res.json(report);
  } catch (err) {
    next(err);
  }
});
