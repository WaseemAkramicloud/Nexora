import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { createDiscoveryJob } from '@/lib/discovery/discovery-engine'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: jobs, error } = await supabase
      .from('discovery_jobs')
      .select('*, campaign:campaigns(name)')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return NextResponse.json({ jobs: jobs || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch discovery jobs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot launch discovery jobs' }, { status: 403 })
    }

    const body = await request.json()
    const { campaignId, params = {}, requestedLimit = 100, idempotencyKey } = body

    const job = await createDiscoveryJob(
      session.tenantId,
      campaignId || null,
      params,
      requestedLimit,
      idempotencyKey
    )

    return NextResponse.json({ job }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to launch discovery job' }, { status: 500 })
  }
}
