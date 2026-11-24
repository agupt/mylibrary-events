/**
 * Per-window aggregation of AI-bot hits (signal F6). One PostHog capture per
 * bot per window instead of one per request, so an aggressive crawler (or a
 * spoofed UA) can't turn every page hit into an outbound request and burn
 * event quota. Pure apart from its own window state; time is injected.
 */
import type { AiBotName } from "./aiBots";

/** Distinct paths kept per bot per window; the rest count as "(other)". */
export const MAX_PATHS_PER_BOT = 50;
const OTHER_PATHS = "(other)";

export interface BotHitsCapture {
  api_key: string;
  event: "ai_bot_hits";
  distinct_id: string;
  timestamp: string;
  properties: {
    bot: AiBotName;
    hits: number;
    paths: Record<string, number>;
    window_seconds: number;
    $process_person_profile: false;
  };
}

interface AggregatorOptions {
  token: string;
  windowMs: number;
  startedAt: Date;
}

export interface BotHitAggregator {
  /**
   * Counts one hit. When the hit falls after the current window, returns the
   * closed window's captures (to be sent) and starts a new window with this
   * hit; otherwise returns [].
   */
  record(bot: AiBotName, url: string, now: Date): BotHitsCapture[];
}

type Window = ReadonlyMap<AiBotName, ReadonlyMap<string, number>>;

function addHit(window: Window, bot: AiBotName, path: string): Window {
  const paths = window.get(bot) ?? new Map<string, number>();
  const key = paths.has(path) || paths.size < MAX_PATHS_PER_BOT ? path : OTHER_PATHS;
  const nextPaths = new Map(paths).set(key, (paths.get(key) ?? 0) + 1);
  return new Map(window).set(bot, nextPaths);
}

export function createBotHitAggregator({
  token,
  windowMs,
  startedAt,
}: AggregatorOptions): BotHitAggregator {
  let windowStart = startedAt.getTime();
  let current: Window = new Map();

  const toCaptures = (window: Window, start: number): BotHitsCapture[] =>
    [...window].map(([bot, paths]) => ({
      api_key: token,
      event: "ai_bot_hits",
      distinct_id: `bot:${bot}`,
      timestamp: new Date(start).toISOString(),
      properties: {
        bot,
        hits: [...paths.values()].reduce((sum, n) => sum + n, 0),
        paths: Object.fromEntries(paths),
        window_seconds: windowMs / 1000,
        $process_person_profile: false,
      },
    }));

  return {
    record(bot, url, now) {
      const path = new URL(url).pathname;
      const nowMs = now.getTime();
      if (nowMs - windowStart < windowMs) {
        current = addHit(current, bot, path);
        return [];
      }
      const closed = toCaptures(current, windowStart);
      windowStart = nowMs;
      current = addHit(new Map(), bot, path);
      return closed;
    },
  };
}
