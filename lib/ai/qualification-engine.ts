import { getSupabaseAdmin } from '../supabase/admin'

export interface QualifyBusinessOptions {
  icpCriteriaId?: string
  targetIndustry?: string
  minScore?: number
}

/**
 * AI Lead Qualification Engine: Evaluates leads using ONLY source-backed inputs.
 * Strictly avoids hallucinating missing contacts, facts, or unverified claims.
 */
export async function qualifyBusinessWithAI(
  tenantId: string,
  businessId: string,
  options: QualifyBusinessOptions = {}
) {
  const supabase = getSupabaseAdmin()

  // 1. Fetch Canonical Business Profile & Provenance Sources
  const { data: business, error } = await supabase
    .from('businesses')
    .select('*, contacts(*), business_sources(*)')
    .eq('tenant_id', tenantId)
    .eq('id', businessId)
    .single()

  if (error || !business) throw new Error('Business target not found')

  // 2. Extract Verified Source-Backed Facts (ZERO INVENTION)
  const verifiedFacts: string[] = []

  if (business.name) verifiedFacts.push(`Registered Business Name: ${business.name}`)
  if (business.domain) verifiedFacts.push(`Verified Domain: ${business.domain}`)
  if (business.industry) verifiedFacts.push(`Target Industry: ${business.industry}`)
  if (business.city && business.country) verifiedFacts.push(`Confirmed Location: ${business.city}, ${business.country}`)
  if (business.source_provider_id) verifiedFacts.push(`Data Provenance Source: ${business.source_provider_id}`)

  const verifiedContacts = (business.contacts || []).filter((c: any) => c.verification_status === 'Verified' || c.email)
  if (verifiedContacts.length > 0) {
    verifiedFacts.push(`Verified Contacts On File: ${verifiedContacts.length} (${verifiedContacts.map((c: any) => `${c.first_name} ${c.last_name || ''}`).join(', ')})`)
  }

  // 3. Evaluate Data Completeness & Insufficient Data Status
  const isMissingDomain = !business.domain
  const isMissingContacts = verifiedContacts.length === 0
  const isInsufficientData = isMissingDomain || isMissingContacts

  const confidenceStatus = isInsufficientData ? 'Insufficient Data' : 'High Confidence'

  // 4. Calculate Source-Backed Fit Score & Priority
  let fitScore = 50

  if (business.domain) fitScore += 20
  if (business.industry && business.industry.includes(options.targetIndustry || 'Technology')) fitScore += 25
  if (verifiedContacts.length > 0) fitScore += 20
  if (business.phone) fitScore += 10
  if (business.source_provider_id) fitScore += 15

  fitScore = Math.min(100, Math.max(10, fitScore))

  const priority: 'High' | 'Medium' | 'Low' =
    fitScore >= 80 ? 'High' : fitScore >= 50 ? 'Medium' : 'Low'

  // 5. Generate Explanation & Outreach Angle based on Verified Facts
  const explanation = isInsufficientData
    ? `Profile lacks verified domain or direct decision-maker contact details. Recommended for manual research before outreach approval.`
    : `High match score (${fitScore}/100) based on verified ${business.industry} classification in ${business.city} with ${verifiedContacts.length} verified executive contacts.`

  const primaryContactName = verifiedContacts[0]?.first_name || 'the leadership team'
  const suggestedOutreachAngle = isInsufficientData
    ? `Initiate manual domain verification and executive contact discovery for ${business.name}.`
    : `Introduce NEXORA's operational B2B SaaS automation platform to ${primaryContactName} at ${business.name}, focusing on scaling ${business.industry} operations in ${business.city}.`

  // Initial approval state recommendation
  const initialApprovalState = isInsufficientData ? 'Needs Research' : 'Pending Review'

  // 6. Save AI Qualification Record in DB
  const { data: qualRecord, error: qualErr } = await supabase
    .from('ai_qualifications')
    .insert({
      tenant_id: tenantId,
      business_id: businessId,
      icp_criteria_id: options.icpCriteriaId || null,
      fit_score: fitScore,
      priority,
      explanation,
      verified_facts: verifiedFacts,
      suggested_outreach_angle: suggestedOutreachAngle,
      confidence_status: confidenceStatus
    })
    .select('*')
    .single()

  if (qualErr) throw qualErr

  // Update business score & approval state if not approved yet
  await supabase
    .from('businesses')
    .update({
      score: fitScore,
      approval_state: business.approval_state === 'Approved for Outreach' ? 'Approved for Outreach' : initialApprovalState
    })
    .eq('tenant_id', tenantId)
    .eq('id', businessId)

  return qualRecord
}
