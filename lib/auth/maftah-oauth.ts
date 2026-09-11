import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAuthOperationalEvent } from '@/lib/auth/observability'

export const FEDERATION_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60 // 8 hours absolute
export const MAFTAH_REVALIDATION_INTERVAL_SECONDS = 30 * 60 // 30 minutes
export const PROACTIVE_TOKEN_REFRESH_THRESHOLD_SECONDS = 5 * 60 // 5 minutes

export interface MaftahOAuthTokens {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

export interface MaftahIdTokenPayload {
  iss: string
  sub: string
  aud: string | string[]
  email?: string
  name?: string
  nonce?: string
  exp: number
  iat: number
  [key: string]: unknown
}

export interface MaftahAccessTokenPayload {
  iss: string
  sub: string
  aud: string | string[]
  client_id: string
  session_id: string
  exp: number
  iat: number
  [key: string]: unknown
}

export interface MaftahResolveEntryResponse {
  status: 'authorized' | 'organization_selection_required' | 'denied'
  organization?: {
    id: string
    slug: string
    name: string
  }
  user?: {
    id: string
    email?: string
  }
  eligible_organizations?: Array<{
    id: string
    slug: string
    name: string
  }>
  error?: string
}

// -----------------------------------------------------------------------------
// Environment Configuration Getters
// -----------------------------------------------------------------------------

export function getMaftahOAuthIssuer(): string {
  return process.env.MAFTAH_OAUTH_ISSUER || 'https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1'
}

export function getMaftahFederationAudience(): string {
  return process.env.MAFTAH_FEDERATION_AUDIENCE || 'https://maftah.lubbalmandumah.com/api/federation'
}

export function getMaftahOAuthAuthorizeUrl(): string {
  return process.env.MAFTAH_OAUTH_AUTHORIZE_URL || 'https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/oauth/authorize'
}

export function getMaftahOAuthTokenUrl(): string {
  return process.env.MAFTAH_OAUTH_TOKEN_URL || 'https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/oauth/token'
}

export function getMaftahOAuthJwksUrl(): string {
  return process.env.MAFTAH_OAUTH_JWKS_URL || 'https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/.well-known/jwks.json'
}

export function getMaftahOAuthClientId(): string {
  const clientId = process.env.MAFTAH_OAUTH_CLIENT_ID
  if (!clientId || clientId.trim() === '') {
    if (process.env.NODE_ENV === 'test') {
      return 'test_actual_provider_client_id'
    }
    throw new Error('CRITICAL CONFIGURATION ERROR: MAFTAH_OAUTH_CLIENT_ID environment variable is missing or empty.')
  }
  return clientId.trim()
}

export function getMaftahOAuthClientSecret(): string {
  return process.env.MAFTAH_OAUTH_CLIENT_SECRET || ''
}

export function getMaftahFederationResolveUrl(): string {
  return process.env.MAFTAH_FEDERATION_RESOLVE_URL || 'https://maftah.lubbalmandumah.com/api/federation/resolve-entry'
}

export function getMaftahOAuthRedirectUri(): string {
  if (process.env.MAFTAH_OAUTH_REDIRECT_URI && process.env.MAFTAH_OAUTH_REDIRECT_URI.trim() !== '') {
    return process.env.MAFTAH_OAUTH_REDIRECT_URI.trim()
  }
  if (process.env.NODE_ENV === 'production' || process.env.NEXORA_BASE_URL?.includes('lubbalmandumah.com')) {
    return 'https://nexora.lubbalmandumah.com/api/auth/maftah/callback'
  }
  return 'http://localhost:3001/api/auth/maftah/callback'
}

export function getNexoraCredentialVaultKey(): Buffer {
  const hexKey = process.env.NEXORA_CREDENTIAL_VAULT_KEY
  
  if (!hexKey || hexKey.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: NEXORA_CREDENTIAL_VAULT_KEY must be configured in production.')
    }
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex')
  }
  
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey.trim())) {
    throw new Error('CRITICAL SECURITY ERROR: NEXORA_CREDENTIAL_VAULT_KEY must be exactly 64 hexadecimal characters (32 raw bytes).')
  }
  
  return Buffer.from(hexKey.trim(), 'hex')
}

