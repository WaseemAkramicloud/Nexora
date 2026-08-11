import { cookies } from 'next/headers'
import { verifyNexoraSessionToken, signNexoraSessionToken, NexoraSessionPayload } from './jwt'

export const SESSION_COOKIE_NAME = 'nexora_session'

export interface NexoraUserSession {
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
}

/**
 * Retrieve current authenticated session from HTTP-only cookie.
 */
export async function getCurrentSession(): Promise<NexoraUserSession | null> {
  try {
    const cookieStore = cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) return null

    const result = verifyNexoraSessionToken(sessionToken)
    if (!result.valid || !result.payload) return null

    const payload = result.payload

    return {
      lamCustomerId: payload.lamCustomerId,
      lamCompanyId: payload.lamCompanyId,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      avatarUrl: payload.avatarUrl,
      role: payload.role || 'sales_user',
      isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      grantedProducts: payload.grantedProducts || ['nexora'],
      createdAt: payload.createdAt || new Date().toISOString()
    }
  } catch (err) {
    return null
  }
}

/**
 * Set HTTP-only session cookie for NEXORA.
 */
export function setSessionCookie(session: NexoraUserSession) {
  const token = signNexoraSessionToken(session, 7 * 24 * 60 * 60) // 7 days
  const cookieStore = cookies()

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  })
}

/**
 * Clear NEXORA session cookie.
 */
export function clearSessionCookie() {
  const cookieStore = cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })
}
