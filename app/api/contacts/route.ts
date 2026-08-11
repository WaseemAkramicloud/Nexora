import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { createOrUpdateContact } from '@/lib/db/nexora-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot create contacts' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, contactData } = body

    if (!businessId || !contactData?.first_name) {
      return NextResponse.json({ error: 'businessId and contact first_name are required' }, { status: 400 })
    }

    const contact = await createOrUpdateContact(session.tenantId, businessId, contactData)

    return NextResponse.json({ contact }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create contact' }, { status: 500 })
  }
}
