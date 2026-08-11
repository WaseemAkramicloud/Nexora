import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { OfficialWhatsAppCloudAdapter } from '@/lib/integrations/whatsapp-adapter'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot send WhatsApp messages' }, { status: 403 })
    }

    const body = await request.json()
    const { businessId, contactId, phoneNumber, templateName = 'b2b_executive_intro', variables } = body

    if (!businessId || !phoneNumber) {
      return NextResponse.json({ error: 'businessId and phoneNumber parameters are required' }, { status: 400 })
    }

    const adapter = new OfficialWhatsAppCloudAdapter()
    const result = await adapter.sendTemplateMessage({
      tenantId: session.tenantId,
      businessId,
      contactId,
      phoneNumber,
      templateName,
      variables
    })

    return NextResponse.json({ result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'WhatsApp message dispatch failed' }, { status: 400 })
  }
}
