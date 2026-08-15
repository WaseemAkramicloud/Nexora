import { NextRequest, NextResponse } from 'next/server'
import { verifyLamOidcToken } from '@/lib/auth/jwks'
import { setSessionCookie } from '@/lib/auth/session'
import { getOrCreateTenantForCompany, getOrCreateMembership } from '@/lib/db/nexora-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateQuery = searchParams.get('state')
    const oauthError = searchParams.get('error')
    const oauthErrorDesc = searchParams.get('error_description')

    if (oauthError) {
      return NextResponse.redirect(
        new URL(`/auth/unauthorized?reason=${encodeURIComponent(oauthErrorDesc || oauthError)}`, request.url)
      )
    }

    // Read security state from cookies
    const storedState = request.cookies.get('nexora_oauth_state')?.value
    const codeVerifier = request.cookies.get('nexora_code_verifier')?.value
    const storedNonce = request.cookies.get('nexora_nonce')?.value

    // 1. Strict OAuth 2.0 State Validation (Anti-CSRF)
    if (!stateQuery || !storedState || stateQuery !== storedState) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=OAuth+state+validation+failed+or+session+expired', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // Extract returnUrl from state
    let returnUrl = '/'
    try {
      const decodedState = JSON.parse(Buffer.from(stateQuery, 'base64url').toString('utf8'))
      if (decodedState.returnUrl) {
        returnUrl = decodedState.returnUrl
      }
    } catch (e) {
      // Ignore parse errors, fallback to default returnUrl
    }

    if (!code || !codeVerifier) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=Missing+authorization+code+or+PKCE+verifier', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // 2. Exchange Authorization Code + PKCE Verifier for Tokens
    const tokenEndpoint = process.env.LAM_OIDC_TOKEN_URL || 'https://id.lubbalmandumah.com/api/sso/token'
    const clientId = process.env.LAM_CLIENT_ID || 'lam_app_nexora'
    const clientSecret = process.env.LAM_CLIENT_SECRET || ''
    const redirectUri = process.env.NEXORA_CALLBACK_URL || `${request.nextUrl.origin}/api/auth/callback`

    let tokenResponse: Response
    try {
      tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        }).toString()
      })
    } catch (fetchErr: any) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=Authentication+service+temporarily+unavailable', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      let parsedReason = 'Failed to exchange authorization code with LAM ID'
      try {
        const errorJson = JSON.parse(errorText)
        parsedReason = errorJson.error_description || errorJson.error || parsedReason
      } catch (e) {
        // use raw text if available
      }
      const response = NextResponse.redirect(
        new URL(`/auth/unauthorized?reason=${encodeURIComponent(parsedReason)}`, request.url)
      )
      clearAuthCookies(response)
      return response
    }

    const tokenData = await tokenResponse.json()
    const rawToken = tokenData.id_token || tokenData.access_token

    if (!rawToken) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=LAM+ID+token+response+missing+id_token', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // 3. Validate RS256 Token Signature via LAM JWKS
    const verifyRes = await verifyLamOidcToken(rawToken, {
      expectedNonce: storedNonce
    })

    if (!verifyRes.valid || !verifyRes.payload) {
      const response = NextResponse.redirect(
        new URL(`/auth/unauthorized?reason=${encodeURIComponent(verifyRes.error || 'Token validation failed')}`, request.url)
      )
      clearAuthCookies(response)
      return response
    }

    const tokenPayload = verifyRes.payload

    // 4. Validate Product Entitlement (Must explicitly contain 'nexora')
    const grantedProducts = tokenPayload.products || []
    if (!grantedProducts.includes('nexora')) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=Product+access+to+NEXORA+is+not+assigned+for+your+account', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // 5. Tenant Resolution & Status Verification
    const lamCompanyId = tokenPayload.company_id
    if (!lamCompanyId) {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=Missing+company+context+in+LAM+identity', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    const lamCustomerId = tokenPayload.sub
    const email = tokenPayload.email
    const firstName = tokenPayload.first_name || 'User'
    const lastName = tokenPayload.last_name || ''
    const lamCompanyRole = tokenPayload.company_role || 'sales_user'

    const tenant = await getOrCreateTenantForCompany(lamCompanyId, `${firstName}'s Enterprise Workspace`)

    // Check if tenant or entitlement is suspended
    if (tenant.status === 'suspended' || (tenant as any).entitlement_status === 'suspended') {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=NEXORA+workspace+subscription+is+suspended', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // 6. Resolve Local Membership & Local Role from NEXORA Database
    const membership = await getOrCreateMembership(tenant.id, lamCustomerId, email, firstName, lastName, lamCompanyRole)

    if (membership.status === 'suspended' || membership.status === 'disabled') {
      const response = NextResponse.redirect(
        new URL('/auth/unauthorized?reason=Your+NEXORA+user+membership+is+disabled', request.url)
      )
      clearAuthCookies(response)
      return response
    }

    // 7. Check Platform Superadmin Status
    let isPlatformAdmin = Boolean(tokenPayload.is_platform_admin)
    if (!isPlatformAdmin) {
      const supabase = getSupabaseAdmin()
      const { data: adminRecord } = await supabase
        .from('platform_administrators')
        .select('id')
        .eq('lam_customer_id', lamCustomerId)
        .eq('status', 'active')
        .maybeSingle()

      if (adminRecord) {
        isPlatformAdmin = true
      }
    }

    // 8. Create Secure Local Session Cookie
    const sessionData = {
      lamCustomerId,
      lamCompanyId,
      tenantId: tenant.id,
      membershipId: membership.id,
      email: membership.email,
      firstName: membership.first_name,
      lastName: membership.last_name,
      role: membership.role as 'owner' | 'admin' | 'sales_user' | 'viewer',
      isPlatformAdmin,
      grantedProducts,
      createdAt: new Date().toISOString()
    }

    const response = NextResponse.redirect(new URL(returnUrl, request.url))
    
    // Set NEXORA session cookie
    setSessionCookieInResponse(response, sessionData)
    // Clear temporary OAuth cookies
    clearAuthCookies(response)

    return response
  } catch (err: any) {
    console.error('SSO Callback error:', err)
    const response = NextResponse.redirect(
      new URL(`/auth/unauthorized?reason=${encodeURIComponent(err.message || 'SSO Authentication failed')}`, request.url)
    )
    clearAuthCookies(response)
    return response
  }
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.set('nexora_oauth_state', '', { maxAge: 0, path: '/' })
  response.cookies.set('nexora_code_verifier', '', { maxAge: 0, path: '/' })
  response.cookies.set('nexora_nonce', '', { maxAge: 0, path: '/' })
}

function setSessionCookieInResponse(response: NextResponse, sessionData: any) {
  const { signNexoraSessionToken } = require('@/lib/auth/jwt')
  const sessionToken = signNexoraSessionToken(sessionData, 7 * 24 * 60 * 60)
  response.cookies.set('nexora_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  })
}
