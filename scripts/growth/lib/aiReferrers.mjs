/**
 * AI answer-engine referrer domains (signal F7, phase1-impact.md §1).
 * The single list used by both the F7 parser and the phase-0 check query.
 * Add an engine here, never inline in a query.
 */
export const AI_REFERRERS = Object.freeze({
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "perplexity.ai": "perplexity",
  "copilot.microsoft.com": "copilot",
  "gemini.google.com": "gemini",
  "claude.ai": "claude",
});

export const AI_REFERRER_DOMAINS = Object.freeze(Object.keys(AI_REFERRERS));

/** The engine key for a referring domain (a leading `www.` is ignored), or null. */
export function aiEngineOf(domain) {
  if (typeof domain !== "string" || domain.length === 0) return null;
  const host = domain.toLowerCase().replace(/^www\./, "");
  return Object.hasOwn(AI_REFERRERS, host) ? AI_REFERRERS[host] : null;
}