// -----------------------------------------------------------------------------
// Application-Level Credential Vault Encryption (AES-256-GCM + AAD Context)
// -----------------------------------------------------------------------------

export function encryptCredential(
  payload: Record<string, unknown> | object | string,
  aadContext?: string
): { ciphertext: string; iv: string; tag: string } {
  const key = getNexoraCredentialVaultKey()
  const iv = crypto.randomBytes(12) // 96-bit fresh random IV per operation
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  if (aadContext) {
    cipher.setAAD(Buffer.from(aadContext, 'utf8'))
  }

  const plaintext = typeof payload === 'string' ? payload : JSON.stringify(payload)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag
  }
}

export function decryptCredential<T = any>(
  ciphertext: string,
  ivHex: string,
  tagHex: string,
  aadContext?: string
): T {
  const key = getNexoraCredentialVaultKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)

  if (aadContext) {
    decipher.setAAD(Buffer.from(aadContext, 'utf8'))
  }

  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  try {
    return JSON.parse(decrypted) as T
  } catch {
    return decrypted as unknown as T
  }
}

// -----------------------------------------------------------------------------
// JWKS Caching & Token Verification
// -----------------------------------------------------------------------------

export interface JwkKey {
  kid: string
  kty: string
  alg?: string
  use?: string
  [key: string]: unknown
}

let maftahJwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000

