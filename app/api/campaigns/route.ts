import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getTenantCampaigns, createCampaignWithTargeting } from '@/lib/db/nexora-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaigns = await getTenantCampaigns(session.tenantId)
    return NextResponse.json({ campaigns })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch campaigns' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check: Only owner, admin/campaign manager, or sales_user can create campaigns
    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers do not have permission to create campaigns' }, { status: 403 })
    }

    const body = await request.json()
    const { campaignData, targetArea, targetingRules } = body

    if (!campaignData?.name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const campaign = await createCampaignWithTargeting(
      session.tenantId,
      {
        ...campaignData,
        owner_id: campaignData.owner_id || session.membershipId
      },
      targetArea || {},
      targetingRules || {}
    )

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create campaign' }, { status: 500 })
  }
}
