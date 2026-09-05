import { cookies } from 'next/headers'
import { verifyNexoraSessionToken, signNexoraSessionToken } from './jwt'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { logAuthOperationalEvent } from '@/lib/auth/observability'
import {
  revalidateMaftahFederationSession,
  MAFTAH_REVALIDATION_INTERVAL_SECONDS,
  FEDERATION_SESSION_MAX_AGE_SECONDS
} from './maftah-oauth'

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
  federationSessionId?: string
}

/**
 * Retrieve current authenticated session from HTTP-only cookie.
 * Supports both Version 1 (legacy signed claims) and Version 2 (federation session ID).
 *
 * For Version 2 sessions:
 * - Validates active server session in PostgreSQL
 * - Enforces absolute 8-hour non-sliding boundary (destroys credentials upon expiry)
 * - Checks local membership status
 * - Performs request-driven Maftah authorization revalidation if stale (>= 30 minutes)
 *   or if forceRevalidate is requested (for sensitive operations).
 */
export async function getCurrentSession(options?: {
  forceRevalidate?: boolean
}): Promise<NexoraUserSession | null> {
  try {
    const cookieStore = cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) return null

    const result = verifyNexoraSessionToken(sessionToken)
    if (!result.valid || !result.payload) return null

    const payload = result.payload

    // Version 2: Federation Session ID (Server-Enforced Active State & Expiry)
    if (payload.v === 2 && payload.sid) {
      const adminDb = getSupabaseAdmin()
      const { data: fedSession, error } = await adminDb.rpc('service_get_federation_session', {
        p_session_id: payload.sid
      })

      if (error || !fedSession || fedSession.status !== 'active') {
        return null
      }

      // Check membership status (independent local product authorization)
      if (fedSession.membership_status !== 'active') {
        return null
      }

      // Determine if Maftah revalidation is due
      const lastRevalidatedAt = new Date(fedSession.last_maftah_revalidated_at).getTime()
      const isStale = Date.now() - lastRevalidatedAt >= MAFTAH_REVALIDATION_INTERVAL_SECONDS * 1000
      const shouldRevalidate = Boolean(options?.forceRevalidate || isStale)

      if (shouldRevalidate) {
        const revalResult = await revalidateMaftahFederationSession(
          fedSession.session_id,
          fedSession.external_organization_id
        )

        if (!revalResult.success) {
          // If fail-closed / revoked or provider error, deny request
          return null
        }
      }

      return {
        lamCustomerId: fedSession.subject,
        lamCompanyId: fedSession.external_organization_id,
        tenantId: fedSession.tenant_id,
        membershipId: fedSession.membership_id,
        email: fedSession.email,
        firstName: fedSession.first_name,
        lastName: fedSession.last_name,
        avatarUrl: fedSession.avatar_url,
        role: fedSession.role || 'sales_user',
        isPlatformAdmin: false,
        grantedProducts: ['nexora'],
        createdAt: fedSession.created_at,
        federationSessionId: fedSession.session_id
      }
    }

    // Version 1: Legacy Signed Payload (7-day local session)
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
 * Set HTTP-only session cookie for NEXORA (Version 1 Legacy - 7 days).
 */
export function setSessionCookie(session: NexoraUserSession) {
  const token = signNexoraSessionToken({ ...session, v: 1 }, 7 * 24 * 60 * 60)
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
 * Set HTTP-only federation session cookie for NEXORA (Version 2 - Absolute 8 hours maximum).
 * Expiry is NON-SLIDING.
 */
export function setFederationSessionCookie(sessionId: string) {
  const token = signNexoraSessionToken({ v: 2, sid: sessionId }, FEDERATION_SESSION_MAX_AGE_SECONDS)
  const cookieStore = cookies()

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: FEDERATION_SESSION_MAX_AGE_SECONDS
  })
}

/**
 * Clear NEXORA session cookie and revoke federation session if present.
 * Ordinary logout revokes local session and deletes credentials from vault.
 * Does NOT revoke global Maftah OAuth client grant.
 */
export async function clearSessionCookie() {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionToken) {
    const result = verifyNexoraSessionToken(sessionToken)
    if (result.valid && result.payload?.v === 2 && result.payload?.sid) {
      try {
        const adminDb = getSupabaseAdmin()
        await adminDb.rpc('service_revoke_federation_session', {
          p_session_id: result.payload.sid
        })
      } catch {}
    }
  }

  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })

  cookieStore.set('nexora_maftah_tx', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })
}
