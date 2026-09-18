import { NextRequest, NextResponse } from 'next/server'
import { logAuthOperationalEvent } from '@/lib/auth/observability'

/**
 * Legacy LAM ID SSO initiation route (RETIRED - Stage 6C.4).
 *
 * Old legacy LAM ID integration has been decommissioned from NEXORA.
 * Obsolete entrypoints redirect safely to /login/maftah with fail-closed behavior.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const rawReturnUrl = searchParams.get('returnUrl')
  
  // Safe returnUrl parsing (only relative paths allowed)
  let returnUrl: string | undefined
  if (rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')) {
    returnUrl = rawReturnUrl
  }

  await logAuthOperationalEvent({
    eventType: 'legacy_login_started',
    provider: 'legacy_sso',
    outcome: 'failure',
    safeErrorCode: 'legacy_sso_retired'
  })

  const targetUrl = new URL('/login/maftah', request.url)
  if (returnUrl && returnUrl !== '/') {
    targetUrl.searchParams.set('returnUrl', returnUrl)
  }

  const response = NextResponse.redirect(targetUrl, 302)

  // Clear any residual legacy auth cookies
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
