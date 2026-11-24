/**
 * Known AI crawler / answer-engine user-agent tokens (signal F6), matched as
 * case-insensitive substrings. First match wins, so a token must come before
 * any shorter token that is a substring of it. Robots-only tokens (Google-Extended, Applebot-Extended) are not sent as
 * user agents and can't be counted here.
 */
export const AI_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "anthropic-ai",
  "Perplexity-User",
  "PerplexityBot",
  "DuckAssistBot",
  "MistralAI-User",
  "meta-externalagent",
  "Meta-ExternalFetcher",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "YouBot",
] as const;

export type AiBotName = (typeof AI_BOTS)[number];

const LOWERCASE_BOTS = AI_BOTS.map((name) => [name, name.toLowerCase()] as const);

/** Returns the canonical bot name when the UA belongs to a known AI crawler. */
export function matchAiBot(userAgent: string | null | undefined): AiBotName | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const hit = LOWERCASE_BOTS.find(([, lower]) => ua.includes(lower));
  return hit ? hit[0] : null;
}
