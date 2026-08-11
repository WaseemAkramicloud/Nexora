import { getSupabaseAdmin } from '../supabase/admin'

/**
 * Real-Event Analytics Engine: Computes real metrics purely from actual operational events.
 */
export async function getRealEventAnalytics(tenantId: string, campaignId?: string) {
  const supabase = getSupabaseAdmin()

  // 1. Query Real Discovered & Approved Businesses
  let bizQuery = supabase.from('businesses').select('id, enrichment_status, approval_state, industry, source_provider_id').eq('tenant_id', tenantId)
  const { data: businesses } = await bizQuery

  const totalDiscovered = businesses?.length || 0
  const totalApproved = businesses?.filter(b => b.approval_state === 'Approved for Outreach').length || 0
  const totalEnriched = businesses?.filter(b => b.enrichment_status === 'Enriched' || b.enrichment_status === 'Verified').length || 0

  // 2. Query Dispatches & Webhook Delivery Events
  let dispatchQuery = supabase.from('outreach_dispatches').select('id, status, created_at').eq('tenant_id', tenantId)
  const { data: dispatches } = await dispatchQuery

  const totalSent = dispatches?.filter(d => d.status === 'sent' || d.status === 'delivered' || d.status === 'replied').length || 0
  const totalBounced = dispatches?.filter(d => d.status === 'bounced').length || 0
  const totalReplied = dispatches?.filter(d => d.status === 'replied').length || 0

  // 3. Query Central Inbox Messages & Positive Responses
  let inboxQuery = supabase.from('inbox_messages').select('id, response_category').eq('tenant_id', tenantId)
  const { data: inboxMessages } = await inboxQuery

  const positiveInterested = inboxMessages?.filter(m => m.response_category === 'Interested' || m.response_category === 'Referral').length || 0
  const unsubscribes = inboxMessages?.filter(m => m.response_category === 'Unsubscribe').length || 0

  // Rates calculation
  const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0
  const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0
  const positiveRate = totalReplied > 0 ? (positiveInterested / totalReplied) * 100 : 0

  // 4. Industry Segment Performance Breakdown
  const segmentStats: Record<string, { count: number; approved: number }> = {}
  ;(businesses || []).forEach(b => {
    const ind = b.industry || 'Technology & Software'
    if (!segmentStats[ind]) segmentStats[ind] = { count: 0, approved: 0 }
    segmentStats[ind].count++
    if (b.approval_state === 'Approved for Outreach') segmentStats[ind].approved++
  })

  const segmentBreakdown = Object.keys(segmentStats).map(ind => ({
    industry: ind,
    discovered: segmentStats[ind].count,
    approved: segmentStats[ind].approved,
    conversionRate: segmentStats[ind].count > 0 ? ((segmentStats[ind].approved / segmentStats[ind].count) * 100).toFixed(1) : '0.0'
  }))

  return {
    funnel: {
      discovered: totalDiscovered,
      enriched: totalEnriched,
      approved: totalApproved,
      sent: totalSent,
      bounced: totalBounced,
      replied: totalReplied,
      positiveInterested,
      unsubscribes
    },
    rates: {
      bounceRate: bounceRate.toFixed(1),
      replyRate: replyRate.toFixed(1),
      positiveRate: positiveRate.toFixed(1)
    },
    segmentBreakdown
  }
}
