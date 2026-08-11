import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  clearSessionCookie()
  const response = NextResponse.json({ success: true, message: 'Signed out of NEXORA successfully' })
  response.cookies.set('nexora_session', '', { maxAge: 0, path: '/' })
  return response
}

export async function GET(request: NextRequest) {
  clearSessionCookie()

  const searchParams = request.nextUrl.searchParams
  const isGlobalLogout = searchParams.get('global') === 'true' || searchParams.get('lam') === 'true'

  let targetRedirect = new URL('/', request.url).toString()

  if (isGlobalLogout) {
    const lamLogoutEndpoint = process.env.LAM_OIDC_LOGOUT_URL || `${process.env.LAM_PORTAL_URL || 'http://localhost:3000'}/api/sso/logout`
    targetRedirect = lamLogoutEndpoint
  }

  const response = NextResponse.redirect(targetRedirect)
  response.cookies.set('nexora_session', '', { maxAge: 0, path: '/' })
  return response
}
