import { NextRequest, NextResponse } from 'next/server'
import { logAuthOperationalEvent } from '@/lib/auth/observability'

/**
 * Legacy LAM ID OAuth Callback Route (RETIRED - Stage 6C.4).
 *
 * Old legacy LAM ID integration has been decommissioned from NEXORA.
 * Legacy callback parameters are not processed or exchanged for sessions.
 * Safely clears temporary OAuth cookies and redirects to /login/maftah.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await logAuthOperationalEvent({
    eventType: 'legacy_login_failed',
    provider: 'legacy_sso',
    outcome: 'failure',
    safeErrorCode: 'legacy_callback_retired'
  })

  const targetUrl = new URL('/login/maftah', request.url)
  targetUrl.searchParams.set('error', 'legacy_sso_retired')

  const response = NextResponse.redirect(targetUrl, 302)

  // Cleanly purge any residual legacy auth cookies
  const isHttps = request.nextUrl.protocol === 'https:'
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0
  }

  response.cookies.set('nexora_oauth_state', '', cookieOptions)
  response.cookies.set('nexora_code_verifier', '', cookieOptions)
  response.cookies.set('nexora_nonce', '', cookieOptions)

  return response
}
