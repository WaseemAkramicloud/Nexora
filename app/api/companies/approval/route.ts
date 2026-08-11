import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot change approval state' }, { status: 403 })
    }

    const body = await request.json()
    const { businessIds = [], approvalState } = body

    const validStates = ['Pending Review', 'Approved for Outreach', 'Excluded', 'Needs Research']
    if (!validStates.includes(approvalState)) {
      return NextResponse.json({ error: 'Invalid approval state' }, { status: 400 })
    }

    if (!businessIds || businessIds.length === 0) {
      return NextResponse.json({ error: 'businessIds array required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('businesses')
      .update({
        approval_state: approvalState,
        approved_by: session.membershipId,
        approved_at: now
      })
      .eq('tenant_id', session.tenantId)
      .in('id', businessIds)
      .select('id')

    if (error) throw error

    // Log Human Approval Event in Audit Logs
    await supabase.from('audit_logs').insert({
      tenant_id: session.tenantId,
      action: 'human_lead_approval_updated',
      resource: 'businesses',
      details: {
        approval_state: approvalState,
        approved_by_membership: session.membershipId,
        user_id: session.lamCustomerId,
        count: updated?.length || 0,
        business_ids: businessIds
      }
    })


    return NextResponse.json({ success: true, count: updated?.length || 0, approvalState })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Approval state update failed' }, { status: 500 })
  }
}
