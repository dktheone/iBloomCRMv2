import { NextResponse } from 'next/server';

/**
 * Standard JSON envelope helpers shared by every route handler under /api.
 */
export function apiSuccess(payload: Record<string, any> = {}, status: number = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
}

export function apiError(message: string, status: number = 500, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

/**
 * Converts a thrown exception into the `{ success: false, error }` envelope.
 * `logPrefix` mirrors the per-route console traces that existed before.
 */
export function apiException(
  err: any,
  fallbackMessage: string = 'Server Exception',
  status: number = 500,
  logPrefix?: string
) {
  if (logPrefix) {
    console.error(`${logPrefix}:`, err);
  }
  return apiError(err?.message || fallbackMessage, status);
}
