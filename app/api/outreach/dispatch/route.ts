import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { dispatchOutreachSequence } from '@/lib/outreach/sequence-engine'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot dispatch outreach sequences' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, sequenceId, stepNumber = 1 } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId parameter is required' }, { status: 400 })
    }

    // Executes Approved Leads Only check and Variable Interpolation
    const dispatch = await dispatchOutreachSequence(session.tenantId, businessId, sequenceId, stepNumber)

    return NextResponse.json({ dispatch }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Dispatch failed' }, { status: 400 })
  }
}
