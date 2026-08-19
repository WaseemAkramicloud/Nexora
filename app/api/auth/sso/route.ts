import { NextRequest, NextResponse } from 'next/server'
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from '@/lib/auth/pkce'

import { getLamAuthorizeEndpoint, getLamClientId, getNexoraCallbackUrl } from '@/lib/auth/config'

export const dynamic = 'force-dynamic'

function redact(val: string): string {
  if (!val || val.length < 8) return '***'
  return `${val.slice(0, 4)}...${val.slice(-4)}`
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const returnUrl = searchParams.get('returnUrl') || '/'

  // Environment-driven fail-closed LAM OIDC configuration
  const authorizeEndpoint = getLamAuthorizeEndpoint()
  const clientId = getLamClientId()
  const redirectUri = getNexoraCallbackUrl(request.nextUrl.origin)

  // PKCE & OAuth Security State Generation
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const stateRaw = generateState()
  const nonce = generateNonce()

  // Diagnostic trace (Redacted)
  console.log('[OIDC SSO INIT TRACE]', {
    generatedNonceRedacted: redact(nonce),
    stateIdentifierRedacted: redact(stateRaw),
    pkceVerifierRedacted: redact(verifier),
    cookieName: 'nexora_nonce',
    targetAuthorizeUrl: authorizeEndpoint
  })

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

  // Cookie attributes: set secure=true ONLY if served over HTTPS to avoid dropping cookies on http://localhost:3001
  const isHttps = request.nextUrl.protocol === 'https:'
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600 // 10 minutes
  }

  response.cookies.set('nexora_oauth_state', statePayload, cookieOptions)
  response.cookies.set('nexora_code_verifier', verifier, cookieOptions)
  response.cookies.set('nexora_nonce', nonce, cookieOptions)

  return response
}
