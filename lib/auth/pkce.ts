import crypto from 'crypto'

/**
 * Base64URL encode buffer or string (RFC 4648).
 */
export function base64UrlEncode(str: Buffer | string): string {
  const buffer = typeof str === 'string' ? Buffer.from(str) : str
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * Generate cryptographically secure random PKCE code verifier (RFC 7636).
 */
export function generateCodeVerifier(length: number = 64): string {
  return base64UrlEncode(crypto.randomBytes(length)).slice(0, 128)
}

/**
 * Generate PKCE code challenge using SHA-256 (code_challenge_method=S256).
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return base64UrlEncode(hash)
}

/**
 * Generate secure random state string.
 */
export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(32))
}

/**
 * Generate secure random nonce.
 */
export function generateNonce(): string {
  return base64UrlEncode(crypto.randomBytes(32))
}
