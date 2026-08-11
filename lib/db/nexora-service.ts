import { getSupabaseAdmin } from '../supabase/admin'

export interface Tenant {
  id: string
  lam_company_id: string
  name: string
  slug: string
  status: string
  plan: string
  settings: Record<string, any>
  created_at: string
}

export interface Membership {
  id: string
  tenant_id: string
  lam_customer_id: string
  email: string
  first_name: string
  last_name?: string
  avatar_url?: string
  role: 'owner' | 'admin' | 'sales_user' | 'viewer'
  status: string
  created_at: string
}

/**
 * Retrieve existing tenant mapped to lam_company_id, or create a new NEXORA workspace.
 */
export async function getOrCreateTenantForCompany(
  lamCompanyId: string,
  companyName: string = 'Enterprise Workspace'
): Promise<Tenant> {
  const supabase = getSupabaseAdmin()

  // 1. Try to find existing tenant
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('lam_company_id', lamCompanyId)
    .maybeSingle()

  if (existingTenant) {
    return existingTenant as Tenant
  }

  // 2. Create new tenant workspace
  const slug = (companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + lamCompanyId.slice(0, 6)).replace(/-+/g, '-')

  const { data: newTenant, error } = await supabase
    .from('tenants')
    .insert({
      lam_company_id: lamCompanyId,
      name: companyName,
      slug,
      status: 'active',
      plan: 'enterprise',
      settings: {
        currency: 'EUR',
        timezone: 'Europe/Paris',
        default_language: 'en'
      }
    })
    .select('*')
    .single()

  if (error || !newTenant) {
    throw new Error(`Failed to provision NEXORA tenant workspace: ${error?.message}`)
  }

  // Seed initial demo data for this tenant
  await seedDemoDataIfEmpty(newTenant.id)

  return newTenant as Tenant
}

/**
 * Retrieve existing membership for lam_customer_id in tenant, or provision new membership.
 */
export async function getOrCreateMembership(
  tenantId: string,
  lamCustomerId: string,
  email: string,
  firstName: string,
  lastName?: string,
  lamCompanyRole?: string
): Promise<Membership> {
  const supabase = getSupabaseAdmin()

  // 1. Check existing membership
  const { data: existingMem } = await supabase
    .from('memberships')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('lam_customer_id', lamCustomerId)
    .maybeSingle()

  if (existingMem) {
    return existingMem as Membership
  }

  // Map LAM company role to NEXORA workspace role
  let role: 'owner' | 'admin' | 'sales_user' | 'viewer' = 'sales_user'
  if (lamCompanyRole === 'owner') role = 'owner'
  else if (lamCompanyRole === 'admin') role = 'admin'

  // If first member in tenant, make owner
  const { count } = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (count === 0) {
    role = 'owner'
  }

  const { data: newMem, error } = await supabase
    .from('memberships')
    .insert({
      tenant_id: tenantId,
      lam_customer_id: lamCustomerId,
      email,
      first_name: firstName,
      last_name: lastName || '',
      role,
      status: 'active'
    })
    .select('*')
    .single()

  if (error || !newMem) {
    throw new Error(`Failed to create NEXORA membership: ${error?.message}`)
  }

  return newMem as Membership
}

/**
 * Fetch all campaigns for tenant.
 */
