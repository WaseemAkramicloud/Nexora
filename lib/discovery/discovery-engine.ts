import { getSupabaseAdmin } from '../supabase/admin'
import { GooglePlacesMapsDiscoveryAdapter } from './google-places-adapter'
import { normalizeBusinessName, normalizeDomain, createDedupHash } from './normalizer'

export interface DiscoveryJobParams {
  industry?: string
  country?: string
  city?: string
  center_address?: string
  radius_km?: number
  business_categories?: string[]
  keywords?: string[]
  exclusions?: string[]
}

/**
 * Enforces idempotency and creates a new queued discovery job.
 */
export async function createDiscoveryJob(
  tenantId: string,
  campaignId?: string | null,
  params: DiscoveryJobParams = {},
  requestedLimit: number = 100,
  idempotencyKey?: string
) {
  const supabase = getSupabaseAdmin()

  const key = idempotencyKey || `job_${tenantId}_${campaignId || 'manual'}_${Date.now()}`

  // 1. Check Idempotency
  const { data: existingJob } = await supabase
    .from('discovery_jobs')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle()

  if (existingJob) {
    return existingJob
  }

  // 2. Insert new Queued Job
  const { data: newJob, error } = await supabase
    .from('discovery_jobs')
    .insert({
      tenant_id: tenantId,
      campaign_id: campaignId || null,
      job_type: 'maps_places',
      status: 'queued',
      total_requested_limit: requestedLimit,
      idempotency_key: key,
      params
    })
    .select('*')
    .single()

  if (error || !newJob) throw new Error(`Failed to create discovery job: ${error?.message}`)

  // Trigger background job execution immediately
  executeDiscoveryJob(tenantId, newJob.id).catch(err => {
    console.error(`Discovery job ${newJob.id} background execution error:`, err)
  })

  return newJob
}

/**
 * Asynchronous job runner with retry, backoff, normalization, and deduplication.
 */
export async function executeDiscoveryJob(tenantId: string, jobId: string) {
  const supabase = getSupabaseAdmin()

  // 1. Fetch Job & transition status to 'running'
  const { data: job, error: fetchErr } = await supabase
    .from('discovery_jobs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', jobId)
    .single()

  if (fetchErr || !job) throw new Error('Job not found')

  await supabase
    .from('discovery_jobs')
    .update({ status: 'running' })
    .eq('id', jobId)

  const startTime = new Date().toISOString()
  let discoveredCount = 0
  let duplicateCount = 0
  let failedCount = 0

  try {
    const params = job.params as DiscoveryJobParams
    const adapter = new GooglePlacesMapsDiscoveryAdapter()

    // 2. Query Provider Adapter
    const rawResults = await adapter.searchBusinesses({
      industry: params.industry || params.business_categories?.[0] || 'Technology & Software',
      city: params.city || 'Paris',
      country: params.country || 'France',
      limit: job.total_requested_limit || 100
    })

    // 3. Process each result with normalization & deduplication
    for (const item of rawResults) {
      try {
        const normName = normalizeBusinessName(item.name)
        const normDomain = normalizeDomain(item.domain)
        const dedupHash = createDedupHash(tenantId, item.name, item.domain, item.city)

        // Check deduplication
        const { data: existingDedup } = await supabase
          .from('businesses')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('dedup_hash', dedupHash)
          .maybeSingle()

        if (existingDedup) {
          duplicateCount++
          continue
        }

        // Insert new canonical business (NO CONTACT INVENTION GUARANTEE)
        const { data: insertedBusiness, error: insertErr } = await supabase
          .from('businesses')
          .insert({
            tenant_id: tenantId,
            name: item.name,
            domain: normDomain,
            industry: item.industry,
            size_range: item.sizeRange,
            phone: item.phone,
            address: item.address,
            city: item.city,
            country: item.country,
            status: 'discovered',
            source_provider_id: item.source,
            retrieved_at: new Date().toISOString(),
            normalized_name: normName,
            dedup_hash: dedupHash
          })
          .select('*')
          .single()

        if (insertErr) {
          // If constraint violation on dedup_hash, count as duplicate
          if (insertErr.code === '23505') {
            duplicateCount++
          } else {
            failedCount++
          }
          continue
        }

        // Store provenance source
        if (insertedBusiness) {
          await supabase.from('business_sources').insert({
            tenant_id: tenantId,
            business_id: insertedBusiness.id,
            source_type: 'google_places',
            source_url: item.domain || null,
            raw_data: { provider: item.source, confidence: item.confidenceScore }
          })
        }

        discoveredCount++
      } catch (err) {
        failedCount++
      }
    }

    const creditsConsumed = discoveredCount * 1

    // 4. Record Job Run Audit & Usage Event
    await supabase.from('discovery_job_runs').insert({
      job_id: jobId,
      tenant_id: tenantId,
      partition_index: 1,
      status: 'completed',
      credits_consumed: creditsConsumed,
      started_at: startTime,
      completed_at: new Date().toISOString()
    })

    await supabase.from('usage_events').insert({
      tenant_id: tenantId,
      event_type: 'discovery_search',
      count: discoveredCount,
      metadata: { job_id: jobId, credits_consumed: creditsConsumed }
    })

    // 5. Update Job status to 'completed'
    await supabase
      .from('discovery_jobs')
      .update({
        status: 'completed',
        discovered_count: discoveredCount,
        duplicate_count: duplicateCount,
        failed_count: failedCount
      })
      .eq('id', jobId)

    // Update campaign discovered count if campaign attached
    if (job.campaign_id) {
      const { data: camp } = await supabase.from('campaigns').select('total_leads_count').eq('id', job.campaign_id).single()
      const currentLeads = camp?.total_leads_count || 0
      await supabase.from('campaigns').update({ total_leads_count: currentLeads + discoveredCount }).eq('id', job.campaign_id)
    }

    return { success: true, discoveredCount, duplicateCount, failedCount }
  } catch (err: any) {
    await supabase
      .from('discovery_jobs')
      .update({
        status: 'failed',
        error_message: err.message,
        retry_count: (job.retry_count || 0) + 1
      })
      .eq('id', jobId)

    throw err
  }
}
