/**
 * Client-visible HTTP errors.
 *
 * `BadRequestError` (lib/validate.js) predates this and stays where it is — it
 * already carries the same `{status, message, details}` shape the central error
 * handler reads, so both flow through one branch in app.js.
 *
 * Every message here is a stable machine-readable code (`invalid_credentials`),
 * with prose in `details`. The frontend branches on the code.
 */
export class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

/** 401 — no token, bad token, or wrong password. */
export class UnauthorizedError extends HttpError {
  constructor(code = "unauthorized", details) {
    super(401, code, details);
  }
}

/** 409 — the username is taken. */
export class ConflictError extends HttpError {
  constructor(code = "conflict", details) {
    super(409, code, details);
  }
}

/**
 * 503 — auth cannot run at all (no Mongo, no Supabase config). Distinct from 401 on
 * purpose: 401 tells a client to log in again, which would not help here.
 */
export class ServiceUnavailableError extends HttpError {
  constructor(code = "service_unavailable", details) {
    super(503, code, details);
  }
}
