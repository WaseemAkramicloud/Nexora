import { getSupabaseAdmin } from '../supabase/admin'
import { classifyContact } from './contact-classifier'
import { verifyEmail } from './email-verifier'
import { normalizeDomain } from '../discovery/normalizer'

export const ENRICHMENT_CACHE_TTL_DAYS = 30

/**
 * Asynchronous Enrichment & Verification Pipeline with Freshness Caching,
 * Named vs Generic Classification, Email Verification, and Usage Tracking.
 */
export async function runEnrichmentPipeline(
  tenantId: string,
  businessId: string,
  providerName: string = 'Hunter & Lusha Adapter',
  idempotencyKey?: string
) {
  const supabase = getSupabaseAdmin()

  const key = idempotencyKey || `enrich_${tenantId}_${businessId}_${Date.now()}`

  // 1. Check Idempotency / Active Job
  const { data: existingJob } = await supabase
    .from('enrichment_jobs')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle()

  if (existingJob) return existingJob

  // 2. Fetch Target Business
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('*, contacts(*)')
    .eq('tenant_id', tenantId)
    .eq('id', businessId)
    .single()

  if (bizErr || !business) throw new Error('Business target not found')

  // 3. FRESHNESS CACHE CHECK: If business was enriched within 30 days, reuse cache!
  const now = new Date()
  const { data: recentJob } = await supabase
    .from('enrichment_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gt('cached_until', now.toISOString())
    .maybeSingle()

  if (recentJob) {
    // Return cached completion without consuming extra paid credits
    return {
      ...recentJob,
      is_cached: true,
      message: 'Reused fresh enrichment cache (0 credits consumed)'
    }
  }

  // 4. Create new Enrichment Job in 'running' state
  const cacheUntil = new Date()
  cacheUntil.setDate(cacheUntil.getDate() + ENRICHMENT_CACHE_TTL_DAYS)

  const { data: job, error: jobErr } = await supabase
    .from('enrichment_jobs')
    .insert({
      tenant_id: tenantId,
      business_id: businessId,
      status: 'running',
      job_type: 'enrichment_full',
      provider_name: providerName,
      idempotency_key: key,
      cached_until: cacheUntil.toISOString(),
      credits_consumed: 1
    })
    .select('*')
    .single()

  if (jobErr || !job) throw new Error(`Failed to create enrichment job: ${jobErr?.message}`)

  let contactsCreated = 0
  let manualReviewNeeded = false

  try {
    // 5. DOMAIN RESOLUTION: Confirm clean domain
    const cleanDomain = normalizeDomain(business.domain) || `${business.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.fr`

    // 6. APPROVED ENRICHMENT PROVIDER CALL (Simulated provider enrichment response)
    const mockEnrichedContacts = [
      {
        firstName: 'Alexandre',
        lastName: 'Vance',
        title: 'VP of Supply Chain & Operations',
        email: `alexandre.vance@${cleanDomain}`,
        phone: '+33 6 98 76 54 32',
        linkedinUrl: `https://linkedin.com/in/alexandre-vance`
      },
      {
        firstName: 'Inquiries',
        lastName: 'Department',
        title: 'Central Operations Mailbox',
        email: `contact@${cleanDomain}`,
        phone: business.phone || '+33 1 42 68 55 00',
        linkedinUrl: null
      }
    ]

    // 7. Process & Verify Each Contact Record
    for (const c of mockEnrichedContacts) {
      const contactType = classifyContact(c.email, c.title, c.firstName)
      const verification = await verifyEmail(c.email)

      if (verification.confidenceScore < 0.50) {
        manualReviewNeeded = true
      }

      // Check if contact already exists
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('business_id', businessId)
        .eq('email', c.email)
        .maybeSingle()

      if (!existingContact) {
        await supabase.from('contacts').insert({
          tenant_id: tenantId,
          business_id: businessId,
          first_name: c.firstName,
          last_name: c.lastName,
          title: c.title,
          email: c.email,
          phone: c.phone,
          linkedin_url: c.linkedinUrl,
          contact_type: contactType,
          verification_status: verification.status === 'Verified' ? 'Verified' : 'Unverified',
          confidence_score: verification.confidenceScore,
          source_provider_id: providerName,
          retrieved_at: now.toISOString(),
          verification_date: now.toISOString(),
          cached_until: cacheUntil.toISOString(),
          verification_details: verification.details
        })
        contactsCreated++
      }
    }

    // 8. Update Business enrichment_status
    const finalStatus = manualReviewNeeded ? 'Needs Manual Review' : 'Enriched'
    await supabase
      .from('businesses')
      .update({
        domain: cleanDomain,
        enrichment_status: finalStatus
      })
      .eq('tenant_id', tenantId)
      .eq('id', businessId)

    // 9. Record Usage Credit Event
    await supabase.from('usage_events').insert({
      tenant_id: tenantId,
      event_type: 'enrichment_credit',
      count: 1,
      metadata: { business_id: businessId, job_id: job.id, contacts_created: contactsCreated }
    })

    // 10. Update Job status to 'completed' or 'needs_manual_review'
    const { data: completedJob } = await supabase
      .from('enrichment_jobs')
      .update({
        status: manualReviewNeeded ? 'needs_manual_review' : 'completed',
        result_summary: {
          contacts_created: contactsCreated,
          clean_domain: cleanDomain,
          provider: providerName,
          manual_review_needed: manualReviewNeeded
        }
      })
      .eq('id', job.id)
      .select('*')
      .single()

    return completedJob
  } catch (err: any) {
    await supabase
      .from('enrichment_jobs')
      .update({
        status: 'failed',
        error_message: err.message
      })
      .eq('id', job.id)

    throw err
  }
}
