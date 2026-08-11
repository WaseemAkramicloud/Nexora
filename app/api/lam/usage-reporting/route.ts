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

    // Calls isolated RPC function get_lam_entitlement_summary without exposing operational tables
    const { data: summary, error } = await supabase.rpc('get_lam_entitlement_summary', {
      p_tenant_id: session.tenantId
    })

    if (error) {
      // Fallback usage calculation if RPC not created yet
      const { data: ledger } = await supabase
        .from('usage_ledger')
        .select('event_type, credits_consumed')
        .eq('tenant_id', session.tenantId)

      let total = 0
      const breakdown: Record<string, number> = {
        discovery_credits: 0,
        enrichment_credits: 0,
        verification_credits: 0,
        email_credits: 0,
        ai_credits: 0
      }

      ;(ledger || []).forEach((row: any) => {
        total += row.credits_consumed || 1
        if (row.event_type === 'discovery_search') breakdown.discovery_credits += row.credits_consumed || 1
        if (row.event_type === 'enrichment_credit') breakdown.enrichment_credits += row.credits_consumed || 1
        if (row.event_type === 'verification_check') breakdown.verification_credits += row.credits_consumed || 1
        if (row.event_type === 'email_dispatch') breakdown.email_credits += row.credits_consumed || 1
        if (row.event_type === 'ai_qualification') breakdown.ai_credits += row.credits_consumed || 1
      })

      return NextResponse.json({
        entitlement_summary: {
          tenant_id: session.tenantId,
          total_credits_consumed: total,
          breakdown,
          reported_at: new Date().toISOString(),
          status: 'Synced with LAM SSO'
        }
      })
    }

    return NextResponse.json({ entitlement_summary: summary })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'LAM usage reporting failed' }, { status: 500 })
  }
}
