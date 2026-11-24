import { describe, expect, test } from "vitest";
import { matchAiBot } from "../analytics/aiBots";
import { analyticsConfig, POSTHOG_HOST } from "../analytics/config";

describe("matchAiBot", () => {
  test("recognizes known AI crawler user agents case-insensitively", () => {
    expect(
      matchAiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"),
    ).toBe("GPTBot");
    expect(matchAiBot("Mozilla/5.0 (compatible; claudebot/1.0; +claudebot@anthropic.com)")).toBe("ClaudeBot");
    expect(matchAiBot("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe("PerplexityBot");
    expect(matchAiBot("OAI-SearchBot/1.0; +https://openai.com/searchbot")).toBe("OAI-SearchBot");
  });

  test("prefers the more specific name when one contains another", () => {
    expect(matchAiBot("Mozilla/5.0 ChatGPT-User/1.0")).toBe("ChatGPT-User");
    expect(matchAiBot("Perplexity-User/1.0")).toBe("Perplexity-User");
  });

  test("ignores browsers, search engines, and missing UAs", () => {
    expect(matchAiBot("Mozilla/5.0 (Macintosh) Safari/605.1.15")).toBeNull();
    expect(matchAiBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBeNull();
    expect(matchAiBot(null)).toBeNull();
    expect(matchAiBot("")).toBeNull();
  });
});

describe("analyticsConfig", () => {
  test("is enabled only in production with a token", () => {
    expect(analyticsConfig({ NODE_ENV: "production", NEXT_PUBLIC_POSTHOG_TOKEN: "phc_x" })).toEqual({
      isEnabled: true,
      token: "phc_x",
      host: POSTHOG_HOST,
    });
    expect(analyticsConfig({ NODE_ENV: "development", NEXT_PUBLIC_POSTHOG_TOKEN: "phc_x" }).isEnabled).toBe(false);
    expect(analyticsConfig({ NODE_ENV: "production" }).isEnabled).toBe(false);
    expect(analyticsConfig({ NODE_ENV: "production", NEXT_PUBLIC_POSTHOG_TOKEN: "  " }).isEnabled).toBe(false);
  });
});
