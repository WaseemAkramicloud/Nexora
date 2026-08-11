import { getSupabaseAdmin } from '../supabase/admin'

export interface LamContractActivationPayload {
  lamCustomerId: string
  lamCompanyId: string
  tenantId: string
  companyName: string
  adminEmail: string
  planTier: 'starter' | 'professional' | 'enterprise'
  maxSeats: number
}

export interface LamEntitlementState {
  lamCustomerId: string
  lamCompanyId: string
  tenantId: string
  productId: string
  entitlementStatus: 'active' | 'suspended' | 'updated'
  planTier: string
  maxSeats: number
}

/**
 * Formal Contract Interface mapping LAM SSO identity and entitlements to NEXORA.
 * Operates purely via secure RPC / API hooks without cross-database table linking.
 */
export async function activateTenantEntitlement(payload: LamContractActivationPayload) {
  const supabase = getSupabaseAdmin()

  // 1. Provision or update Tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .upsert(
      {
        id: payload.tenantId,
        name: payload.companyName,
        slug: payload.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        entitlement_status: 'active',
        plan_tier: payload.planTier || 'enterprise',
        max_seats: payload.maxSeats || 10
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single()

  if (tenantErr) throw tenantErr

  // 2. Audit Event
  await supabase.from('audit_logs').insert({
    tenant_id: payload.tenantId,
    action: 'lam_contract_activated',
    resource: 'tenants',
    details: {
      lamCustomerId: payload.lamCustomerId,
      lamCompanyId: payload.lamCompanyId,
      planTier: payload.planTier
    }
  })

  return tenant
}

export async function suspendTenantEntitlement(tenantId: string, reason: string = 'Administrative suspension via LAM SSO') {
  const supabase = getSupabaseAdmin()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .update({ entitlement_status: 'suspended' })
    .eq('id', tenantId)
    .select('*')
    .single()

  if (error) throw error

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'lam_contract_suspended',
    resource: 'tenants',
    details: { reason }
  })

  return tenant
}

export async function updateTenantEntitlement(
  tenantId: string,
  updates: { planTier?: string; maxSeats?: number; entitlementStatus?: string }
) {
  const supabase = getSupabaseAdmin()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .update({
      plan_tier: updates.planTier,
      max_seats: updates.maxSeats,
      entitlement_status: updates.entitlementStatus || 'active'
    })
    .eq('id', tenantId)
    .select('*')
    .single()

  if (error) throw error

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'lam_contract_updated',
    resource: 'tenants',
    details: updates
  })

  return tenant
}
