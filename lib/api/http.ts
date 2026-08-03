/**
 * Thin JSON fetch wrappers used by client components to talk to the /api routes.
 * The routes always answer with a JSON envelope, so callers inspect `data.success`
 * instead of the HTTP status.
 */
export async function apiFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return (await res.json()) as T;
}

export function apiGet<T = any>(url: string): Promise<T> {
  return apiFetch<T>(url);
}

export function apiPost<T = any>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export function apiDelete<T = any>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: 'DELETE' });
}
