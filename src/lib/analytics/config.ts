/** PostHog US Cloud ingestion host. */
export const POSTHOG_HOST = "https://us.i.posthog.com";

/** PostHog single-event capture endpoint (used server-side by the proxy). */
export const POSTHOG_CAPTURE_URL = `${POSTHOG_HOST}/i/v0/e/`;

export interface AnalyticsConfig {
  isEnabled: boolean;
  token: string;
  host: string;
}

interface AnalyticsEnv {
  NODE_ENV?: string;
  NEXT_PUBLIC_POSTHOG_TOKEN?: string;
}

/**
 * Analytics runs only in production builds that were given a project token
 * (build arg, like AdSense). Dev and test never send events.
 */
export function analyticsConfig(env: AnalyticsEnv): AnalyticsConfig {
  const token = env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim() ?? "";
  return {
    isEnabled: env.NODE_ENV === "production" && token.length > 0,
    token,
    host: POSTHOG_HOST,
  };
}
