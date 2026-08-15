import { NextRequest, NextResponse } from 'next/server'
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from '@/lib/auth/pkce'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const returnUrl = searchParams.get('returnUrl') || '/'

  // Environment-driven LAM OIDC configuration
  const authorizeEndpoint = process.env.LAM_OIDC_AUTHORIZE_URL || 'https://id.lubbalmandumah.com/api/sso/authorize'
  const clientId = process.env.LAM_CLIENT_ID || 'lam_app_nexora'
  const redirectUri = process.env.NEXORA_CALLBACK_URL || `${request.nextUrl.origin}/api/auth/callback`

  // PKCE & OAuth Security State Generation
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const stateRaw = generateState()
  const nonce = generateNonce()

  // Embed returnUrl securely into state payload
  const statePayload = Buffer.from(JSON.stringify({ state: stateRaw, returnUrl })).toString('base64url')

  const ssoUrl = new URL(authorizeEndpoint)
  ssoUrl.searchParams.set('client_id', clientId)
  ssoUrl.searchParams.set('redirect_uri', redirectUri)
  ssoUrl.searchParams.set('response_type', 'code')
  ssoUrl.searchParams.set('scope', 'openid profile email')
  ssoUrl.searchParams.set('state', statePayload)
  ssoUrl.searchParams.set('code_challenge', challenge)
  ssoUrl.searchParams.set('code_challenge_method', 'S256')
  ssoUrl.searchParams.set('nonce', nonce)

  const response = NextResponse.redirect(ssoUrl.toString())

  // Store short-lived authorization security state in HTTP-only cookies
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600 // 10 minutes
  }

  response.cookies.set('nexora_oauth_state', statePayload, cookieOptions)
  response.cookies.set('nexora_code_verifier', verifier, cookieOptions)
  response.cookies.set('nexora_nonce', nonce, cookieOptions)

  return response
}
