import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // 1. Verify Platform Administrator Role
    const { data: adminRecord } = await supabase
      .from('platform_administrators')
      .select('*')
      .eq('lam_customer_id', session.lamCustomerId)
      .eq('status', 'active')
      .maybeSingle()

    const isPlatformSuperadmin = session.isPlatformAdmin || Boolean(adminRecord)

    if (!isPlatformSuperadmin) {
      return NextResponse.json({ error: 'Forbidden: Platform Superadmin access required.' }, { status: 403 })
    }

    // 2. Fetch System-Wide Tenant Overview (Aggregated, no individual customer leads)
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, slug, status, plan, entitlement_status, plan_tier, max_seats, created_at')
      .order('created_at', { ascending: false })

    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('id, action, resource, created_at, tenant_id')
      .order('created_at', { ascending: false })
      .limit(30)

    const { data: webhookHealth } = await supabase
      .from('webhook_health')
      .select('*')

    return NextResponse.json({
      platformOverview: {
        totalTenants: tenants?.length || 0,
        tenants: tenants || [],
        recentAuditEvents: auditLogs || [],
        webhookHealth: webhookHealth || []
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Platform administration query failed' }, { status: 500 })
  }
}
