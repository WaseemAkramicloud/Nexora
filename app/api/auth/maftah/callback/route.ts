import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { setFederationSessionCookie } from '@/lib/auth/session'
import {
  getMaftahOAuthIssuer,
  exchangeMaftahAuthorizationCode,
  verifyMaftahIdToken,
  callMaftahResolveEntry,
  encryptCredential,
  FEDERATION_SESSION_MAX_AGE_SECONDS
} from '@/lib/auth/maftah-oauth'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

  if (errorParam) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, baseUrl), 302)
  }

  const cookieStore = cookies()
  const savedState = cookieStore.get('nexora_maftah_oauth_state')?.value
  const codeVerifier = cookieStore.get('nexora_maftah_code_verifier')?.value
  const savedNonce = cookieStore.get('nexora_maftah_nonce')?.value

  // Clear temporary auth cookies
  cookieStore.delete('nexora_maftah_oauth_state')
  cookieStore.delete('nexora_maftah_code_verifier')
  cookieStore.delete('nexora_maftah_nonce')

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return NextResponse.redirect(new URL('/login?error=invalid_oauth_state', baseUrl), 302)
  }

  // 1. Exchange authorization code for tokens
  const exchangeResult = await exchangeMaftahAuthorizationCode(code, codeVerifier)
  if (!exchangeResult.success || !exchangeResult.tokens) {
    return NextResponse.redirect(new URL('/login?error=token_exchange_failed', baseUrl), 302)
  }

  const tokens = exchangeResult.tokens

  // 2. Validate ID token
  if (!tokens.id_token) {
    return NextResponse.redirect(new URL('/login?error=missing_id_token', baseUrl), 302)
  }

  const idTokenResult = await verifyMaftahIdToken(tokens.id_token, {
    expectedNonce: savedNonce
  })

  if (!idTokenResult.valid || !idTokenResult.payload) {
    return NextResponse.redirect(new URL('/login?error=invalid_id_token', baseUrl), 302)
  }

  const issuer = getMaftahOAuthIssuer()
  const subject = idTokenResult.payload.sub

  // 3. Authoritative Federation Entry Resolution
  const resolveResult = await callMaftahResolveEntry(tokens.access_token)
  if (!resolveResult.success || !resolveResult.data) {
    return NextResponse.redirect(new URL('/login?error=access_not_authorized', baseUrl), 302)
  }

  const resolveData = resolveResult.data
  const adminDb = getSupabaseAdmin()

  // Case A: Multi-Organization Selection Required
  if (resolveData.status === 'organization_selection_required') {
    const tempTxId = crypto.randomUUID()
    const encryptedTokens = encryptCredential(tokens, `${tempTxId}:nexora_maftah_login_transaction`)

    const { data: txId, error: txErr } = await adminDb.rpc('service_create_login_transaction', {
      p_issuer: issuer,
      p_subject: subject,
      p_encrypted_credentials: encryptedTokens.ciphertext,
      p_iv: encryptedTokens.iv,
      p_tag: encryptedTokens.tag
    })

    if (txErr || !txId) {
      return NextResponse.redirect(new URL('/login?error=transaction_creation_failed', baseUrl), 302)
    }

    cookieStore.set('nexora_maftah_tx', txId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60
    })

    return NextResponse.redirect(new URL('/select-workspace', baseUrl), 302)
  }

  // Case B: Single Authorized Organization Entry
  if (resolveData.status === 'authorized' && resolveData.organization) {
    const externalOrgId = resolveData.organization.id

    // 4. Resolve local workspace mapping
    const { data: workspaceLink, error: wsErr } = await adminDb.rpc('service_resolve_federation_workspace', {
      p_issuer: issuer,
      p_external_org_id: externalOrgId
    })

    if (wsErr || !workspaceLink) {
      return NextResponse.redirect(new URL('/login?error=workspace_not_provisioned', baseUrl), 302)
    }

    // 5. Resolve tenant-scoped local identity link
    const { data: identityLink, error: idErr } = await adminDb.rpc('service_get_federation_identity_link', {
      p_issuer: issuer,
      p_subject: subject,
      p_tenant_id: workspaceLink.tenant_id
    })

    if (idErr || !identityLink) {
      return NextResponse.redirect(new URL('/login?error=membership_not_provisioned', baseUrl), 302)
    }

    if (identityLink.error === 'identity_link_conflict') {
      return NextResponse.redirect(new URL('/login?error=identity_link_conflict', baseUrl), 302)
    }

    if (identityLink.membership_status !== 'active') {
      return NextResponse.redirect(new URL('/login?error=membership_not_active', baseUrl), 302)
    }

    // 6. Create federation session (Absolute 8-Hour Session - Stage 6B.7)
    const expiresAt = new Date(Date.now() + FEDERATION_SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    const { data: sessionId, error: sessErr } = await adminDb.rpc('service_create_federation_session', {
      p_membership_id: identityLink.membership_id,
      p_tenant_id: workspaceLink.tenant_id,
      p_issuer: issuer,
      p_subject: subject,
      p_external_org_id: externalOrgId,
      p_expires_at: expiresAt
    })

    if (sessErr || !sessionId) {
      return NextResponse.redirect(new URL('/login?error=session_creation_failed', baseUrl), 302)
    }

    // 7. Store structured encrypted credentials in vault with AAD context
    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
    const credentialPayload = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      access_token_expires_at: tokenExpiresAt,
      credential_version: 1
    }

    const aad = `${sessionId}:1:nexora_maftah_oauth_credentials`
    const encryptedVault = encryptCredential(credentialPayload, aad)

    await adminDb.rpc('service_store_federation_credentials', {
      p_session_id: sessionId,
      p_encrypted_credentials: encryptedVault.ciphertext,
      p_iv: encryptedVault.iv,
      p_tag: encryptedVault.tag
    })

    // 8. Set version-2 nexora_session cookie (8 hours absolute)
    setFederationSessionCookie(sessionId)

    return NextResponse.redirect(new URL('/dashboard', baseUrl), 302)
  }

  // Denied / fail-closed default
  return NextResponse.redirect(new URL('/login?error=access_not_authorized', baseUrl), 302)
}
