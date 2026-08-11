import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getRealEventAnalytics } from '@/lib/analytics/analytics-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaignId = request.nextUrl.searchParams.get('campaignId') || undefined
    const analytics = await getRealEventAnalytics(session.tenantId, campaignId)

    return NextResponse.json({ analytics })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch analytics' }, { status: 500 })
  }
}
