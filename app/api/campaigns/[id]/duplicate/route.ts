import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { duplicateCampaign } from '@/lib/db/nexora-service'

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
      return NextResponse.json({ error: 'Viewers cannot duplicate campaigns' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const newCampaign = await duplicateCampaign(
      session.tenantId,
      params.id,
      body.name,
      session.membershipId
    )

    return NextResponse.json({ campaign: newCampaign }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to duplicate campaign' }, { status: 500 })
  }
}
