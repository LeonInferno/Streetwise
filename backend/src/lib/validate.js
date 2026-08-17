import { NYC_BOUNDS, RADIUS_TIERS } from "../config/constants.js";

/**
 * Thrown for bad client input. Routes translate this into a 400 rather than
 * each one re-implementing the same checks.
 */
export class BadRequestError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "BadRequestError";
    this.status = 400;
    this.details = details;
  }
}

function toFiniteNumber(value, field) {
  // Reject "" and null early: Number("") === 0, which would silently pass as
  // a valid coordinate on the equator.
  if (value === undefined || value === null || value === "") {
    throw new BadRequestError(`missing_${field}`, `${field} is required`);
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new BadRequestError(`invalid_${field}`, `${field} must be a number`);
  }
  return n;
}

/**
 * Validates a {lat, lng} pair (numbers or numeric strings) and asserts it falls
 * inside the NYC bounding box. Returns the parsed numbers.
 */
export function validateCoords({ lat, lng }) {
  const parsedLat = toFiniteNumber(lat, "lat");
  const parsedLng = toFiniteNumber(lng, "lng");

  const { minLat, maxLat, minLng, maxLng } = NYC_BOUNDS;
  if (
    parsedLat < minLat ||
    parsedLat > maxLat ||
    parsedLng < minLng ||
    parsedLng > maxLng
  ) {
    throw new BadRequestError(
      "out_of_bounds",
      `coordinate must be within NYC (lat ${minLat}-${maxLat}, lng ${minLng} to ${maxLng})`
    );
  }

  return { lat: parsedLat, lng: parsedLng };
}

/** Required radius tier for /api/explanation. */
export function validateTier(value) {
  const tiers = Object.keys(RADIUS_TIERS);
  if (value === undefined || value === null || value === "") {
    throw new BadRequestError("missing_tier", `tier is required (${tiers.join(" or ")})`);
  }
  if (!tiers.includes(value)) {
    throw new BadRequestError("invalid_tier", `tier must be one of: ${tiers.join(", ")}`);
  }
  return value;
}

/** Optional positive integer row cap, bounded so one request cannot pull the dataset. */
export function validateLimit(value, { fallback, max }) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = toFiniteNumber(value, "limit");
  if (!Number.isInteger(n) || n <= 0 || n > max) {
    throw new BadRequestError(
      "invalid_limit",
      `limit must be a whole number between 1 and ${max}`
    );
  }
  return n;
}

/** Optional positive radius in meters, capped to keep Socrata queries sane. */
export function validateRadius(value, { fallback, max = 2000 }) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = toFiniteNumber(value, "radius");
  if (n <= 0 || n > max) {
    throw new BadRequestError(
      "invalid_radius",
      `radius must be between 1 and ${max} meters`
    );
  }
  return n;
}
