import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getCampaignDetails, archiveCampaign } from '@/lib/db/nexora-service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaign = await getCampaignDetails(session.tenantId, params.id)
    return NextResponse.json({ campaign })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Campaign not found' }, { status: 404 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot archive campaigns' }, { status: 403 })
    }

    const archived = await archiveCampaign(session.tenantId, params.id, session.membershipId)
    return NextResponse.json({ success: true, campaign: archived })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to archive campaign' }, { status: 500 })
  }
}
