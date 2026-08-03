/**
 * Shared JSON fetch helper that surfaces transport and HTTP-level failures as
 * thrown errors instead of letting callers silently read an empty/undefined body.
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

function extractPayloadMessage(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error) return record.error;
    if (typeof record.message === 'string' && record.message) return record.message;
  }
  return null;
}

export async function fetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const rawBody = await response.text();

  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }
  }

  if (!response.ok) {
    const message = extractPayloadMessage(payload) || `Request failed with HTTP ${response.status}`;
    throw new ApiRequestError(message, response.status, payload);
  }

  if (payload === null) {
    throw new ApiRequestError('Received an empty response body from the server.', response.status, null);
  }

  return payload as T;
}
