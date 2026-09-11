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
  classifyResolverHttpResult,
  classifyResolverPayload,
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
    return NextResponse.redirect(new URL(`/login/maftah?error=${encodeURIComponent(errorParam)}`, baseUrl), 302)
  }

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "invalid_oauth_state",
      correlationId
    })
    return NextResponse.redirect(new URL("/login/maftah?error=invalid_oauth_state", baseUrl), 302)
  }

  // Stage 2: Callback entered
  await logAuthOperationalEvent({
    eventType: "maftah_callback_received",
    provider: "maftah",
    outcome: "success",
    correlationId
  })

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
    return NextResponse.redirect(new URL("/login/maftah?error=token_exchange_failed", baseUrl), 302)
  }

  // Stage 3: Token exchange successful
  await logAuthOperationalEvent({
    eventType: "maftah_token_exchange_success",
    provider: "maftah",
    outcome: "success",
    correlationId
  })

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
    return NextResponse.redirect(new URL("/login/maftah?error=missing_id_token", baseUrl), 302)
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
    return NextResponse.redirect(new URL("/login/maftah?error=invalid_id_token", baseUrl), 302)
  }

  // Stage 4: ID token verified
  await logAuthOperationalEvent({
    eventType: "maftah_id_token_verified",
    provider: "maftah",
    outcome: "success",
    correlationId
  })

  const issuer = getMaftahOAuthIssuer()
  const subject = idTokenResult.payload.sub

  // Stage 5: Resolver call started
  await logAuthOperationalEvent({
    eventType: "maftah_resolver_call_started",
    provider: "maftah",
    outcome: "pending",
    correlationId
  })

  // 3. Authoritative Federation Entry Resolution
  const resolveResult = await callMaftahResolveEntry(tokens.access_token)

  // Stage 6: Resolver HTTP/result classification
  const httpClassification = classifyResolverHttpResult(resolveResult)
  await logAuthOperationalEvent({
    eventType: "maftah_resolver_http_result",
    provider: "maftah",
    outcome: httpClassification.outcome,
    safeErrorCode: httpClassification.safeErrorCode,
    correlationId
  })

  // Stage 7: Resolver payload classification, only when safe JSON was parsed
  let payloadClassification: ReturnType<typeof classifyResolverPayload> | null = null
  if (resolveResult.jsonParsed) {
    payloadClassification = classifyResolverPayload(resolveResult)
    await logAuthOperationalEvent({
      eventType: "maftah_resolver_payload_classified",
      provider: "maftah",
      outcome: payloadClassification.outcome,
      safeErrorCode: payloadClassification.safeErrorCode,
      correlationId
    })
  }

  if (!resolveResult.success || !resolveResult.data) {
    console.log(
      '[NEXORA_MAFTAH_DIAG callback_branch resolve_call_failed]',
      JSON.stringify({
        failureKind: resolveResult.failureKind || 'HTTP_NON_200',
        httpStatus: resolveResult.httpStatus ?? resolveResult.status ?? null,
        bodyStatus: resolveResult.safeUpstreamStatus ?? null,
        bodyError: resolveResult.safeUpstreamError ?? null
      })
    )

    // Stage 8: Resolver failure branch entered
    await logAuthOperationalEvent({
      eventType: "maftah_resolver_failure_branch",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: payloadClassification?.safeErrorCode || httpClassification.safeErrorCode,
      correlationId
    })

    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "access_not_authorized",
      correlationId
    })
    return NextResponse.redirect(new URL("/login/maftah?error=access_not_authorized", baseUrl), 302)
  }

  const resolveData = resolveResult.data
  const adminDb = getSupabaseAdmin()

  // Case A: Multi-Organization Selection Required
  if (resolveData.status === "organization_selection_required") {
    console.log('[NEXORA_MAFTAH_DIAG callback_branch organization_selection_required]')

    // Stage 8: Selection required branch entered
    await logAuthOperationalEvent({
      eventType: "maftah_selection_required_branch_entered",
      provider: "maftah",
      outcome: "info",
      safeErrorCode: "organization_selection_required",
      correlationId
    })

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
    console.log('[NEXORA_MAFTAH_DIAG callback_branch authorized]')

    // Stage 8: Authorized branch entered
    await logAuthOperationalEvent({
      eventType: "maftah_authorized_branch_entered",
      provider: "maftah",
      outcome: "success",
      safeErrorCode: "authorized",
      correlationId
    })

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
      return NextResponse.redirect(new URL("/login/maftah?error=workspace_not_provisioned", baseUrl), 302)
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
      return NextResponse.redirect(new URL("/login/maftah?error=membership_not_provisioned", baseUrl), 302)
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
      return NextResponse.redirect(new URL("/login/maftah?error=identity_link_conflict", baseUrl), 302)
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
      return NextResponse.redirect(new URL("/login/maftah?error=membership_not_active", baseUrl), 302)
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
      return NextResponse.redirect(new URL("/login/maftah?error=session_creation_failed", baseUrl), 302)
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
  console.log(
    '[NEXORA_MAFTAH_DIAG callback_branch unexpected_resolver_status]',
    JSON.stringify({
      httpStatus: resolveResult.httpStatus ?? resolveResult.status ?? null,
      bodyStatus: resolveResult.safeUpstreamStatus ?? null,
      eligibleOrganizationCount: resolveResult.eligibleOrganizationCount ?? null
    })
  )

  // Stage 8: Unexpected status branch entered
  await logAuthOperationalEvent({
    eventType: "maftah_unexpected_status_branch",
    provider: "maftah",
    outcome: "failure",
    safeErrorCode: resolveResult.safeUpstreamStatus || "unexpected_status",
    correlationId
  })

  await logAuthOperationalEvent({
    eventType: "maftah_callback_failed",
    provider: "maftah",
    outcome: "failure",
    safeErrorCode: "access_not_authorized",
    correlationId
  })
  return NextResponse.redirect(new URL("/login/maftah?error=access_not_authorized", baseUrl), 302)
}
