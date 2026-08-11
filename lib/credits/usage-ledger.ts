import { getSupabaseAdmin } from '../supabase/admin'

export type UsageEventType =
  | 'discovery_search'
  | 'enrichment_credit'
  | 'verification_check'
  | 'email_dispatch'
  | 'ai_qualification'

export async function recordUsageCredit(
  tenantId: string,
  eventType: UsageEventType,
  creditsConsumed: number = 1,
  description?: string,
  metadata: Record<string, any> = {}
) {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('usage_ledger')
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      credits_consumed: creditsConsumed,
      description: description || `Credit usage for ${eventType}`,
      metadata
    })
    .select('*')
    .single()

  if (error) {
    console.error('Failed to log usage credit:', error)
  }

  return data
}
