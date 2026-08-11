import jwt from 'jsonwebtoken'
import { verifyLamOidcToken, LamTokenPayload } from './jwks'

export type { LamTokenPayload } from './jwks'
export { verifyLamOidcToken } from './jwks'

export interface NexoraSessionPayload {
  lamCustomerId: string
  lamCompanyId: string
  tenantId: string
  membershipId: string
  email: string
  firstName: string
  lastName?: string | null
  avatarUrl?: string | null
  role: 'owner' | 'admin' | 'sales_user' | 'viewer'
  isPlatformAdmin?: boolean
  grantedProducts: string[]
  createdAt: string
  exp?: number
  iat?: number
}

/**
 * Retrieve secret used strictly for signing local NEXORA HTTP-only session cookies.
 */
function getNexoraSessionSecret(): string {
  const secret = process.env.NEXORA_SESSION_SECRET || process.env.JWT_SIGNING_KEY_CURRENT
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: NEXORA Session secret is unconfigured in production.')
    }
    return 'dev_nexora_session_signing_secret_key_2026'
  }
  return secret
}

/**
 * Sign local NEXORA session token stored in HTTP-only cookie.
 */
export function signNexoraSessionToken(payload: Record<string, any>, expiresInSeconds: number = 7 * 24 * 60 * 60): string {
  const secret = getNexoraSessionSecret()
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds })
}

/**
 * Verify local NEXORA session token from HTTP-only cookie.
 */
export function verifyNexoraSessionToken(token: string): { valid: boolean; payload?: NexoraSessionPayload; error?: string } {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Session token is missing.' }
    }
    const secret = getNexoraSessionSecret()
    const decoded = jwt.verify(token, secret) as NexoraSessionPayload
    return { valid: true, payload: decoded }
  } catch (err: any) {
    return { valid: false, error: err.message || 'Session verification failed.' }
  }
}
