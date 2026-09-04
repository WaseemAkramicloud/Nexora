#!/usr/bin/env node

/**
 * LAM Maftah -> NEXORA Multi-Tenant Federation Link Provisioning Utility (Stage 6B.6A)
 *
 * Supports provisioning one Maftah subject into multiple distinct NEXORA tenants!
 *
 * Usage:
 *   node scripts/provision-maftah-nexora-link.mjs --dry-run \
 *     --tenant-id <UUID> \
 *     --membership-id <UUID> \
 *     --maftah-org-id <UUID> \
 *     --maftah-subject <UUID>
 *
 * Options:
 *   --execute       Execute database insertion (default is dry-run)
 *   --tenant-id     NEXORA tenant UUID (public.tenants.id)
 *   --membership-id NEXORA membership UUID (public.memberships.id)
 *   --maftah-org-id Maftah organization UUID (public.organizations.id)
 *   --maftah-subject Maftah user subject UUID (auth.users.id)
 *   --issuer        Maftah issuer (default: https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1)
 */

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const isExecute = args.includes('--execute')

function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return null
}

const tenantId = getArg('tenant-id')
const membershipId = getArg('membership-id')
const maftahOrgId = getArg('maftah-org-id')
const maftahSubject = getArg('maftah-subject')
const issuer = getArg('issuer') || 'https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1'

if (!tenantId || !membershipId || !maftahOrgId || !maftahSubject) {
  console.log('Error: Missing required arguments.')
  console.log('Required: --tenant-id, --membership-id, --maftah-org-id, --maftah-subject')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zfancncassjmghxzogbm.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log('======================================================')
  console.log('NEXORA Multi-Tenant Federation Provisioning Tool')
  console.log(`Mode: ${isExecute ? 'EXECUTE' : 'DRY-RUN'}`)
  console.log('======================================================')
  console.log(`Tenant ID:         ${tenantId}`)
  console.log(`Membership ID:     ${membershipId}`)
  console.log(`Maftah Org ID:     ${maftahOrgId}`)
  console.log(`Maftah Subject:    ${maftahSubject}`)
  console.log(`Issuer:            ${issuer}`)
  console.log('------------------------------------------------------')

  // 1. Verify tenant exists in NEXORA DB
  const { data: tenant, error: tErr } = await supabase.from('tenants').select('id, name, status').eq('id', tenantId).single()
  if (tErr || !tenant) {
    console.error(`[ERROR] Tenant '${tenantId}' not found in NEXORA database.`)
    process.exit(1)
  }
  console.log(`[PASS] Tenant found: ${tenant.name} (${tenant.status})`)

  // 2. Verify membership exists and belongs to tenant
  const { data: membership, error: mErr } = await supabase.from('memberships').select('id, tenant_id, email, role, status').eq('id', membershipId).single()
  if (mErr || !membership) {
    console.error(`[ERROR] Membership '${membershipId}' not found in NEXORA database.`)
    process.exit(1)
  }
  if (membership.tenant_id !== tenantId) {
    console.error(`[ERROR] Membership belongs to tenant '${membership.tenant_id}', not specified tenant '${tenantId}'.`)
    process.exit(1)
  }
  console.log(`[PASS] Membership found: ${membership.email} (role: ${membership.role}, status: ${membership.status})`)

  if (!isExecute) {
    console.log('\n[DRY-RUN] Plan verified successfully. Re-run with --execute to commit links.')
    return
  }

  // 3. Execute authoritative provisioning RPC
  const { data: result, error: rpcErr } = await supabase.rpc('service_provision_federation_link', {
    p_tenant_id: tenantId,
    p_membership_id: membershipId,
    p_issuer: issuer,
    p_external_org_id: maftahOrgId,
    p_subject: maftahSubject
  })

  if (rpcErr || !result?.success) {
    console.error(`[ERROR] Failed to provision federation link: ${rpcErr?.message || result?.error}`)
    process.exit(1)
  }

  console.log('[SUCCESS] Multi-tenant federation links provisioned successfully.')
  console.log('======================================================')
}

main()
