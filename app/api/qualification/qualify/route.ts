import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { qualifyBusinessWithAI } from '@/lib/ai/qualification-engine'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot run AI qualification' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, businessIds = [], options = {} } = body

    if (businessId) {
      const qualification = await qualifyBusinessWithAI(session.tenantId, businessId, options)
      return NextResponse.json({ qualification }, { status: 201 })
    }

    if (businessIds && businessIds.length > 0) {
      const results = []
      for (const id of businessIds) {
        try {
          const res = await qualifyBusinessWithAI(session.tenantId, id, options)
          results.push(res)
        } catch (e) {
          // ignore single failure
        }
      }
      return NextResponse.json({ count: results.length, qualifications: results }, { status: 201 })
    }

    return NextResponse.json({ error: 'businessId or businessIds required' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI qualification failed' }, { status: 500 })
  }
}
