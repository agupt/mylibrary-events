import { describe, expect, test } from "vitest";
import { createBotHitAggregator, MAX_PATHS_PER_BOT } from "../analytics/botAggregator";

const T0 = new Date("2026-11-24T08:00:00Z").getTime();
const at = (ms: number) => new Date(T0 + ms);

describe("createBotHitAggregator", () => {
  test("holds hits until the window closes, then flushes one capture per bot", () => {
    const agg = createBotHitAggregator({ token: "phc_t", windowMs: 60_000, startedAt: at(0) });
    expect(agg.record("GPTBot", "https://x.com/a?q=1", at(1_000))).toEqual([]);
    expect(agg.record("GPTBot", "https://x.com/a", at(2_000))).toEqual([]);
    expect(agg.record("ClaudeBot", "https://x.com/llms.txt", at(3_000))).toEqual([]);

    const flushed = agg.record("GPTBot", "https://x.com/b", at(61_000));
    expect(flushed).toEqual([
      {
        api_key: "phc_t",
        event: "ai_bot_hits",
        distinct_id: "bot:GPTBot",
        timestamp: at(0).toISOString(),
        properties: { bot: "GPTBot", hits: 2, paths: { "/a": 2 }, window_seconds: 60, $process_person_profile: false, $ip: "", $geoip_disable: true },
      },
      {
        api_key: "phc_t",
        event: "ai_bot_hits",
        distinct_id: "bot:ClaudeBot",
        timestamp: at(0).toISOString(),
        properties: { bot: "ClaudeBot", hits: 1, paths: { "/llms.txt": 1 }, window_seconds: 60, $process_person_profile: false, $ip: "", $geoip_disable: true },
      },
    ]);
  });

  test("captures carry an explicitly empty $ip so PostHog never attaches the server's IP", () => {
    const agg = createBotHitAggregator({ token: "t", windowMs: 60_000, startedAt: at(0) });
    agg.record("GPTBot", "https://x.com/a", at(1_000));
    const [capture] = agg.record("GPTBot", "https://x.com/b", at(61_000));
    const body = JSON.parse(JSON.stringify(capture)) as { properties: Record<string, unknown> };
    expect(body.properties).toHaveProperty("$ip", "");
    expect(body.properties.$geoip_disable).toBe(true);
  });

  test("the hit that closes a window starts the next one", () => {
    const agg = createBotHitAggregator({ token: "t", windowMs: 60_000, startedAt: at(0) });
    agg.record("GPTBot", "https://x.com/a", at(1_000));
    agg.record("GPTBot", "https://x.com/b", at(61_000));
    const next = agg.record("GPTBot", "https://x.com/c", at(122_000));
    expect(next).toHaveLength(1);
    expect(next[0].properties).toMatchObject({ hits: 1, paths: { "/b": 1 } });
    expect(next[0].timestamp).toBe(at(61_000).toISOString());
  });

  test("caps distinct paths per bot, counting the rest as (other)", () => {
    const agg = createBotHitAggregator({ token: "t", windowMs: 60_000, startedAt: at(0) });
    for (let i = 0; i < MAX_PATHS_PER_BOT + 5; i += 1) {
      agg.record("Bytespider", `https://x.com/p${i}`, at(1_000));
    }
    const [capture] = agg.record("Bytespider", "https://x.com/z", at(61_000));
    expect(capture.properties.hits).toBe(MAX_PATHS_PER_BOT + 5);
    expect(Object.keys(capture.properties.paths)).toHaveLength(MAX_PATHS_PER_BOT + 1);
    expect(capture.properties.paths["(other)"]).toBe(5);
  });
});