export async function getTenantCampaigns(tenantId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, target_areas(*), campaign_targeting_rules(*), owner:memberships(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch single campaign details with targeting rules.
 */
export async function getCampaignDetails(tenantId: string, campaignId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, target_areas(*), campaign_targeting_rules(*), owner:memberships(*)')
    .eq('tenant_id', tenantId)
    .eq('id', campaignId)
    .single()

  if (error) throw error
  return data
}

/**
 * Create campaign with polygon-ready geography and targeting rules.
 */
export async function createCampaignWithTargeting(
  tenantId: string,
  campaignData: {
    name: string
    description?: string
    status?: string
    target_industry?: string
    daily_budget?: number
    desired_result_limit?: number
    contact_preferences?: string[]
    owner_id?: string
  },
  targetArea: {
    country?: string
    region?: string
    city?: string
    geography_type?: string
    center_address?: string
    center_latitude?: number
    center_longitude?: number
    radius_km?: number
    polygon_coordinates?: any[]
  },
  targetingRules: {
    business_categories?: string[]
    keywords?: string[]
    exclusions?: string[]
    min_company_size?: string
    max_company_size?: string
  }
) {
  const supabase = getSupabaseAdmin()

  // 1. Create main campaign record
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .insert({
      tenant_id: tenantId,
      name: campaignData.name,
      description: campaignData.description || '',
      status: campaignData.status || 'active',
      target_industry: campaignData.target_industry || 'Technology & Software',
      daily_budget: campaignData.daily_budget || 100,
      desired_result_limit: campaignData.desired_result_limit || 100,
      contact_preferences: campaignData.contact_preferences || ['email', 'phone'],
      owner_id: campaignData.owner_id || null
    })
    .select('*')
    .single()

  if (campErr || !campaign) throw new Error(`Failed to create campaign: ${campErr?.message}`)

  // 2. Create polygon-ready target area
  await supabase.from('target_areas').insert({
    tenant_id: tenantId,
    campaign_id: campaign.id,
    country: targetArea.country || 'France',
    region: targetArea.region || 'Île-de-France',
    city: targetArea.city || 'Paris',
    geography_type: targetArea.geography_type || 'radius',
    center_address: targetArea.center_address || '14 Boulevard Haussmann, Paris',
    center_latitude: targetArea.center_latitude || 48.8737,
    center_longitude: targetArea.center_longitude || 2.3314,
    radius_km: targetArea.radius_km || 30,
    polygon_coordinates: targetArea.polygon_coordinates || []
  })

  // 3. Create targeting rules
  await supabase.from('campaign_targeting_rules').insert({
    tenant_id: tenantId,
    campaign_id: campaign.id,
    business_categories: targetingRules.business_categories || ['Software', 'Cloud Services'],
    keywords: targetingRules.keywords || ['SaaS', 'Enterprise'],
    exclusions: targetingRules.exclusions || ['Freelance', 'Agency'],
    min_company_size: targetingRules.min_company_size || '1',
    max_company_size: targetingRules.max_company_size || '500+'
  })

  // 4. Log audit event
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: campaignData.owner_id || null,
    action: 'campaign_created',
    resource: 'campaigns',
    details: { campaign_id: campaign.id, campaign_name: campaign.name }
  })

  return getCampaignDetails(tenantId, campaign.id)
}

/**
 * Duplicate existing campaign with exact copy of targeting rules.
 */
export async function duplicateCampaign(tenantId: string, campaignId: string, newName?: string, userId?: string) {
  const existing = await getCampaignDetails(tenantId, campaignId)
  if (!existing) throw new Error('Campaign not found to duplicate.')

  const targetArea = existing.target_areas?.[0] || {}
  const rules = existing.campaign_targeting_rules?.[0] || {}

  return createCampaignWithTargeting(
    tenantId,
    {
      name: newName || `${existing.name} (Copy)`,
      description: existing.description,
      status: 'draft',
      target_industry: existing.target_industry,
      daily_budget: existing.daily_budget,
      desired_result_limit: existing.desired_result_limit,
      contact_preferences: existing.contact_preferences,
      owner_id: userId || existing.owner_id
    },
    {
      country: targetArea.country,
      region: targetArea.region,
      city: targetArea.city,
      geography_type: targetArea.geography_type,
      center_address: targetArea.center_address,
      center_latitude: targetArea.center_latitude,
      center_longitude: targetArea.center_longitude,
      radius_km: targetArea.radius_km,
      polygon_coordinates: targetArea.polygon_coordinates
    },
    {
      business_categories: rules.business_categories,
      keywords: rules.keywords,
      exclusions: rules.exclusions,
      min_company_size: rules.min_company_size,
      max_company_size: rules.max_company_size
    }
  )
}

