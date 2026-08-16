import { NextRequest, NextResponse } from 'next/server'
import { validateInterServiceRequest } from '@/lib/auth/inter-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getOrCreateTenantForCompany } from '@/lib/db/nexora-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-lam-signature')
    const timestamp = request.headers.get('x-lam-timestamp')
    const nonce = request.headers.get('x-lam-nonce')

    // 1. Authenticate Inter-Service Request
    const authResult = validateInterServiceRequest(rawBody, { signature, timestamp, nonce })
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized inter-service request' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const { action, lamCompanyId, companyName, planTier, maxSeats, productId } = payload

    if (!action || !lamCompanyId) {
      return NextResponse.json({ error: 'Missing required parameters: action and lamCompanyId' }, { status: 400 })
    }

    if (productId && productId !== 'nexora') {
      return NextResponse.json({ error: `Provisioning request target product '${productId}' does not match NEXORA` }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 2. Execute Provisioning Action
    if (action === 'activate') {
      // Idempotent Tenant Provisioning
      const tenant = await getOrCreateTenantForCompany(lamCompanyId, companyName || 'Enterprise Workspace')

      // Update plan/seats
      await supabase
        .from('tenants')
        .update({
          status: 'active',
          entitlement_status: 'active',
          plan_tier: planTier || 'enterprise',
          max_seats: maxSeats || 10
        })
        .eq('id', tenant.id)

      return NextResponse.json({
        success: true,
        tenantId: tenant.id,
        lamCompanyId,
        status: 'active',
        message: 'Tenant workspace provisioned/activated idempotently'
      })
    }

    if (action === 'suspend') {
      // Suspend tenant access without deleting operational customer data
      const { data: tenant, error } = await supabase
        .from('tenants')
        .update({
          status: 'suspended',
          entitlement_status: 'suspended'
        })
        .eq('lam_company_id', lamCompanyId)
        .select('*')
        .single()

      if (error || !tenant) {
        return NextResponse.json({ error: `Tenant workspace for company '${lamCompanyId}' not found.` }, { status: 404 })
      }

      await supabase.from('audit_logs').insert({
        tenant_id: tenant.id,
        action: 'tenant_entitlement_suspended',
        resource: 'tenants',
        details: { reason: 'Inter-service suspension event from LAM ID' }
      })

      return NextResponse.json({
        success: true,
        tenantId: tenant.id,
        lamCompanyId,
        status: 'suspended',
        message: 'Tenant workspace access suspended gracefully'
      })
    }

    if (action === 'update_entitlement') {
      const { data: tenant, error } = await supabase
        .from('tenants')
        .update({
          plan_tier: planTier,
          max_seats: maxSeats,
          entitlement_status: payload.entitlementStatus || 'active'
        })
        .eq('lam_company_id', lamCompanyId)
        .select('*')
        .single()

      if (error || !tenant) {
        return NextResponse.json({ error: `Tenant workspace for company '${lamCompanyId}' not found.` }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        tenantId: tenant.id,
        lamCompanyId,
        status: tenant.entitlement_status,
        message: 'Tenant entitlement updated successfully'
      })
    }

    if (action === 'deprovision' || action === 'delete') {
      // Deletion of test/deprovisioned tenant workspace
      // Validate that tenant actually belongs to lamCompanyId
      const { data: tenant, error: fetchErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('lam_company_id', lamCompanyId)
        .maybeSingle()

      if (fetchErr) {
        return NextResponse.json({ error: `Database error querying tenant: ${fetchErr.message}` }, { status: 500 })
      }

      if (!tenant) {
        return NextResponse.json({
          success: true,
          lamCompanyId,
          message: 'Tenant workspace not found or already deleted'
        })
      }

      const tenantId = tenant.id

      // Delete dependent tables in order to maintain FK integrity
      await supabase.from('team_invitations').delete().eq('tenant_id', tenantId)
      await supabase.from('memberships').delete().eq('tenant_id', tenantId)
      await supabase.from('activities').delete().eq('tenant_id', tenantId)
      await supabase.from('lead_records').delete().eq('tenant_id', tenantId)
      await supabase.from('contacts').delete().eq('tenant_id', tenantId)
      await supabase.from('business_sources').delete().eq('tenant_id', tenantId)
      await supabase.from('businesses').delete().eq('tenant_id', tenantId)
      await supabase.from('campaign_targeting_rules').delete().eq('tenant_id', tenantId)
      await supabase.from('target_areas').delete().eq('tenant_id', tenantId)
      await supabase.from('campaigns').delete().eq('tenant_id', tenantId)
      await supabase.from('audit_logs').delete().eq('tenant_id', tenantId)

      // Delete business_merges if present
      await supabase.from('business_merges').delete().eq('tenant_id', tenantId)

      // Finally delete tenant workspace
      const { error: delErr } = await supabase.from('tenants').delete().eq('id', tenantId)
      if (delErr) {
        return NextResponse.json({ error: `Failed to delete tenant record: ${delErr.message}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        tenantId,
        lamCompanyId,
        message: 'Tenant workspace deprovisioned and deleted successfully'
      })
    }

    return NextResponse.json({ error: `Unsupported provisioning action: '${action}'` }, { status: 400 })
  } catch (err: any) {
    console.error('Provisioning inter-service error:', err)
    return NextResponse.json({ error: err.message || 'Inter-service provisioning failed' }, { status: 500 })
  }
}
