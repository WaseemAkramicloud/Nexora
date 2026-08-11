export interface EmailMessage {
  to: string
  subject: string
  bodyHtml: string
  fromName?: string
  replyTo?: string
  trackingEnabled?: boolean
}

export interface EmailDeliveryResult {
  messageId: string
  status: 'sent' | 'queued' | 'failed'
  recipient: string
  timestamp: string
  error?: string
}


export interface IEmailAdapter {
  name: string
  sendEmail(message: EmailMessage): Promise<EmailDeliveryResult>
  sendBatch(messages: EmailMessage[]): Promise<EmailDeliveryResult[]>
}

export class MockSendGridEmailAdapter implements IEmailAdapter {
  name = 'SendGrid / Resend Enterprise Outreach'

  async sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    return {
      messageId: 'msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      status: 'sent',
      recipient: message.to,
      timestamp: new Date().toISOString()
    }
  }

  async sendBatch(messages: EmailMessage[]): Promise<EmailDeliveryResult[]> {
    return Promise.all(messages.map(m => this.sendEmail(m)))
  }
}
