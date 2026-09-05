import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { setFederationSessionCookie } from "@/lib/auth/session"
import { getNexoraBaseUrl } from "@/lib/auth/config"
import { logAuthOperationalEvent } from "@/lib/auth/observability"
import {
  getMaftahOAuthIssuer,
  exchangeMaftahAuthorizationCode,
  verifyMaftahIdToken,
  callMaftahResolveEntry,
  encryptCredential,
  FEDERATION_SESSION_MAX_AGE_SECONDS
} from "@/lib/auth/maftah-oauth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  const baseUrl = getNexoraBaseUrl()

  const cookieStore = cookies()
  const savedState = cookieStore.get("nexora_maftah_oauth_state")?.value
  const codeVerifier = cookieStore.get("nexora_maftah_code_verifier")?.value
  const savedNonce = cookieStore.get("nexora_maftah_nonce")?.value
  const correlationId = cookieStore.get("nexora_maftah_corr_id")?.value || null

  // Clear temporary auth cookies
  cookieStore.delete("nexora_maftah_oauth_state")
  cookieStore.delete("nexora_maftah_code_verifier")
  cookieStore.delete("nexora_maftah_nonce")
  cookieStore.delete("nexora_maftah_corr_id")

  if (errorParam) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: errorParam,
      correlationId
    })
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorParam)}`, baseUrl), 302)
  }

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "invalid_oauth_state",
      correlationId
    })
    return NextResponse.redirect(new URL("/?error=invalid_oauth_state", baseUrl), 302)
  }

  // 1. Exchange authorization code for tokens
  const exchangeResult = await exchangeMaftahAuthorizationCode(code, codeVerifier)
  if (!exchangeResult.success || !exchangeResult.tokens) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "token_exchange_failed",
      correlationId
    })
    return NextResponse.redirect(new URL("/?error=token_exchange_failed", baseUrl), 302)
  }

  const tokens = exchangeResult.tokens

  // 2. Validate ID token
  if (!tokens.id_token) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "missing_id_token",
      correlationId
    })
    return NextResponse.redirect(new URL("/?error=missing_id_token", baseUrl), 302)
  }

  const idTokenResult = await verifyMaftahIdToken(tokens.id_token, {
    expectedNonce: savedNonce
  })

  if (!idTokenResult.valid || !idTokenResult.payload) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "invalid_id_token",
      correlationId
    })
    return NextResponse.redirect(new URL("/?error=invalid_id_token", baseUrl), 302)
  }

  const issuer = getMaftahOAuthIssuer()
  const subject = idTokenResult.payload.sub

  // 3. Authoritative Federation Entry Resolution
  const resolveResult = await callMaftahResolveEntry(tokens.access_token)
  if (!resolveResult.success || !resolveResult.data) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "access_not_authorized",
      subject,
      correlationId
    })
    return NextResponse.redirect(new URL("/?error=access_not_authorized", baseUrl), 302)
  }

  const resolveData = resolveResult.data
  const adminDb = getSupabaseAdmin()

  // Case A: Multi-Organization Selection Required
  if (resolveData.status === "organization_selection_required") {
    const aad = `${subject}:nexora_maftah_login_transaction`
    const encryptedTokens = encryptCredential(tokens, aad)

    const { data: txId, error: txErr } = await adminDb.rpc("service_create_login_transaction", {
      p_issuer: issuer,
      p_subject: subject,
      p_encrypted_credentials: encryptedTokens.ciphertext,
      p_iv: encryptedTokens.iv,
      p_tag: encryptedTokens.tag
    })

    if (txErr || !txId) {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "transaction_creation_failed",
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/login/maftah?error=transaction_creation_failed", baseUrl), 302)
    }

    await logAuthOperationalEvent({
      eventType: "maftah_selection_required",
      provider: "maftah",
      outcome: "info",
      subject,
      correlationId
    })

    const txCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 10 * 60
    }

    cookieStore.set("nexora_maftah_tx", txId, txCookieOptions)

    const redirectRes = NextResponse.redirect(new URL("/select-workspace", baseUrl), 302)
    redirectRes.cookies.set("nexora_maftah_tx", txId, txCookieOptions)

    return redirectRes
  }

  // Case B: Single Authorized Organization Entry
  if (resolveData.status === "authorized" && resolveData.organization) {
    const externalOrgId = resolveData.organization.id

    // 4. Resolve local workspace mapping
    const { data: workspaceLink, error: wsErr } = await adminDb.rpc("service_resolve_federation_workspace", {
      p_issuer: issuer,
      p_external_org_id: externalOrgId
    })

    if (wsErr || !workspaceLink) {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "workspace_not_provisioned",
        externalOrgId,
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/?error=workspace_not_provisioned", baseUrl), 302)
    }

    // 5. Resolve tenant-scoped local identity link
    const { data: identityLink, error: idErr } = await adminDb.rpc("service_get_federation_identity_link", {
      p_issuer: issuer,
      p_subject: subject,
      p_tenant_id: workspaceLink.tenant_id
    })

    if (idErr || !identityLink) {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "membership_not_provisioned",
        tenantId: workspaceLink.tenant_id,
        externalOrgId,
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/?error=membership_not_provisioned", baseUrl), 302)
    }

    if (identityLink.error === "identity_link_conflict") {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "identity_link_conflict",
        tenantId: workspaceLink.tenant_id,
        externalOrgId,
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/?error=identity_link_conflict", baseUrl), 302)
    }

    if (identityLink.membership_status !== "active") {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "membership_not_active",
        tenantId: workspaceLink.tenant_id,
        externalOrgId,
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/?error=membership_not_active", baseUrl), 302)
    }

    // 6. Create federation session (Absolute 8-Hour Session - Stage 6B.7)
    const expiresAt = new Date(Date.now() + FEDERATION_SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    const { data: sessionId, error: sessErr } = await adminDb.rpc("service_create_federation_session", {
      p_membership_id: identityLink.membership_id,
      p_tenant_id: workspaceLink.tenant_id,
      p_issuer: issuer,
      p_subject: subject,
      p_external_org_id: externalOrgId,
      p_expires_at: expiresAt
    })

    if (sessErr || !sessionId) {
      await logAuthOperationalEvent({
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "session_creation_failed",
        tenantId: workspaceLink.tenant_id,
        externalOrgId,
        subject,
        correlationId
      })
      return NextResponse.redirect(new URL("/?error=session_creation_failed", baseUrl), 302)
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

    await adminDb.rpc("service_store_federation_credentials", {
      p_session_id: sessionId,
      p_encrypted_credentials: encryptedVault.ciphertext,
      p_iv: encryptedVault.iv,
      p_tag: encryptedVault.tag
    })

    // 8. Set version-2 nexora_session cookie (8 hours absolute)
    setFederationSessionCookie(sessionId)

    // 9. Log Success Events
    await logAuthOperationalEvent({
      eventType: "maftah_session_created",
      provider: "maftah",
      outcome: "success",
      tenantId: workspaceLink.tenant_id,
      externalOrgId,
      sessionId,
      subject,
      correlationId,
      metadata: {
        credential_version: 1
      }
    })

    await logAuthOperationalEvent({
      eventType: "maftah_callback_success",
      provider: "maftah",
      outcome: "success",
      tenantId: workspaceLink.tenant_id,
      externalOrgId,
      sessionId,
      subject,
      correlationId
    })

    return NextResponse.redirect(new URL("/", baseUrl), 302)
  }

  // Denied / fail-closed default
  await logAuthOperationalEvent({
    eventType: "maftah_callback_failed",
    provider: "maftah",
    outcome: "failure",
    safeErrorCode: "access_not_authorized",
    subject,
    correlationId
  })
  return NextResponse.redirect(new URL("/?error=access_not_authorized", baseUrl), 302)
}
