import { describe, expect, test } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  GOOGLE_TOKEN_URL,
  GSC_SCOPE,
  buildJwtAssertion,
  fetchAccessToken,
  parseServiceAccount,
} from "../sources/gscAuth.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const SERVICE_ACCOUNT = {
  type: "service_account",
  client_email: "observer@example.iam.gserviceaccount.com",
  private_key: PRIVATE_PEM,
  token_uri: GOOGLE_TOKEN_URL,
};
const NOW = 1_795_000_000;

function decode(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("parseServiceAccount", () => {
  test("accepts the GitHub secret's JSON text", () => {
    const account = parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT));
    expect(account).toEqual({
      clientEmail: SERVICE_ACCOUNT.client_email,
      privateKey: PRIVATE_PEM,
      tokenUri: GOOGLE_TOKEN_URL,
    });
  });

  test("defaults token_uri to Google's token endpoint", () => {
    const { token_uri: _ignored, ...rest } = SERVICE_ACCOUNT;
    expect(parseServiceAccount(JSON.stringify(rest)).tokenUri).toBe(GOOGLE_TOKEN_URL);
  });

  test.each([["not json"], ["{}"], [JSON.stringify({ client_email: "a@b.c" })]])(
    "rejects %s without echoing its content",
    (text) => {
      expect(() => parseServiceAccount(text)).toThrow(/^GSC service account JSON is invalid$/);
    },
  );

  test("refuses a token endpoint that is not Google's", () => {
    const text = JSON.stringify({ ...SERVICE_ACCOUNT, token_uri: "https://evil.example/token" });
    expect(() => parseServiceAccount(text)).toThrow(/invalid/);
  });
});

describe("buildJwtAssertion (node:crypto, no Google SDK)", () => {
  const assertion = buildJwtAssertion({
    clientEmail: SERVICE_ACCOUNT.client_email,
    privateKey: PRIVATE_PEM,
    nowSeconds: NOW,
  });
  const [header, claims, signature] = assertion.split(".");

  test("RS256 header and read-only webmasters claims", () => {
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: SERVICE_ACCOUNT.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: GOOGLE_TOKEN_URL,
      iat: NOW,
      exp: NOW + 3600,
    });
    expect(GSC_SCOPE).toBe("https://www.googleapis.com/auth/webmasters.readonly");
  });

  test("the signature verifies with the public key", () => {
    const verifier = createVerify("RSA-SHA256").update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("fetchAccessToken", () => {
  test("exchanges the assertion for an access token", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3599 }), { status: 200 });
    };
    const token = await fetchAccessToken({
      serviceAccount: parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT)),
      fetchImpl,
      nowSeconds: NOW,
    });
    expect(token).toBe("ya29.token");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GOOGLE_TOKEN_URL);
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion").split(".")).toHaveLength(3);
  });

  test("a rejected exchange reports only the status and OAuth error code", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "secret detail" }), {
        status: 400,
      });
    const promise = fetchAccessToken({
      serviceAccount: parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT)),
      fetchImpl,
      nowSeconds: NOW,
    });
    await expect(promise).rejects.toThrow("GSC token exchange failed: HTTP 400 invalid_grant");
  });

  test("a 200 without a token is an error", async () => {
    const fetchImpl = async () => new Response("{}", { status: 200 });
    await expect(
      fetchAccessToken({
        serviceAccount: parseServiceAccount(JSON.stringify(SERVICE_ACCOUNT)),
        fetchImpl,
        nowSeconds: NOW,
      }),
    ).rejects.toThrow(/no access_token/);
  });
});
