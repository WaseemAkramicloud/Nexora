export interface DirectMessage {
  channel: 'whatsapp' | 'sms' | 'linkedin'
  recipientPhoneOrId: string
  content: string
  mediaUrl?: string
}

export interface MessagingResult {
  messageId: string
  channel: 'whatsapp' | 'sms' | 'linkedin'
  status: 'delivered' | 'read' | 'queued' | 'failed'
  timestamp: string
}

export interface IBusinessMessagingAdapter {
  name: string
  sendMessage(msg: DirectMessage): Promise<MessagingResult>
}

export class MockTwilioWhatsAppMessagingAdapter implements IBusinessMessagingAdapter {
  name = 'Twilio & Meta WhatsApp Business Cloud'

  async sendMessage(msg: DirectMessage): Promise<MessagingResult> {
    return {
      messageId: 'wmid_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      channel: msg.channel,
      status: 'delivered',
      timestamp: new Date().toISOString()
    }
  }
}