export async function fetchMaftahJwks(forceRefresh: boolean = false): Promise<JwkKey[]> {
  const now = Date.now()
  if (!forceRefresh && maftahJwksCache && now - maftahJwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return maftahJwksCache.keys
  }

  const jwksUrl = getMaftahOAuthJwksUrl()
  const res = await fetch(jwksUrl, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUrl}: ${res.statusText}`)
  }

  const data = (await res.json()) as { keys: JwkKey[] }
  if (!data || !Array.isArray(data.keys)) {
    throw new Error(`Invalid JWKS response structure from ${jwksUrl}`)
  }

  maftahJwksCache = { keys: data.keys, fetchedAt: now }
  return data.keys
}

export async function verifyMaftahIdToken(
  idToken: string,
  options: {
    expectedNonce?: string
    injectedJwksKeys?: JwkKey[]
  } = {}
): Promise<{ valid: boolean; payload?: MaftahIdTokenPayload; error?: string }> {
  try {
    if (!idToken || typeof idToken !== 'string') {
      return { valid: false, error: 'missing_id_token' }
    }

    const decoded = jwt.decode(idToken, { complete: true }) as { header?: { alg?: string; kid?: string } } | null
    if (!decoded || !decoded.header) {
      return { valid: false, error: 'malformed_jwt' }
    }

    const { alg, kid } = decoded.header
    if (!alg || !['ES256', 'RS256'].includes(alg)) {
      return { valid: false, error: `unsupported_algorithm_${alg}` }
    }

    if (!kid) {
      return { valid: false, error: 'missing_kid_header' }
    }

    let keys = options.injectedJwksKeys || []
    if (keys.length === 0) {
      keys = await fetchMaftahJwks()
    }

    let jwk = keys.find((k) => k.kid === kid)
    if (!jwk && !options.injectedJwksKeys) {
      keys = await fetchMaftahJwks(true)
      jwk = keys.find((k) => k.kid === kid)
    }

    if (!jwk) {
      return { valid: false, error: 'unknown_kid' }
    }

    const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' })
    const expectedIssuer = getMaftahOAuthIssuer()
    const expectedAudience = getMaftahOAuthClientId()

    const payload = jwt.verify(idToken, publicKey, {
      algorithms: [alg as jwt.Algorithm],
      issuer: expectedIssuer,
      audience: expectedAudience
    }) as MaftahIdTokenPayload

    if (!payload.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) {
      return { valid: false, error: 'invalid_subject_uuid' }
    }

    if (options.expectedNonce !== undefined) {
      if (!payload.nonce || payload.nonce !== options.expectedNonce) {
        return { valid: false, error: 'nonce_mismatch' }
      }
    }

    return { valid: true, payload }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'token_verification_failed'
    return { valid: false, error: errorMsg }
  }
}

/**
 * Cryptographically verify refreshed or incoming Maftah OAuth Access Token before storage.
 * Enforces: iss, aud, client_id, sub, session_id (valid UUID), exp, JWKS signature.
 */
export async function verifyMaftahAccessToken(
  accessToken: string,
  options: {
    expectedSubject?: string
    expectedClientId?: string
    injectedJwksKeys?: JwkKey[]
  } = {}
): Promise<{ valid: boolean; payload?: MaftahAccessTokenPayload; error?: string }> {
  try {
    if (!accessToken || typeof accessToken !== 'string') {
      return { valid: false, error: 'missing_access_token' }
    }

    const decoded = jwt.decode(accessToken, { complete: true }) as { header?: { alg?: string; kid?: string } } | null
    if (!decoded || !decoded.header) {
      return { valid: false, error: 'malformed_jwt' }
    }

    const { alg, kid } = decoded.header
    if (!alg || !['ES256', 'RS256'].includes(alg)) {
      return { valid: false, error: `unsupported_algorithm_${alg}` }
    }

    if (!kid) {
      return { valid: false, error: 'missing_kid_header' }
    }

    let keys = options.injectedJwksKeys || []
    if (keys.length === 0) {
      keys = await fetchMaftahJwks()
    }

    let jwk = keys.find((k) => k.kid === kid)
    if (!jwk && !options.injectedJwksKeys) {
      keys = await fetchMaftahJwks(true)
      jwk = keys.find((k) => k.kid === kid)
    }

    if (!jwk) {
      return { valid: false, error: 'unknown_kid' }
    }

    const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' })
    const expectedIssuer = getMaftahOAuthIssuer()
    const expectedAudience = getMaftahFederationAudience()

    const payload = jwt.verify(accessToken, publicKey, {
      algorithms: [alg as jwt.Algorithm],
      issuer: expectedIssuer,
      audience: expectedAudience
    }) as MaftahAccessTokenPayload

    // Validate subject
    if (!payload.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)) {
      return { valid: false, error: 'invalid_subject_uuid' }
    }

    if (options.expectedSubject && payload.sub !== options.expectedSubject) {
      return { valid: false, error: 'subject_mismatch' }
    }

    // Validate client_id
    const expectedClientId = options.expectedClientId || getMaftahOAuthClientId()
    if (!payload.client_id || payload.client_id !== expectedClientId) {
      return { valid: false, error: 'client_id_mismatch' }
    }

    // Validate session_id (valid UUID)
    if (!payload.session_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id)) {
      return { valid: false, error: 'invalid_session_id_uuid' }
    }

    return { valid: true, payload }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'token_verification_failed'
    return { valid: false, error: errorMsg }
  }
}

// -----------------------------------------------------------------------------
// OAuth Code Exchange & Refresh Flow (client_secret_basic)
// -----------------------------------------------------------------------------

export async function exchangeMaftahAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string = getMaftahOAuthRedirectUri()
): Promise<{ success: boolean; tokens?: MaftahOAuthTokens; error?: string }> {
  try {
    const tokenUrl = getMaftahOAuthTokenUrl()
    const clientId = getMaftahOAuthClientId()
    const clientSecret = getMaftahOAuthClientSecret()

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json'
      },
      body: bodyParams.toString(),
      cache: 'no-store'
    })

    if (!res.ok) {
      return { success: false, error: `token_exchange_failed_${res.status}` }
    }

    const data = (await res.json()) as MaftahOAuthTokens
    return { success: true, tokens: data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'token_exchange_exception'
    return { success: false, error: msg }
  }
}

export async function refreshMaftahOAuthToken(
  refreshToken: string
): Promise<{ success: boolean; tokens?: MaftahOAuthTokens; error?: string; status?: number }> {
  try {
    const tokenUrl = getMaftahOAuthTokenUrl()
    const clientId = getMaftahOAuthClientId()
    const clientSecret = getMaftahOAuthClientSecret()

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json'
      },
      body: bodyParams.toString(),
      cache: 'no-store'
    })

    if (!res.ok) {
      let errBody = ''
      try {
        errBody = await res.text()
      } catch {}
      return { success: false, status: res.status, error: `token_refresh_failed_${res.status}: ${errBody}` }
    }

    const data = (await res.json()) as MaftahOAuthTokens
    return { success: true, status: 200, tokens: data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'token_refresh_exception'
    return { success: false, error: msg }
  }
}

// -----------------------------------------------------------------------------
// Concurrency-Safe Refresh Lease & Rotation Engine
// -----------------------------------------------------------------------------

export interface StoredCredentialPayload {
  access_token: string
  refresh_token: string | null
  access_token_expires_at: string
  credential_version: number
}

/**
 * Concurrency-Safe Credential Refresh Workflow:
 * 1. Acquire DB refresh lease (service_begin_federation_refresh)
 * 2. Decrypt current credential payload
 * 3. HTTPS POST to Supabase OAuth token endpoint (outside DB transaction)
 * 4. Validate refreshed access token claims against trusted JWKS
 * 5. Replace rotated refresh token (or preserve existing if omitted)
 * 6. Atomically complete refresh using lock + CAS version (service_complete_federation_refresh)
 */
export async function refreshFederationCredentials(
  sessionId: string,
  options?: { injectedJwksKeys?: JwkKey[] }
): Promise<{ success: boolean; accessToken?: string; error?: string; isDefinitiveFailure?: boolean }> {
  const adminDb = getSupabaseAdmin()

  // 1. Acquire DB refresh lease
  const { data: beginResult, error: beginErr } = await adminDb.rpc('service_begin_federation_refresh', {
    p_session_id: sessionId,
    p_lease_seconds: 30
  })

  if (beginErr || !beginResult) {
    return { success: false, error: beginErr?.message || 'begin_refresh_failed' }
  }

  // Handle concurrent in-progress refresh
  if (beginResult.status === 'locked') {
    // Wait briefly (500ms) and inspect if refresh completed
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { data: credsData } = await adminDb.rpc('service_get_federation_credentials', {
      p_session_id: sessionId
    })
    if (credsData) {
      try {
        const decrypted = decryptCredential<StoredCredentialPayload>(
          credsData.encrypted_credentials,
          credsData.iv,
          credsData.tag,
          `${sessionId}:${credsData.credential_version}:nexora_maftah_oauth_credentials`
        )
        return { success: true, accessToken: decrypted.access_token }
      } catch {}
    }
    return { success: false, error: 'refresh_in_progress_by_another_worker' }
  }

  if (!beginResult.success) {
    return { success: false, error: beginResult.error || 'begin_refresh_denied' }
  }

  const lockId = beginResult.lock_id
  const expectedVersion = beginResult.credential_version
  const subject = beginResult.subject

  // 2. Decrypt current credentials
  let currentCreds: StoredCredentialPayload
  try {
    currentCreds = decryptCredential<StoredCredentialPayload>(
      beginResult.encrypted_credentials,
      beginResult.iv,
      beginResult.tag,
      `${sessionId}:${expectedVersion}:nexora_maftah_oauth_credentials`
    )
  } catch (decErr) {
    await adminDb.rpc('service_abort_federation_refresh', {
      p_session_id: sessionId,
      p_lock_id: lockId
    })
    return { success: false, error: 'credential_decryption_failed' }
  }

  if (!currentCreds.refresh_token) {
    await adminDb.rpc('service_abort_federation_refresh', {
      p_session_id: sessionId,
      p_lock_id: lockId
    })
    await adminDb.rpc('service_revoke_federation_session', { p_session_id: sessionId })
    return { success: false, error: 'no_refresh_token_available', isDefinitiveFailure: true }
  }

  // 3. Network POST to Supabase OAuth token endpoint (Outside DB transaction)
  const refreshResponse = await refreshMaftahOAuthToken(currentCreds.refresh_token)

  // 4. Classify Failure
  if (!refreshResponse.success || !refreshResponse.tokens) {
    // Definitive failure (400/401 invalid_grant / invalid_token)
    if (refreshResponse.status && [400, 401].includes(refreshResponse.status)) {
      await adminDb.rpc('service_revoke_federation_session', { p_session_id: sessionId })
      return {
        success: false,
        error: refreshResponse.error || 'definitive_refresh_revocation',
        isDefinitiveFailure: true
      }
    }

    // Transient failure (5xx or timeout) -> abort lock to allow future retry, do NOT delete session
    await adminDb.rpc('service_abort_federation_refresh', {
      p_session_id: sessionId,
      p_lock_id: lockId
    })
    return {
      success: false,
      error: refreshResponse.error || 'transient_refresh_failure',
      isDefinitiveFailure: false
    }
  }

  const tokens = refreshResponse.tokens

  // 5. Validate Refreshed Access Token Claims before Storage
  const validation = await verifyMaftahAccessToken(tokens.access_token, {
    expectedSubject: subject,
    injectedJwksKeys: options?.injectedJwksKeys
  })

  if (!validation.valid || !validation.payload) {
    await adminDb.rpc('service_abort_federation_refresh', {
      p_session_id: sessionId,
      p_lock_id: lockId
    })
    return { success: false, error: `refreshed_token_validation_failed: ${validation.error}` }
  }

  // 6. Handle Rotated Refresh Token
  const newRefreshToken = tokens.refresh_token || currentCreds.refresh_token
  const newAccessTokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  const nextVersion = expectedVersion + 1

  const newPayload: StoredCredentialPayload = {
    access_token: tokens.access_token,
    refresh_token: newRefreshToken,
    access_token_expires_at: newAccessTokenExpiresAt,
    credential_version: nextVersion
  }

  // 7. Encrypt new payload with context AAD
  const newAad = `${sessionId}:${nextVersion}:nexora_maftah_oauth_credentials`
  const encrypted = encryptCredential(newPayload, newAad)

  // 8. Atomically complete refresh using lock + CAS version
  const { data: completeResult, error: completeErr } = await adminDb.rpc('service_complete_federation_refresh', {
    p_session_id: sessionId,
    p_lock_id: lockId,
    p_expected_version: expectedVersion,
    p_encrypted_credentials: encrypted.ciphertext,
    p_iv: encrypted.iv,
    p_tag: encrypted.tag,
    p_access_token_expires_at: newAccessTokenExpiresAt
  })

  if (completeErr || !completeResult?.success) {
    return { success: false, error: completeErr?.message || completeResult?.error || 'complete_refresh_failed' }
  }

  return { success: true, accessToken: tokens.access_token }
}

// -----------------------------------------------------------------------------
// Live Maftah Authorization Revalidation
// -----------------------------------------------------------------------------

export type ResolverFailureKind =
  | 'SUCCESS'
  | 'HTTP_NON_200'
  | 'NETWORK_ERROR'
  | 'JSON_PARSE_ERROR'
  | 'INVALID_RESPONSE_SHAPE'

export const SAFE_RESOLVER_BODY_STATUS_ALLOWLIST = new Set([
  'organization_selection_required',
  'authorized',
  'unauthorized',
  'denied',
  'bad_request',
  'error'
])

export const SAFE_RESOLVER_BODY_ERROR_ALLOWLIST = new Set([
  'oauth_session_invalid',
  'no_effective_access',
  'invalid_token',
  'missing_token',
  'expired_token',
  'invalid_requested_org_id',
  'invalid_request_body',
  'internal_error'
])

export function sanitizeSafeBodyStatus(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  return SAFE_RESOLVER_BODY_STATUS_ALLOWLIST.has(trimmed) ? trimmed : 'UNEXPECTED_VALUE'
}

export function sanitizeSafeBodyError(val: unknown): string | null {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  return SAFE_RESOLVER_BODY_ERROR_ALLOWLIST.has(trimmed) ? trimmed : 'UNEXPECTED_VALUE'
}

export interface CallMaftahResolveEntryResult {
  success: boolean
  data?: MaftahResolveEntryResponse
  error?: string
  status?: number
  httpStatus: number | null
  failureKind: ResolverFailureKind
  safeUpstreamStatus: string | null
  safeUpstreamError: string | null
  eligibleOrganizationCount: number | null
  jsonParsed: boolean
}

export type ResolverHttpResultCode =
  | "resolver_http_200"
  | "resolver_http_400"
  | "resolver_http_401"
  | "resolver_http_403"
  | "resolver_http_500"
  | "resolver_http_other"
  | "resolver_network_error"
  | "resolver_json_parse_error"
  | "resolver_invalid_shape"

export function classifyResolverHttpResult(result: CallMaftahResolveEntryResult): {
  safeErrorCode: ResolverHttpResultCode
  outcome: "success" | "failure"
} {
  if (result.failureKind === "NETWORK_ERROR") {
    return { safeErrorCode: "resolver_network_error", outcome: "failure" }
  }
  if (result.failureKind === "JSON_PARSE_ERROR") {
    return { safeErrorCode: "resolver_json_parse_error", outcome: "failure" }
  }
  if (result.failureKind === "INVALID_RESPONSE_SHAPE") {
    return { safeErrorCode: "resolver_invalid_shape", outcome: "failure" }
  }
  if (result.httpStatus === 200) {
    return { safeErrorCode: "resolver_http_200", outcome: "success" }
  }
  if (result.httpStatus === 400) {
    return { safeErrorCode: "resolver_http_400", outcome: "failure" }
  }
  if (result.httpStatus === 401) {
    return { safeErrorCode: "resolver_http_401", outcome: "failure" }
  }
  if (result.httpStatus === 403) {
    return { safeErrorCode: "resolver_http_403", outcome: "failure" }
  }
  if (result.httpStatus === 500) {
    return { safeErrorCode: "resolver_http_500", outcome: "failure" }
  }
  return { safeErrorCode: "resolver_http_other", outcome: "failure" }
}

export type ResolverPayloadClassifiedCode =
  | "organization_selection_required"
  | "authorized"
  | "unauthorized"
  | "oauth_session_invalid"
  | "denied"
  | "no_effective_access"
  | "internal_error"
  | "unexpected_status"

export function classifyResolverPayload(result: CallMaftahResolveEntryResult): {
  safeErrorCode: ResolverPayloadClassifiedCode
  outcome: "success" | "failure" | "info"
} {
  const status = result.data?.status || result.safeUpstreamStatus
  const error = result.safeUpstreamError

  if (status === "organization_selection_required") {
    return { safeErrorCode: "organization_selection_required", outcome: "info" }
  }
  if (status === "authorized") {
    return { safeErrorCode: "authorized", outcome: "success" }
  }
  if (error === "oauth_session_invalid") {
    return { safeErrorCode: "oauth_session_invalid", outcome: "failure" }
  }
  if (status === "denied" || error === "denied") {
    return { safeErrorCode: "denied", outcome: "failure" }
  }
  if (error === "no_effective_access") {
    return { safeErrorCode: "no_effective_access", outcome: "failure" }
  }
  if (status === "unauthorized" || error === "invalid_token" || error === "missing_token" || error === "expired_token") {
    return { safeErrorCode: "unauthorized", outcome: "failure" }
  }
  if (error === "internal_error" || status === "error") {
    return { safeErrorCode: "internal_error", outcome: "failure" }
  }
  return { safeErrorCode: "unexpected_status", outcome: "failure" }
}

export async function callMaftahResolveEntry(
  accessToken: string,
  requestedOrgId?: string
): Promise<CallMaftahResolveEntryResult> {
  let httpStatus: number | null = null
  let responseOk: boolean | null = null
  let jsonParsed = false
  let bodyStatus: string | null = null
  let bodyError: string | null = null
  let eligibleOrganizationCount: number | null = null
  let failureKind: ResolverFailureKind = 'NETWORK_ERROR'
  let parsedData: MaftahResolveEntryResponse | undefined = undefined

  try {
    const resolveUrl = getMaftahFederationResolveUrl()
    const body: Record<string, unknown> = {}
    if (requestedOrgId) {
      body.requested_org_id = requestedOrgId
    }

    let res: Response
    try {
      res = await fetch(resolveUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      })
      httpStatus = res.status
      responseOk = res.ok
    } catch {
      failureKind = 'NETWORK_ERROR'
      console.log(
        '[NEXORA_MAFTAH_DIAG resolver_result]',
        JSON.stringify({
          httpStatus: null,
          responseOk: null,
          jsonParsed: false,
          bodyStatus: null,
          bodyError: null,
          eligibleOrganizationCount: null,
          failureKind: 'NETWORK_ERROR'
        })
      )
      return {
        success: false,
        httpStatus: null,
        status: undefined,
        failureKind: 'NETWORK_ERROR',
        safeUpstreamStatus: null,
        safeUpstreamError: null,
        eligibleOrganizationCount: null,
        error: 'resolve_entry_network_error',
        jsonParsed: false
      }
    }

    // Attempt JSON parsing
    let rawJson: unknown
    try {
      rawJson = await res.json()
      jsonParsed = true
    } catch {
      jsonParsed = false
      failureKind = 'JSON_PARSE_ERROR'
      console.log(
        '[NEXORA_MAFTAH_DIAG resolver_result]',
        JSON.stringify({
          httpStatus,
          responseOk,
          jsonParsed: false,
          bodyStatus: null,
          bodyError: null,
          eligibleOrganizationCount: null,
          failureKind: 'JSON_PARSE_ERROR'
        })
      )
      return {
        success: false,
        httpStatus,
        status: httpStatus,
        failureKind: 'JSON_PARSE_ERROR',
        safeUpstreamStatus: null,
        safeUpstreamError: null,
        eligibleOrganizationCount: null,
        error: `resolve_entry_json_parse_failed_${httpStatus}`,
        jsonParsed: false
      }
    }

    // Extract safe fields from parsed JSON
    if (rawJson && typeof rawJson === 'object') {
      const obj = rawJson as Record<string, unknown>
      bodyStatus = sanitizeSafeBodyStatus(obj.status)
      bodyError = sanitizeSafeBodyError(obj.error)
      if (Array.isArray(obj.eligible_organizations)) {
        eligibleOrganizationCount = obj.eligible_organizations.length
      }
    }

    // Validate response shape and status
    if (res.status === 200) {
      const json = rawJson as MaftahResolveEntryResponse
      const isValidShape =
        Boolean(json && typeof json === 'object') &&
        ((json.status === 'organization_selection_required' && Array.isArray(json.eligible_organizations)) ||
         (json.status === 'authorized' && Boolean(json.organization && typeof json.organization.id === 'string')))

      if (isValidShape) {
        failureKind = 'SUCCESS'
        parsedData = json
      } else {
        failureKind = 'INVALID_RESPONSE_SHAPE'
      }
    } else {
      failureKind = 'HTTP_NON_200'
    }

    console.log(
      '[NEXORA_MAFTAH_DIAG resolver_result]',
      JSON.stringify({
        httpStatus,
        responseOk,
        jsonParsed,
        bodyStatus,
        bodyError,
        eligibleOrganizationCount,
        failureKind
      })
    )

    if (failureKind === 'SUCCESS') {
      return {
        success: true,
        httpStatus: 200,
        status: 200,
        data: parsedData,
        failureKind: 'SUCCESS',
        safeUpstreamStatus: bodyStatus,
        safeUpstreamError: bodyError,
        eligibleOrganizationCount,
        jsonParsed: true
      }
    }

    const errorStr =
      failureKind === 'INVALID_RESPONSE_SHAPE'
        ? 'resolve_entry_invalid_shape'
        : (bodyError || `resolve_entry_failed_${httpStatus}`)

    return {
      success: false,
      httpStatus,
      status: httpStatus,
      error: errorStr,
      data: parsedData || (rawJson as MaftahResolveEntryResponse),
      failureKind,
      safeUpstreamStatus: bodyStatus,
      safeUpstreamError: bodyError,
      eligibleOrganizationCount,
      jsonParsed: true
    }
  } catch {
    failureKind = 'NETWORK_ERROR'
    console.log(
      '[NEXORA_MAFTAH_DIAG resolver_result]',
      JSON.stringify({
        httpStatus,
        responseOk,
        jsonParsed,
        bodyStatus,
        bodyError,
        eligibleOrganizationCount,
        failureKind: 'NETWORK_ERROR'
      })
    )
    return {
      success: false,
      httpStatus,
      status: httpStatus ?? undefined,
      failureKind: 'NETWORK_ERROR',
      safeUpstreamStatus: null,
      safeUpstreamError: null,
      eligibleOrganizationCount: null,
      error: 'resolve_entry_exception',
      jsonParsed: false
    }
  }
}

/**
 * Revalidate active NEXORA session against Maftah Federation API.
 * - Enforces exact current organization
 * - Handles proactive refresh if access token expiring within 5 minutes
 * - Handles 401 retry once with forced refresh
 * - Revokes local session on 403 or definitive auth failure
 * - Protects against concurrent stampedes with revalidation lock
 */
export async function revalidateMaftahFederationSession(
  sessionId: string,
  externalOrgId: string,
  options?: { injectedJwksKeys?: JwkKey[] }
): Promise<{ success: boolean; error?: string; isTransient?: boolean }> {
  const adminDb = getSupabaseAdmin()

  // 1. Acquire revalidation lock
  const { data: revalLock, error: lockErr } = await adminDb.rpc('service_begin_maftah_revalidation', {
    p_session_id: sessionId,
    p_lease_seconds: 30
  })

  if (lockErr || !revalLock) {
    return { success: false, error: lockErr?.message || 'revalidation_lock_failed' }
  }

  if (revalLock.status === 'locked') {
    // Another request is performing revalidation -> wait 500ms and assume in-flight completion
    return { success: true }
  }

  if (!revalLock.success) {
    return { success: false, error: revalLock.error || 'revalidation_begin_denied' }
  }

  const lockId = revalLock.lock_id

  try {
    // 2. Load current credentials
    const { data: credsData, error: credsErr } = await adminDb.rpc('service_get_federation_credentials', {
      p_session_id: sessionId
    })

    if (credsErr || !credsData) {
      await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
      return { success: false, error: 'credentials_not_found' }
    }

    let creds: StoredCredentialPayload
    try {
      creds = decryptCredential<StoredCredentialPayload>(
        credsData.encrypted_credentials,
        credsData.iv,
        credsData.tag,
        `${sessionId}:${credsData.credential_version}:nexora_maftah_oauth_credentials`
      )
    } catch {
      await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
      return { success: false, error: 'credential_decryption_failed' }
    }

    // 3. Proactive Refresh Check: if access token expires within 5 minutes, refresh first
    let activeAccessToken = creds.access_token
    const expiresAtMs = new Date(creds.access_token_expires_at).getTime()
    const needsProactiveRefresh = expiresAtMs - Date.now() < PROACTIVE_TOKEN_REFRESH_THRESHOLD_SECONDS * 1000

    if (needsProactiveRefresh) {
      const refreshRes = await refreshFederationCredentials(sessionId, { injectedJwksKeys: options?.injectedJwksKeys })
      if (refreshRes.success && refreshRes.accessToken) {
        activeAccessToken = refreshRes.accessToken
      } else if (refreshRes.isDefinitiveFailure) {
        await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
        return { success: false, error: refreshRes.error || 'token_refresh_failed' }
      }
    }

    // 4. Call Maftah /resolve-entry with exact external organization ID
    let resolveRes = await callMaftahResolveEntry(activeAccessToken, externalOrgId)

    // 5. Handle 401 Token / Session Expiry with ONE controlled refresh and retry
    if (!resolveRes.success && resolveRes.status === 401) {
      const retryRefresh = await refreshFederationCredentials(sessionId, { injectedJwksKeys: options?.injectedJwksKeys })
      if (retryRefresh.success && retryRefresh.accessToken) {
        activeAccessToken = retryRefresh.accessToken
        resolveRes = await callMaftahResolveEntry(activeAccessToken, externalOrgId)
      } else {
        await adminDb.rpc('service_revoke_federation_session', { p_session_id: sessionId })
        await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
        return { success: false, error: 'oauth_session_invalid' }
      }
    }

    // 6. Process Final Result
    if (resolveRes.success && resolveRes.data?.status === 'authorized' && resolveRes.data.organization?.id === externalOrgId) {
      // Authorized exact organization -> update last_maftah_revalidated_at and clear lock
      await adminDb.rpc('service_record_maftah_revalidation', {
        p_session_id: sessionId,
        p_lock_id: lockId
      })
      return { success: true }
    }

    if (resolveRes.status === 403 || resolveRes.data?.status === 'denied') {
      // Fail closed: access revoked / suspended
      await adminDb.rpc('service_revoke_federation_session', { p_session_id: sessionId })
      await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
      return { success: false, error: 'no_effective_access' }
    }

    // Transient network or 5xx error
    await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
    return { success: false, error: resolveRes.error || 'revalidation_network_failure', isTransient: true }
  } catch (err: unknown) {
    await adminDb.rpc('service_abort_maftah_revalidation', { p_session_id: sessionId, p_lock_id: lockId })
    const msg = err instanceof Error ? err.message : 'revalidation_unexpected_error'
    return { success: false, error: msg, isTransient: true }
  }
}
