const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value is a canonical UUID rather than a numeric Meta asset id. */
export function isUuid(value?: string | null): boolean {
  return Boolean(value) && UUID_REGEX.test(String(value));
}
