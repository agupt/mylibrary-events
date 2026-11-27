/**
 * Google service-account auth for Search Console, without the Google SDK
 * (phase1-impact.md §6, WS-A1): an RS256 JWT assertion signed with
 * `node:crypto`, exchanged at Google's OAuth token endpoint for a
 * short-lived access token. Scope is read-only (`webmasters.readonly`).
 *
 * Errors never echo the service-account JSON, the key or the assertion.
 */
import { createSign } from "node:crypto";
import { z } from "zod";
import { request, safeDetail } from "../lib/collectBlock.mjs";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_LIFETIME_SECONDS = 3600;
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const INVALID = "GSC service account JSON is invalid";

const serviceAccountSchema = z.object({
  client_email: z.string().regex(/^[^@\s]+@[^@\s]+$/),
  private_key: z.string().includes("PRIVATE KEY"),
  // Only Google's endpoint: a tampered secret must not redirect the assertion.
  token_uri: z.literal(GOOGLE_TOKEN_URL).optional(),
});

/** The `GSC_SERVICE_ACCOUNT_JSON` secret → `{ clientEmail, privateKey, tokenUri }`. */
export function parseServiceAccount(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(INVALID);
  }
  const result = serviceAccountSchema.safeParse(raw);
  if (!result.success) throw new Error(INVALID);
  return {
    clientEmail: result.data.client_email,
    privateKey: result.data.private_key,
    tokenUri: result.data.token_uri ?? GOOGLE_TOKEN_URL,
  };
}

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A signed RS256 JWT assertion (header.claims.signature). */
export function buildJwtAssertion({
  clientEmail,
  privateKey,
  scope = GSC_SCOPE,
  audience = GOOGLE_TOKEN_URL,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: clientEmail,
    scope,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

/** Exchanges a JWT assertion for an access token. */
export async function fetchAccessToken({ serviceAccount, fetchImpl = fetch, nowSeconds }) {
  const assertion = buildJwtAssertion({ ...serviceAccount, audience: serviceAccount.tokenUri, nowSeconds });
  const response = await request(fetchImpl, serviceAccount.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }).toString(),
  });
  if (!response.ok) {
    const code = safeDetail(response.body?.error);
    throw new Error(`GSC token exchange failed: HTTP ${response.status} ${code}`.trim());
  }
  const token = response.body?.access_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GSC token exchange returned no access_token");
  }
  return token;
}
