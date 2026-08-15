import crypto from 'crypto'
import jwt from 'jsonwebtoken'

export interface JwkKey {
  kty: string
  use?: string
  alg?: string
  kid: string
  n: string
  e: string
  [key: string]: any
}

export interface JwksResponse {
  keys: JwkKey[]
}

export interface LamTokenPayload {
  iss: string
  sub: string
  aud: string | string[]
  email: string
  first_name?: string
  given_name?: string
  last_name?: string | null
  family_name?: string | null
  company_id?: string | null
  company_role?: string | null
  products?: string[]
  is_platform_admin?: boolean
  is_nexora_platform_admin?: boolean
  nonce?: string
  exp: number
  iat: number
  jti?: string
}

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Retrieves configured LAM OIDC Issuer.
 */
export function getLamIssuer(): string {
  return process.env.LAM_OIDC_ISSUER || 'https://id.lubbalmandumah.com'
}

/**
 * Retrieves configured LAM Client ID.
 */
export function getLamClientId(): string {
  return process.env.LAM_CLIENT_ID || 'lam_app_nexora'
}

/**
 * Retrieves configured LAM JWKS URL.
 */
export function getLamJwksUrl(): string {
  return process.env.LAM_OIDC_JWKS_URL || `${getLamIssuer()}/.well-known/jwks.json`
}

/**
 * Fetch JWKS keys from LAM OIDC provider with in-memory caching and rotation handling.
 */
export async function fetchJwks(jwksUrl: string = getLamJwksUrl(), forceRefresh: boolean = false): Promise<JwkKey[]> {
  const now = Date.now()
  if (!forceRefresh && jwksCache && (now - jwksCache.fetchedAt < CACHE_TTL_MS)) {
    return jwksCache.keys
  }

  try {
    const res = await fetch(jwksUrl, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Failed to fetch JWKS from ${jwksUrl}: ${res.statusText}`)
    }
    const data = (await res.json()) as JwksResponse
    if (!data || !Array.isArray(data.keys)) {
      throw new Error(`Invalid JWKS response structure from ${jwksUrl}`)
    }

    jwksCache = { keys: data.keys, fetchedAt: now }
    return data.keys
  } catch (err: any) {
    if (jwksCache) {
      // Fallback to cached keys if fetch fails temporarily
      return jwksCache.keys
    }
    throw err
  }
}

/**
 * Clear in-memory JWKS cache (useful for key rotation testing).
 */
export function clearJwksCache() {
  jwksCache = null
}

/**
 * Verify RS256 OIDC Token issued by LAM ID using JWKS public keys.
 * Strict fail-closed verification.
 */
export async function verifyLamOidcToken(
  token: string,
  options: {
    expectedIssuer?: string
    expectedAudience?: string
    expectedNonce?: string
    jwksUrl?: string
    injectedJwksKeys?: JwkKey[]
  } = {}
): Promise<{ valid: boolean; payload?: LamTokenPayload; error?: string }> {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is missing or invalid type.' }
    }

    // 1. Unpack header without verifying signature to extract kid and alg
    const decodedHeader = jwt.decode(token, { complete: true }) as { header?: { alg?: string; kid?: string } } | null
    if (!decodedHeader || !decodedHeader.header) {
      return { valid: false, error: 'Invalid JWT token format.' }
    }

    const { alg, kid } = decodedHeader.header

    // Security check: Must be RS256 algorithm
    if (alg !== 'RS256') {
      return { valid: false, error: `Unauthorized signing algorithm: ${alg}. Only RS256 is accepted.` }
    }

    if (!kid) {
      return { valid: false, error: 'Token header missing key ID (kid).' }
    }

    // 2. Resolve public key from JWKS
    let keys: JwkKey[] = options.injectedJwksKeys || []
    if (keys.length === 0) {
      keys = await fetchJwks(options.jwksUrl || getLamJwksUrl())
    }

    let jwk = keys.find(k => k.kid === kid)

    // Key rotation support: If kid is not found in cache, force refresh JWKS once
    if (!jwk && !options.injectedJwksKeys) {
      keys = await fetchJwks(options.jwksUrl || getLamJwksUrl(), true)
      jwk = keys.find(k => k.kid === kid)
    }

    if (!jwk) {
      return { valid: false, error: `Key ID (kid) '${kid}' not found in LAM JWKS.` }
    }

    // Convert JWK to KeyObject
    let publicKey: crypto.KeyObject
    try {
      publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    } catch (e: any) {
      return { valid: false, error: `Failed to construct RSA public key from JWK: ${e.message}` }
    }

    const expectedIssuer = options.expectedIssuer || getLamIssuer()
    const expectedAudience = options.expectedAudience || getLamClientId()

    // 3. Verify signature and claims using jsonwebtoken with RS256 public key
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: expectedIssuer,
      audience: expectedAudience
    }) as LamTokenPayload

    // 4. Validate subject identity
    if (!payload.sub) {
      return { valid: false, error: 'Token missing required subject (sub) claim.' }
    }

    // 5. Validate nonce
    if (options.expectedNonce !== undefined) {
      if (!options.expectedNonce) {
        return { valid: false, error: 'Missing stored authentication nonce in session cookie.' }
      }
      if (!payload.nonce) {
        return { valid: false, error: 'ID token missing required nonce claim.' }
      }
      if (payload.nonce !== options.expectedNonce) {
        return { valid: false, error: 'Token nonce mismatch.' }
      }
    }

    return { valid: true, payload }
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token has expired.' }
    }
    if (err.name === 'JsonWebTokenError') {
      return { valid: false, error: `JWT validation error: ${err.message}` }
    }
    return { valid: false, error: err.message || 'Token verification failed.' }
  }
}
