import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { MockApolloDiscoveryAdapter } from '@/lib/adapters/discovery-adapter'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      targetArea = {},
      targetingRules = {},
      desiredResultLimit = 100
    } = body

    const adapter = new MockApolloDiscoveryAdapter()
    const discovered = await adapter.searchBusinesses({
      industry: targetingRules.business_categories?.[0] || 'Technology & Software',
      city: targetArea.city || 'Paris',
      country: targetArea.country || 'France',
      limit: desiredResultLimit
    })

    // Calculate estimated total matches based on criteria density
    const categoryMultiplier = Math.max(1, (targetingRules.business_categories?.length || 1))
    const radiusMultiplier = Math.max(1, Math.round((targetArea.radius_km || 30) / 10))
    const estimatedTotalMatches = Math.min(2500, Math.round(discovered.length * 45 * categoryMultiplier * radiusMultiplier))

    // Calculate estimated credit usage
    const estimatedCreditsCost = Math.round(desiredResultLimit * 2.5) // 1 credit discovery + 1.5 enrichment avg

    // Usage Warning Framework
    let usageWarning: string | null = null
    let usageWarningType: 'info' | 'warning' | 'critical' = 'info'

    if (desiredResultLimit > 500) {
      usageWarning = `High Result Volume Warning: Requesting ${desiredResultLimit} leads will consume ~${estimatedCreditsCost} discovery & enrichment credits.`
      usageWarningType = 'warning'
    } else if (desiredResultLimit > 1000) {
      usageWarning = `Critical Usage Alert: Result limit of ${desiredResultLimit} exceeds recommended campaign batch size. High credit consumption.`
      usageWarningType = 'critical'
    }

    return NextResponse.json({
      success: true,
      estimatedTotalMatches,
      sampleResults: discovered,
      estimatedCreditsCost,
      desiredResultLimit,
      usageWarning,
      usageWarningType,
      polygonReady: targetArea.geography_type === 'polygon'
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Targeting preview failed' }, { status: 500 })
  }
}
