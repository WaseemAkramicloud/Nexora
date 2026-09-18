import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'
import { getLogoutDestination } from '@/lib/auth/logout'
import { logAuthOperationalEvent } from '@/lib/auth/observability'

export const dynamic = 'force-dynamic'

function clearResponseCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === 'production'
  const options = { httpOnly: true, secure, sameSite: 'lax' as const, maxAge: 0, path: '/' }
  response.cookies.set('nexora_session', '', options)
  response.cookies.set('nexora_maftah_tx', '', options)
}

async function signOut(request: NextRequest) {
  const logoutState = await clearSessionCookie()

  if (logoutState.authenticationMode === 'federation') {
    await logAuthOperationalEvent({
      eventType: 'maftah_logout',
      provider: 'maftah',
      outcome: logoutState.success ? 'success' : 'failure',
      safeErrorCode: logoutState.error || null,
      sessionId: logoutState.federationSessionId || null
    })
  }

  const target = getLogoutDestination({ logoutState })
  const response = NextResponse.redirect(new URL(target, request.url), 303)
  clearResponseCookies(response)
  return response
}

export async function POST(request: NextRequest) {
  return signOut(request)
}

export async function GET(request: NextRequest) {
  return signOut(request)
}
