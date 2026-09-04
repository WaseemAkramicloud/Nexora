import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from '@/lib/auth/pkce'
import {
  getMaftahOAuthAuthorizeUrl,
  getMaftahOAuthClientId,
  getMaftahOAuthRedirectUri
} from '@/lib/auth/maftah-oauth'

export async function GET(req: NextRequest) {
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier(64)
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const cookieStore = cookies()
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60
  }

  cookieStore.set('nexora_maftah_oauth_state', state, cookieOptions)
  cookieStore.set('nexora_maftah_code_verifier', codeVerifier, cookieOptions)
  cookieStore.set('nexora_maftah_nonce', nonce, cookieOptions)

  const authUrl = new URL(getMaftahOAuthAuthorizeUrl())
  authUrl.searchParams.set('client_id', getMaftahOAuthClientId())
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', getMaftahOAuthRedirectUri())
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('nonce', nonce)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.redirect(authUrl.toString(), 302)
}
