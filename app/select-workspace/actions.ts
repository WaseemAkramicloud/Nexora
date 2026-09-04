'use server'

import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { setFederationSessionCookie } from '@/lib/auth/session'
import {
  decryptCredential,
  encryptCredential,
  callMaftahResolveEntry
} from '@/lib/auth/maftah-oauth'

export async function selectWorkspaceAction(formData: FormData) {
  const transactionId = formData.get('transaction_id') as string
  const organizationId = formData.get('organization_id') as string

  if (!transactionId || !organizationId) {
    redirect('/login?error=invalid_selection')
  }

  const adminDb = getSupabaseAdmin()
  const { data: tx, error: txErr } = await adminDb.rpc('service_get_login_transaction', {
    p_transaction_id: transactionId
  })

  if (txErr || !tx || tx.status !== 'pending') {
    redirect('/login?error=transaction_expired')
  }

  let tokens: any
  try {
    tokens = decryptCredential(tx.encrypted_credentials, tx.iv, tx.tag, `${transactionId}:nexora_maftah_login_transaction`)
  } catch {
    redirect('/login?error=credential_decryption_failed')
  }

  // Authoritatively re-verify entry resolution with requested_org_id
  const resolveRes = await callMaftahResolveEntry(tokens.access_token, organizationId)
  if (!resolveRes.success || resolveRes.data?.status !== 'authorized' || !resolveRes.data.organization) {
    redirect('/login?error=organization_access_denied')
  }

  const externalOrgId = resolveRes.data.organization.id
  const issuer = tx.issuer
  const subject = tx.subject

  // Resolve local workspace link
  const { data: workspaceLink, error: wsErr } = await adminDb.rpc('service_resolve_federation_workspace', {
    p_issuer: issuer,
    p_external_org_id: externalOrgId
  })

  if (wsErr || !workspaceLink) {
    redirect('/login?error=workspace_not_provisioned')
  }

  // Resolve tenant-scoped local identity link
  const { data: identityLink, error: idErr } = await adminDb.rpc('service_get_federation_identity_link', {
    p_issuer: issuer,
    p_subject: subject,
    p_tenant_id: workspaceLink.tenant_id
  })

  if (idErr || !identityLink) {
    redirect('/login?error=membership_not_provisioned')
  }

  if (identityLink.error === 'identity_link_conflict') {
    redirect('/login?error=identity_link_conflict')
  }

  if (identityLink.membership_status !== 'active') {
    redirect('/login?error=membership_not_active')
  }

  // Create federation session (60 minutes bounded dev session)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const { data: sessionId, error: sessErr } = await adminDb.rpc('service_create_federation_session', {
    p_membership_id: identityLink.membership_id,
    p_tenant_id: workspaceLink.tenant_id,
    p_issuer: issuer,
    p_subject: subject,
    p_external_org_id: externalOrgId,
    p_expires_at: expiresAt
  })

  if (sessErr || !sessionId) {
    redirect('/login?error=session_creation_failed')
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

  await adminDb.rpc('service_store_federation_credentials', {
    p_session_id: sessionId,
    p_encrypted_credentials: encryptedVault.ciphertext,
    p_iv: encryptedVault.iv,
    p_tag: encryptedVault.tag
  })

  // Consume the login transaction
  await adminDb.rpc('service_consume_login_transaction', {
    p_transaction_id: transactionId
  })

  // Set session cookie (60 minutes) and redirect to dashboard
  setFederationSessionCookie(sessionId)
  redirect('/dashboard')
}
