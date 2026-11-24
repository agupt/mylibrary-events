import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { matchAiBot } from "@/lib/analytics/aiBots";
import { createBotHitAggregator, type BotHitsCapture } from "@/lib/analytics/botAggregator";
import { analyticsConfig, POSTHOG_CAPTURE_URL } from "@/lib/analytics/config";

const CAPTURE_TIMEOUT_MS = 2000;
const BOT_WINDOW_MS = 60_000;

const analytics = analyticsConfig({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
});

// Per-process window. A window is flushed by the first bot hit after it
// closes, so the last window before a quiet spell or restart may be late or
// lost — acceptable for a weekly trend signal (F6).
const botHits = createBotHitAggregator({
  token: analytics.token,
  windowMs: BOT_WINDOW_MS,
  startedAt: new Date(),
});

async function sendCapture(capture: BotHitsCapture): Promise<void> {
  try {
    const response = await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capture),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });
    if (!response.ok) console.warn(`[ai-bot] capture failed: HTTP ${response.status}`);
  } catch (error: unknown) {
    console.warn("[ai-bot] capture failed", error);
  }
}

/**
 * Signal F6: counts hits from known AI crawlers, aggregated per bot per
 * minute (at most one outbound capture per bot per window). HTML is not
 * Cloudflare-cached, so the origin sees every page hit. Sending runs off the
 * response path (waitUntil); the request always proceeds unchanged.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!analytics.isEnabled) return NextResponse.next();
  const bot = matchAiBot(request.headers.get("user-agent"));
  if (!bot) return NextResponse.next();
  const closed = botHits.record(bot, request.url, new Date());
  if (closed.length > 0) event.waitUntil(Promise.all(closed.map(sendCapture)).then(() => undefined));
  return NextResponse.next();
}

export const config = {
  // Pages + text routes (llms.txt, robots.txt, sitemap.xml). Skip API
  // (CF-cached, not content), Next assets, and image files.
  matcher: ["/((?!api/|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
