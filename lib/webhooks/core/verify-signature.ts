// lib/webhooks/core/verify-signature.ts
// Multi-provider signature and token verifier using timing-safe comparisons.

import crypto from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * @param rawBody - Exact raw text string of the request body (before JSON parsing)
 * @param signatureHeader - Value of 'x-hub-signature-256' header (e.g. 'sha256=abcdef...')
 * @param appSecret - Meta App Secret key
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;

  // Expected format: sha256=<hex_hash>
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;

  const expectedHash = parts[1];

  const calculatedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return timingSafeEqual(expectedHash, calculatedHash);
}

/**
 * Verifies Meta's GET verification handshake token against configured verify token.
 */
export function verifyMetaHandshakeToken(incomingToken: string | null, configuredToken: string): boolean {
  if (!incomingToken || !configuredToken) return false;
  return timingSafeEqual(incomingToken, configuredToken);
}
