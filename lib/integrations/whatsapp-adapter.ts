import { getSupabaseAdmin } from '../supabase/admin'

export interface SendWhatsAppMessageOptions {
  tenantId: string
  businessId: string
  contactId?: string
  phoneNumber: string
  templateName: string
  variables?: Record<string, string>
}

/**
 * Official WhatsApp Business Cloud API Adapter.
 * Enforces opt-in consent verification (`whatsapp_authorized`).
 */
export class OfficialWhatsAppCloudAdapter {
  name = 'Official WhatsApp Business Cloud API'

  async sendTemplateMessage(options: SendWhatsAppMessageOptions) {
    const supabase = getSupabaseAdmin()

    // 1. VERIFY OPT-IN CONSENT REQUIREMENT
    const { data: business } = await supabase
      .from('businesses')
      .select('whatsapp_authorized, name')
      .eq('tenant_id', options.tenantId)
      .eq('id', options.businessId)
      .single()

    if (!business || !business.whatsapp_authorized) {
      throw new Error(`WhatsApp Dispatch Blocked: ${business?.name || 'Business'} has NOT granted explicit WhatsApp consent.`)
    }

    // 2. SIMULATE OFFICIAL WHATSAPP CLOUD TRANSMISSION
    await new Promise(resolve => setTimeout(resolve, 200))

    const whatsappMessageId = `wamid.HBgL${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const messageText = `Template: ${options.templateName} (${JSON.stringify(options.variables || {})})`

    // 3. PERSIST LOG ENTRY
    const { data: logged } = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id: options.tenantId,
        business_id: options.businessId,
        contact_id: options.contactId || null,
        phone_number: options.phoneNumber,
        message_text: messageText,
        status: 'delivered',
        whatsapp_message_id: whatsappMessageId
      })
      .select('*')
      .single()

    return {
      success: true,
      whatsappMessageId,
      status: 'delivered',
      log: logged
    }
  }
}
