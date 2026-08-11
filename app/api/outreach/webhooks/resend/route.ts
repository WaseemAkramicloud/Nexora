import { NextRequest, NextResponse } from 'next/server'
import { handleOutreachWebhookEvent } from '@/lib/outreach/sequence-engine'
import { ResendSendGridEmailAdapter } from '@/lib/outreach/email-provider-adapter'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rawPayload = await request.text()
    const signature = request.headers.get('x-resend-signature') || request.headers.get('x-webhook-signature') || ''
    const webhookSecret = process.env.OUTREACH_WEBHOOK_SECRET || ''

    // 1. SIGNED WEBHOOK SIGNATURE VERIFICATION
    const adapter = new ResendSendGridEmailAdapter()
    const isValidSignature = adapter.verifyWebhookSignature(rawPayload, signature, webhookSecret)

    if (!isValidSignature) {
      return NextResponse.json({ error: 'Invalid signed webhook signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawPayload || '{}')
    const { event_id, type, recipient, tenant_id, dispatch_id } = payload

    const eventTypeMap: Record<string, any> = {
      'email.delivered': 'delivered',
      'email.bounced': 'bounced',
      'email.replied': 'replied',
      'email.unsubscribed': 'unsubscribed'
    }

    const normalizedEventType = eventTypeMap[type] || 'delivered'

    // 2. EVENT DEDUPLICATION & REPLY-STOP AUTOMATION
    const result = await handleOutreachWebhookEvent(
      tenant_id || 'tenant_nexora_workspace_1',
      event_id || `evt_${Date.now()}`,
      normalizedEventType,
      recipient || payload.email || 'claire.moreau@vanguard-logistics.com',
      dispatch_id
    )

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 500 })
  }
}
