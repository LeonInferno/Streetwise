import { UnauthorizedError } from "../lib/errors.js";
import { getUserFromToken } from "../providers/supabase.js";

/**
 * Pulls the token out of `Authorization: Bearer <token>`.
 *
 * The scheme comparison is case-insensitive because RFC 7235 says it is, and
 * real clients send "bearer" — rejecting those produces a 401 that looks like a
 * bad token and costs an hour to debug.
 */
function readBearerToken(req) {
  const header = req.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || rest.length !== 1) return null;
  return rest[0] || null;
}

/**
 * Gate for protected routes. On success attaches `req.auth`:
 *   { userId, email, role }
 *
 * `role` comes from Supabase's user_metadata, set at sign-up on the frontend —
 * this backend never writes it, only reads it back.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw new UnauthorizedError(
        "missing_token",
        "Authorization: Bearer <token> header is required."
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      throw new UnauthorizedError(
        "invalid_token",
        "Access token is not valid or has expired."
      );
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      role: user.user_metadata?.role ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches `req.auth` when a valid bearer token is present, but never blocks
 * the request — a missing or invalid token just leaves `req.auth` unset.
 *
 * Used on the data routes to support the "first search free" flow: an
 * anonymous visitor's request has no token and must still succeed, while a
 * signed-in caller's still gets `req.auth` populated for anything downstream
 * that wants it. The frontend is what decides when to stop letting an
 * anonymous caller through, not this middleware.
 */
export async function optionalAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return next();

  const user = await getUserFromToken(token);
  if (user) {
    req.auth = {
      userId: user.id,
      email: user.email,
      role: user.user_metadata?.role ?? null,
    };
  }
  next();
}
