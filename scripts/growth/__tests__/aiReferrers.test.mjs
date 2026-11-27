import { describe, expect, test } from "vitest";
import { AI_REFERRERS, AI_REFERRER_DOMAINS, aiEngineOf } from "../lib/aiReferrers.mjs";

describe("aiEngineOf", () => {
  test.each([
    ["chatgpt.com", "chatgpt"],
    ["chat.openai.com", "chatgpt"],
    ["www.perplexity.ai", "perplexity"],
    ["perplexity.ai", "perplexity"],
    ["copilot.microsoft.com", "copilot"],
    ["gemini.google.com", "gemini"],
    ["CLAUDE.AI", "claude"],
  ])("%s → %s", (domain, engine) => {
    expect(aiEngineOf(domain)).toBe(engine);
  });

  test.each([["www.google.com"], ["$direct"], [""], [null], [undefined], ["notchatgpt.com"]])(
    "%s is not an AI engine",
    (domain) => {
      expect(aiEngineOf(domain)).toBeNull();
    },
  );

  test("the domain list is the map's keys, frozen", () => {
    expect(AI_REFERRER_DOMAINS).toEqual(Object.keys(AI_REFERRERS));
    expect(Object.isFrozen(AI_REFERRERS)).toBe(true);
  });
});
