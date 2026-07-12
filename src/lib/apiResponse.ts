import { NextResponse } from "next/server";

/** Consistent envelope for all API responses. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function apiSuccess<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, error: null });
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
