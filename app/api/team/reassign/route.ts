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

    if (session.role !== 'owner' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can reassign ownership' }, { status: 403 })
    }

    const body = await request.json()
    const { sourceOwnerId, targetOwnerId, businessIds } = body
    const supabase = getSupabaseAdmin()

    if (!targetOwnerId) {
      return NextResponse.json({ error: 'targetOwnerId parameter is required' }, { status: 400 })
    }

    let query = supabase
      .from('businesses')
      .update({ owner_id: targetOwnerId })
      .eq('tenant_id', session.tenantId)

    if (businessIds && businessIds.length > 0) {
      query = query.in('id', businessIds)
    } else if (sourceOwnerId) {
      query = query.eq('owner_id', sourceOwnerId)
    }

    const { data: updated, error } = await query.select('id')
    if (error) throw error

    // Log Audit Event
    await supabase.from('audit_logs').insert({
      tenant_id: session.tenantId,
      action: 'team_ownership_reassigned',
      resource: 'businesses',
      details: {
        sourceOwnerId,
        targetOwnerId,
        reassignedCount: updated?.length || 0
      }
    })

    return NextResponse.json({ success: true, count: updated?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Ownership reassignment failed' }, { status: 500 })
  }
}
