import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { mergeBusinesses } from '@/lib/db/nexora-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot merge business profiles' }, { status: 403 })
    }

    const body = await request.json()
    const { sourceBusinessId, targetBusinessId } = body

    if (!sourceBusinessId || !targetBusinessId) {
      return NextResponse.json({ error: 'sourceBusinessId and targetBusinessId are required' }, { status: 400 })
    }

    const mergedProfile = await mergeBusinesses(
      session.tenantId,
      sourceBusinessId,
      targetBusinessId,
      session.membershipId
    )

    return NextResponse.json({ success: true, profile: mergedProfile })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Merge businesses failed' }, { status: 500 })
  }
}
