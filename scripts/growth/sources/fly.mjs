/**
 * S8: server health from Fly.io's Prometheus API
 * (docs/growth-agent/phase1-impact.md §1 S8, decision 7). Daily.
 *
 * Needs `FLY_API_TOKEN` (read-only) and `FLY_ORG_SLUG`. Either missing →
 * `not-configured` with no network call. The token is only ever sent in
 * the Authorization header.
 */
import { sanitizeError } from "../lib/snapshotSchema.mjs";
import {
  NOT_CONFIGURED_S8,
  buildFlyQueries,
  buildS8Block,
  parsePromScalar,
} from "../lib/parseFly.mjs";

export const DEFAULT_FLY_APP = "mylibrary-events";
const ORG_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TIMEOUT_MS = 30_000;

/** `fly tokens create` emits "FlyV1 …" tokens; older ones are bare. */
export function authorizationHeader(token) {
  return token.startsWith("FlyV1 ") ? token : `Bearer ${token}`;
}

async function instantQuery({ org, query, token, fetch, now }) {
  const params = new URLSearchParams({ query, time: String(Math.floor(now / 1000)) });
  try {
    const response = await fetch(
      `https://api.fly.io/prometheus/${org}/api/v1/query?${params}`,
      {
        headers: { authorization: authorizationHeader(token), accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error", // never forward the token to another host
      },
    );
    if (response.status !== 200) {
      return { ok: false, error: `Fly Prometheus HTTP ${response.status}` };
    }
    return parsePromScalar(await response.json());
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

/**
 * Collects the S8 block for the 24 h ending at `now`.
 * @param {{ env?: object, fetch?: Function, app?: string, now?: number }} [options]
 */
export async function collectS8({
  env = process.env,
  fetch = globalThis.fetch,
  app = DEFAULT_FLY_APP,
  now = Date.now(),
} = {}) {
  const token = env.FLY_API_TOKEN;
  const org = env.FLY_ORG_SLUG;
  if (!token || !org) return { ...NOT_CONFIGURED_S8 };
  if (!ORG_SLUG.test(org)) {
    return { status: "error", error: "FLY_ORG_SLUG is not a valid org slug" };
  }

  try {
    const queries = buildFlyQueries(app);
    const names = Object.keys(queries);
    // Sequential: three tiny queries, no need to burst the API.
    const parsed = {};
    for (const name of names) {
      parsed[name] = await instantQuery({ org, query: queries[name], token, fetch, now });
    }
    const block = buildS8Block(parsed);
    return block.status === "error" ? { ...block, error: sanitizeError(block.error) } : block;
  } catch (error) {
    return { status: "error", error: sanitizeError(error) };
  }
}
