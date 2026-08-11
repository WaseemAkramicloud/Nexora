import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { runEnrichmentPipeline } from '@/lib/enrichment/enrichment-pipeline'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot trigger enrichment jobs' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, providerName, idempotencyKey } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const job = await runEnrichmentPipeline(
      session.tenantId,
      businessId,
      providerName || 'Hunter & Lusha Adapter',
      idempotencyKey
    )

    return NextResponse.json({ job }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to run enrichment' }, { status: 500 })
  }
}