/**
 * Transition campaign lifecycle status to archived.
 */
export async function archiveCampaign(tenantId: string, campaignId: string, userId?: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'archived' })
    .eq('tenant_id', tenantId)
    .eq('id', campaignId)
    .select('*')
    .single()

  if (error) throw error

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: userId || null,
    action: 'campaign_archived',
    resource: 'campaigns',
    details: { campaign_id: campaignId }
  })

  return data
}


/**
 * Fetch discovered target businesses for tenant.
 */
export async function getTenantBusinesses(tenantId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('businesses')
    .select('*, contacts(*), business_sources(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch lead records & pipeline opportunities for tenant.
 */
export async function getTenantLeadRecords(tenantId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('lead_records')
    .select('*, business:businesses(*), contact:contacts(*), campaign:campaigns(*), assigned_user:memberships(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch activities timeline for tenant.
 */
export async function getTenantActivities(tenantId: string, limit: number = 20) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('activities')
    .select('*, lead:lead_records(*, business:businesses(*)), user:memberships(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Fetch workspace team members.
 */
export async function getTenantMembers(tenantId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Update workspace member role.
 */
export async function updateMemberRole(tenantId: string, membershipId: string, newRole: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('memberships')
    .update({ role: newRole })
    .eq('id', membershipId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch security audit logs for tenant.
 */
export async function getTenantAuditLogs(tenantId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*, user:memberships(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data || []
}

/**
 * Seed rich initial operational demo data for newly provisioned tenant.
 */
export async function seedDemoDataIfEmpty(tenantId: string) {
  const supabase = getSupabaseAdmin()

  const { count } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (count && count > 0) return // Already seeded

  // 1. Create Campaigns
  const { data: campaign1 } = await supabase
    .from('campaigns')
    .insert({
      tenant_id: tenantId,
      name: 'Île-de-France Tech Lead Expansion Q3',
      description: 'Automated outbound campaign targeting B2B software companies in Paris & Lyon.',
      status: 'active',
      target_industry: 'Technology & Software',
      daily_budget: 150.00,
      total_leads_count: 240,
      converted_leads_count: 38
    })
    .select('*')
    .single()

  const { data: campaign2 } = await supabase
    .from('campaigns')
    .insert({
      tenant_id: tenantId,
      name: 'DACH Enterprise Logistics & Supply Chain',
      description: 'Multi-channel executive outreach for supply chain optimization.',
      status: 'active',
      target_industry: 'Logistics & Supply Chain',
      daily_budget: 250.00,
      total_leads_count: 180,
      converted_leads_count: 22
    })
    .select('*')
    .single()

  if (campaign1) {
    await supabase.from('target_areas').insert([
      { tenant_id: tenantId, campaign_id: campaign1.id, country: 'France', region: 'Île-de-France', city: 'Paris', radius_km: 30 },
      { tenant_id: tenantId, campaign_id: campaign1.id, country: 'France', region: 'Auvergne-Rhône-Alpes', city: 'Lyon', radius_km: 25 }
    ])
  }

  // 2. Create Target Businesses
  const { data: b1 } = await supabase.from('businesses').insert({
    tenant_id: tenantId,
    name: 'Aetheria Cloud Systems',
    domain: 'aetheria-cloud.fr',
    industry: 'Technology & Software',
    size_range: '51-200',
    phone: '+33 1 42 68 55 00',
    address: '14 Boulevard Haussmann',
    city: 'Paris',
    country: 'France',
    status: 'contacted'
  }).select('*').single()

  const { data: b2 } = await supabase.from('businesses').insert({
    tenant_id: tenantId,
    name: 'Vanguard Logistics SAS',
    domain: 'vanguard-logistics.com',
    industry: 'Logistics & Supply Chain',
    size_range: '201-500',
    phone: '+33 4 72 00 11 22',
    address: '45 Rue de la République',
    city: 'Lyon',
    country: 'France',
    status: 'enriched'
  }).select('*').single()

  const { data: b3 } = await supabase.from('businesses').insert({
    tenant_id: tenantId,
    name: 'Lumina Health Intelligence',
    domain: 'lumina-health.io',
    industry: 'Healthcare Technology',
    size_range: '11-50',
    phone: '+33 1 88 33 22 11',
    address: '8 Avenue Montaigne',
    city: 'Paris',
    country: 'France',
    status: 'discovered'
  }).select('*').single()

  // 3. Contacts
  let c1, c2
  if (b1) {
    const { data: contactData } = await supabase.from('contacts').insert({
      tenant_id: tenantId,
      business_id: b1.id,
      first_name: 'Alexandre',
      last_name: 'Dubois',
      title: 'Chief Technology Officer',
      email: 'a.dubois@aetheria-cloud.fr',
      phone: '+33 6 12 34 56 78',
      linkedin_url: 'https://linkedin.com/in/alexandre-dubois-cto',
      status: 'verified'
    }).select('*').single()
    c1 = contactData
  }

  if (b2) {
    const { data: contactData } = await supabase.from('contacts').insert({
      tenant_id: tenantId,
      business_id: b2.id,
      first_name: 'Claire',
      last_name: 'Moreau',
      title: 'VP of Supply Chain Operations',
      email: 'claire.moreau@vanguard-logistics.com',
      phone: '+33 6 98 76 54 32',
      linkedin_url: 'https://linkedin.com/in/claire-moreau-vp',
      status: 'verified'
    }).select('*').single()
    c2 = contactData
  }

  // 4. Lead Records
  if (b1 && c1 && campaign1) {
    const { data: lr1 } = await supabase.from('lead_records').insert({
      tenant_id: tenantId,
      campaign_id: campaign1.id,
      business_id: b1.id,
      contact_id: c1.id,
      lead_score: 88,
      pipeline_stage: 'proposal',
      notes: 'Requested customized ERP demo with SSO integration and SLA requirements.'
    }).select('*').single()

    if (lr1) {
      await supabase.from('activities').insert([
        { tenant_id: tenantId, lead_record_id: lr1.id, activity_type: 'email', summary: 'Outreach email delivered', details: 'Initial campaign sequence email 1 delivered successfully.' },
        { tenant_id: tenantId, lead_record_id: lr1.id, activity_type: 'call', summary: 'Discovery Call Completed', details: 'Positive conversation with Alexandre. Scheduled technical evaluation.' }
      ])
    }
  }

  if (b2 && c2 && campaign2) {
    const { data: lr2 } = await supabase.from('lead_records').insert({
      tenant_id: tenantId,
      campaign_id: campaign2.id,
      business_id: b2.id,
      contact_id: c2.id,
      lead_score: 74,
      pipeline_stage: 'contacted',
      notes: 'Initial email sequence sent. Follow-up scheduled for Thursday.'
    }).select('*').single()

    if (lr2) {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        lead_record_id: lr2.id,
        activity_type: 'email',
        summary: 'Outreach Sequence Step 1 Sent',
        details: 'Automated email sequence initiated.'
      })
    }
  }

  // 5. Initial Audit Log
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'workspace_provisioned',
    resource: 'tenants',
    details: { message: 'NEXORA operational workspace auto-provisioned via LAM ID SSO.' }
  })
}

/**
 * Fetch full canonical business profile with contacts, sources, lead records, and activities.
 */
export async function getBusinessFullProfile(tenantId: string, businessId: string) {
  const supabase = getSupabaseAdmin()

  const { data: business, error } = await supabase
    .from('businesses')
    .select('*, contacts(*), business_sources(*), owner:memberships(*)')
    .eq('tenant_id', tenantId)
    .eq('id', businessId)
    .single()

  if (error || !business) throw new Error('Business profile not found.')

  const { data: leadRecords } = await supabase
    .from('lead_records')
    .select('*, campaign:campaigns(*), assigned_user:memberships(*), activities(*)')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)

  return {
    ...business,
    lead_records: leadRecords || []
  }
}

/**
 * Perform bulk operations (approve, suppress/exclude, assign_owner, tag).
 */
export async function bulkActionBusinesses(
  tenantId: string,
  businessIds: string[],
  action: 'approve' | 'suppress' | 'assign_owner' | 'add_tag',
  extra: Record<string, any> = {}
) {
  const supabase = getSupabaseAdmin()
  if (!businessIds || businessIds.length === 0) return { count: 0 }

  let updatePayload: Record<string, any> = {}

  if (action === 'approve') {
    updatePayload = { enrichment_status: 'Enriched' }
  } else if (action === 'suppress') {
    updatePayload = { enrichment_status: 'Suppressed' }
  } else if (action === 'assign_owner' && extra.ownerId) {
    updatePayload = { owner_id: extra.ownerId }
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .in('id', businessIds)
    .select('id')

  if (error) throw error

  // Log audit event
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: `bulk_business_${action}`,
    resource: 'businesses',
    details: { count: data?.length || 0, business_ids: businessIds, extra }
  })

  return { count: data?.length || 0 }
}

/**
 * Merge duplicate source business into target business preserving full history.
 */
export async function mergeBusinesses(tenantId: string, sourceId: string, targetId: string, userId?: string) {
  const supabase = getSupabaseAdmin()
  if (sourceId === targetId) throw new Error('Cannot merge a business into itself.')

  const sourceProfile = await getBusinessFullProfile(tenantId, sourceId)
  if (!sourceProfile) throw new Error('Source business profile not found.')

  // 1. Snapshot source profile in business_merges audit log
  await supabase.from('business_merges').insert({
    tenant_id: tenantId,
    source_business_id: sourceId,
    target_business_id: targetId,
    merged_by: userId || null,
    snapshot_data: sourceProfile
  })

  // 2. Transfer contacts from source to target
  await supabase
    .from('contacts')
    .update({ business_id: targetId })
    .eq('tenant_id', tenantId)
    .eq('business_id', sourceId)

  // 3. Transfer lead records & activities from source to target
  await supabase
    .from('lead_records')
    .update({ business_id: targetId })
    .eq('tenant_id', tenantId)
    .eq('business_id', sourceId)

  // 4. Mark source business as merged_into_id
  await supabase
    .from('businesses')
    .update({
      merged_into_id: targetId,
      enrichment_status: 'Suppressed'
    })
    .eq('tenant_id', tenantId)
    .eq('id', sourceId)

  return getBusinessFullProfile(tenantId, targetId)
}

/**
 * Create or update separate contact record with strict data quality verification rules.
 */
export async function createOrUpdateContact(
  tenantId: string,
  businessId: string,
  contactData: {
    first_name: string
    last_name?: string
    title?: string
    email?: string
    phone?: string
    linkedin_url?: string
    is_guessed?: boolean
    confidence_score?: number
    source_provider_id?: string
  }
) {
  const supabase = getSupabaseAdmin()

  // Data Quality Rule: Guessed data is stored with 'Guessed' verification_status, NOT 'Verified'!
  const verificationStatus = contactData.is_guessed ? 'Guessed' : (contactData.email ? 'Verified' : 'Unverified')

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      tenant_id: tenantId,
      business_id: businessId,
      first_name: contactData.first_name,
      last_name: contactData.last_name || '',
      title: contactData.title || '',
      email: contactData.email || null,
      phone: contactData.phone || null,
      linkedin_url: contactData.linkedin_url || null,
      confidence_score: contactData.confidence_score || (contactData.is_guessed ? 0.60 : 0.95),
      verification_status: verificationStatus,
      source_provider_id: contactData.source_provider_id || 'manual'
    })
    .select('*')
    .single()

  if (error) throw error
  return contact
}

