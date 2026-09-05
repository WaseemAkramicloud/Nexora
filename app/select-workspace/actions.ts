"use server"

import { redirect } from "next/navigation"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { setFederationSessionCookie } from "@/lib/auth/session"
import { logAuthOperationalEvent } from "@/lib/auth/observability"
import {
  decryptCredential,
  encryptCredential,
  callMaftahResolveEntry,
  FEDERATION_SESSION_MAX_AGE_SECONDS
} from "@/lib/auth/maftah-oauth"

export async function selectWorkspaceAction(formData: FormData) {
  const transactionId = formData.get("transaction_id") as string
  const organizationId = formData.get("organization_id") as string

  if (!transactionId || !organizationId) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "invalid_selection"
    })
    redirect("/?error=invalid_selection")
  }

  const adminDb = getSupabaseAdmin()
  const { data: tx, error: txErr } = await adminDb.rpc("service_get_login_transaction", {
    p_transaction_id: transactionId
  })

  if (txErr || !tx || tx.status !== "pending") {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "transaction_expired"
    })
    redirect("/?error=transaction_expired")
  }

  let tokens: any
  try {
    const aad = `${tx.subject}:nexora_maftah_login_transaction`
    tokens = decryptCredential(tx.encrypted_credentials, tx.iv, tx.tag, aad)
  } catch {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "credential_decryption_failed",
      subject: tx.subject
    })
    redirect("/login/maftah?error=credential_decryption_failed")
  }

  // Authoritatively re-verify entry resolution with requested_org_id
  const resolveRes = await callMaftahResolveEntry(tokens.access_token, organizationId)
  if (!resolveRes.success || resolveRes.data?.status !== "authorized" || !resolveRes.data.organization) {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "organization_access_denied",
      subject: tx.subject
    })
    redirect("/?error=organization_access_denied")
  }

  const externalOrgId = resolveRes.data.organization.id
  const issuer = tx.issuer
  const subject = tx.subject

  // Resolve local workspace link
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
      subject
    })
    redirect("/?error=workspace_not_provisioned")
  }

  // Resolve tenant-scoped local identity link
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
      subject
    })
    redirect("/?error=membership_not_provisioned")
  }

  if (identityLink.error === "identity_link_conflict") {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "identity_link_conflict",
      tenantId: workspaceLink.tenant_id,
      externalOrgId,
      subject
    })
    redirect("/?error=identity_link_conflict")
  }

  if (identityLink.membership_status !== "active") {
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "membership_not_active",
      tenantId: workspaceLink.tenant_id,
      externalOrgId,
      subject
    })
    redirect("/?error=membership_not_active")
  }

  // Create federation session (Absolute 8-Hour Session - Stage 6B.7)
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
      subject
    })
    redirect("/?error=session_creation_failed")
  }

  // Store structured encrypted credentials in vault with AAD context
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

  // Consume the login transaction
  await adminDb.rpc("service_consume_login_transaction", {
    p_transaction_id: transactionId
  })

  // Set session cookie (8 hours absolute) and redirect to dashboard
  setFederationSessionCookie(sessionId)

  // Log workspace selection and session creation events
  await logAuthOperationalEvent({
    eventType: "maftah_workspace_selected",
    provider: "maftah",
    outcome: "success",
    tenantId: workspaceLink.tenant_id,
    externalOrgId,
    sessionId,
    subject
  })

  await logAuthOperationalEvent({
    eventType: "maftah_session_created",
    provider: "maftah",
    outcome: "success",
    tenantId: workspaceLink.tenant_id,
    externalOrgId,
    sessionId,
    subject,
    metadata: {
      credential_version: 1
    }
  })

  redirect("/")
}
