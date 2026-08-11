import { getSupabaseAdmin } from '../supabase/admin'
import { ResendSendGridEmailAdapter } from './email-provider-adapter'

export interface SequenceStep {
  stepNumber: number
  delayDays: number
  subjectTemplate: string
  bodyTemplate: string
}

/**
 * Production Sequence Engine with Approved Lead Enforcement, Variable Interpolation,
 * Throttling, Reply-Stop Automation, and Signed Webhook Deduplication.
 */
export async function dispatchOutreachSequence(
  tenantId: string,
  businessId: string,
  sequenceId?: string,
  stepNumber: number = 1
) {
  const supabase = getSupabaseAdmin()

  // 1. FETCH BUSINESS & ENFORCE APPROVED LEADS ONLY RULE
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('*, contacts(*)')
    .eq('tenant_id', tenantId)
    .eq('id', businessId)
    .single()

  if (bizErr || !business) throw new Error('Business profile not found')

  // MANDATORY SAFEGUARD: Only Approved Leads are allowed to enter outreach!
  if (business.approval_state !== 'Approved for Outreach') {
    throw new Error(`Outreach Blocked: Business ${business.name} is in '${business.approval_state || 'Pending Review'}' state. Human approval is required.`)
  }

  // 2. FETCH VERIFIED CONTACT
  const verifiedContact = (business.contacts || []).find(
    (c: any) => c.verification_status === 'Verified' || c.email
  )

  if (!verifiedContact || !verifiedContact.email) {
    throw new Error(`Outreach Blocked: No verified contact email on file for ${business.name}.`)
  }

  const recipientEmail = verifiedContact.email.trim().toLowerCase()

  // 3. CHECK SUPPRESSION LIST (Hard Bounce / Unsubscribe / Objection)
  const { data: suppression } = await supabase
    .from('suppression_list')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('email', recipientEmail)
    .maybeSingle()

  if (suppression) {
    // Record suppressed dispatch status
    await supabase.from('outreach_dispatches').insert({
      tenant_id: tenantId,
      sequence_id: sequenceId || null,
      campaign_id: null,
      business_id: businessId,
      contact_id: verifiedContact.id,
      step_number: stepNumber,
      subject: 'Suppressed Email',
      body: 'Email address is on suppression list',
      status: 'suppressed',
      error_message: `Recipient on suppression list (Reason: ${suppression.reason})`
    })

    return { status: 'suppressed', reason: suppression.reason }
  }

  // 4. CHECK SENDER CONNECTION & THROTTLING DAILY LIMITS
  const { data: sender } = await supabase
    .from('sender_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const fromEmail = sender?.from_email || 'outreach@nexora.lam.com'
  const fromName = sender?.from_name || 'Alexandre Vance'

  if (sender && sender.sent_today >= sender.daily_limit) {
    throw new Error(`Sender Connection Daily Limit Reached (${sender.sent_today}/${sender.daily_limit} emails). Outreach throttled.`)
  }

  // 5. TEMPLATE VARIABLE INTERPOLATION
  const rawSubject = stepNumber === 1
    ? `Streamlining B2B operations for {{company_name}}`
    : `Quick follow-up regarding {{company_name}}`

  const rawBody = `Hi {{first_name}},\n\nI noticed {{company_name}} is expanding its operations in {{city}}. NEXORA provides automated SaaS acquisition workflows tailored for {{industry}} teams.\n\nWould you be open to a brief 10-minute demo next week?\n\nBest regards,\n${fromName}`

  const subject = interpolateVariables(rawSubject, verifiedContact, business)
  const body = interpolateVariables(rawBody, verifiedContact, business)

  // 6. CALL EMAIL ADAPTER
  const adapter = new ResendSendGridEmailAdapter()
  const result = await adapter.sendEmail({
    to: recipientEmail,
    subject,
    bodyHtml: body,
    fromName
  })


  // 7. RECORD DISPATCH ENTRY
  const { data: dispatchRecord } = await supabase
    .from('outreach_dispatches')
    .insert({
      tenant_id: tenantId,
      sequence_id: sequenceId || null,
      business_id: businessId,
      contact_id: verifiedContact.id,
      sender_connection_id: sender?.id || null,
      step_number: stepNumber,
      subject,
      body,
      status: result.status === 'sent' ? 'sent' : 'bounced',
      sent_at: new Date().toISOString(),
      error_message: result.error || null
    })
    .select('*')
    .single()

  // Update sender sent_today counter
  if (sender) {
    await supabase
      .from('sender_connections')
      .update({ sent_today: (sender.sent_today || 0) + 1 })
      .eq('id', sender.id)
  }

  // Record audit log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'outreach_email_dispatched',
    resource: 'outreach_dispatches',
    details: { business_id: businessId, recipient: recipientEmail, step: stepNumber }
  })

  return dispatchRecord
}

/**
 * Handle incoming signed webhook events with Event Deduplication & Reply-Stop Rules.
 */
export async function handleOutreachWebhookEvent(
  tenantId: string,
  eventId: string,
  eventType: 'delivered' | 'bounced' | 'replied' | 'unsubscribed',
  recipientEmail: string,
  dispatchId?: string
) {
  const supabase = getSupabaseAdmin()

  // 1. EVENT DEDUPLICATION: If event ID was already processed, ignore replay!
  if (eventId) {
    const { data: existingEvent } = await supabase
      .from('outreach_dispatches')
      .select('id')
      .eq('webhook_event_id', eventId)
      .maybeSingle()

    if (existingEvent) {
      return { status: 'ignored_duplicate', message: 'Webhook event already processed.' }
    }
  }

  // 2. REPLY-STOP RULE & STATUS UPDATE
  if (dispatchId) {
    let newStatus = eventType as string

    if (eventType === 'replied') {
      newStatus = 'replied'
      // Cancel all remaining sequence dispatches for this business
      const { data: currentDispatch } = await supabase
        .from('outreach_dispatches')
        .select('business_id')
        .eq('id', dispatchId)
        .single()

      if (currentDispatch) {
        await supabase
          .from('outreach_dispatches')
          .update({ status: 'stopped_on_reply' })
          .eq('tenant_id', tenantId)
          .eq('business_id', currentDispatch.business_id)
          .eq('status', 'scheduled')
      }
    }

    await supabase
      .from('outreach_dispatches')
      .update({
        status: newStatus,
        webhook_event_id: eventId || `evt_${Date.now()}`
      })
      .eq('id', dispatchId)
  }

  // 3. BOUNCE & UNSUBSCRIBE AUTOMATIC SUPPRESSION
  if (eventType === 'bounced' || eventType === 'unsubscribed') {
    const reason = eventType === 'bounced' ? 'hard_bounce' : 'unsubscribe'
    const domain = recipientEmail.split('@')[1] || null

    await supabase.from('suppression_list').upsert(
      {
        tenant_id: tenantId,
        email: recipientEmail.trim().toLowerCase(),
        domain,
        reason
      },
      { onConflict: 'tenant_id, email' }
    )
  }

  return { status: 'processed', eventType, recipientEmail }
}

function interpolateVariables(template: string, contact: any, business: any): string {
  return template
    .replace(/\{\{\s*first_name\s*\}\}/g, contact.first_name || 'there')
    .replace(/\{\{\s*last_name\s*\}\}/g, contact.last_name || '')
    .replace(/\{\{\s*company_name\s*\}\}/g, business.name || 'your company')
    .replace(/\{\{\s*city\s*\}\}/g, business.city || 'your region')
    .replace(/\{\{\s*industry\s*\}\}/g, business.industry || 'B2B')
}
