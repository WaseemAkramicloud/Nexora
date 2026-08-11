import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { executeDiscoveryJob } from '@/lib/discovery/discovery-engine'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot retry discovery jobs' }, { status: 403 })
    }

    const result = await executeDiscoveryJob(session.tenantId, params.id)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to retry job' }, { status: 500 })
  }
}
