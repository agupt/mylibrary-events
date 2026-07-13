import { NextResponse } from "next/server";

/** Consistent envelope for all API responses. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * @param edgeCacheSeconds when set, marks the response cacheable by a
 * CDN/proxy (e.g. Cloudflare in front of the app) via s-maxage, with a
 * stale-while-revalidate grace period. Browsers still revalidate
 * (max-age=0) so users get CDN speed without stale tabs.
 */
export function apiSuccess<T>(
  data: T,
  edgeCacheSeconds?: number,
): NextResponse<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (edgeCacheSeconds) {
    headers["Cache-Control"] =
      `public, max-age=0, s-maxage=${edgeCacheSeconds}, stale-while-revalidate=${edgeCacheSeconds * 4}`;
  }
  return NextResponse.json({ success: true, data, error: null }, { headers });
}

export function apiError(
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, data: null, error: message },
    { status },
  );
}
