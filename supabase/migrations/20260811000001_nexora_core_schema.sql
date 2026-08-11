-- ============================================================================
-- MIGRATION: NEXORA SaaS Core Schema (Independent Supabase DB: zfancncassjmghxzogbm)
-- Date: 2026-08-11
-- Purpose: Complete multi-tenant operational SaaS schema for NEXORA with
--          LAM ID SSO identity mappings, campaign management, lead discovery,
--          outreach activities, usage tracking, and security RLS policies.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TENANTS (Multi-Tenant Workspaces mapped 1:1 to LAM Company ID)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lam_company_id UUID UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, suspended, trial
  plan VARCHAR(50) NOT NULL DEFAULT 'standard', -- starter, standard, enterprise
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to tenants" ON public.tenants;
CREATE POLICY "Allow service_role full access to tenants"
  ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow tenant members read access to own tenant" ON public.tenants;
CREATE POLICY "Allow tenant members read access to own tenant"
  ON public.tenants FOR SELECT TO authenticated
  USING (id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- ============================================================================
-- 2. MEMBERSHIPS (Workspace User Memberships & RBAC Roles)
-- Roles: owner, admin (Campaign Manager), sales_user, viewer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lam_customer_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  avatar_url TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'sales_user', -- owner, admin, sales_user, viewer
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, suspended, invited
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(tenant_id, lam_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON public.memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_lam_customer_id ON public.memberships(lam_customer_id);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to memberships" ON public.memberships;
CREATE POLICY "Allow service_role full access to memberships"
  ON public.memberships FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. CAMPAIGNS (Outreach & Lead Generation Campaigns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, active, paused, completed
  target_industry VARCHAR(100),
  daily_budget NUMERIC(10, 2) DEFAULT 0.00,
  total_leads_count INT DEFAULT 0,
  converted_leads_count INT DEFAULT 0,
  created_by UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id ON public.campaigns(tenant_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to campaigns" ON public.campaigns;
CREATE POLICY "Allow service_role full access to campaigns"
  ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. TARGET AREAS (Campaign Geographic & Demographic Targeting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.target_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  country VARCHAR(100) NOT NULL DEFAULT 'France',
  region VARCHAR(100),
  city VARCHAR(100),
  zip_codes TEXT[] DEFAULT '{}',
  radius_km INT DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_target_areas_campaign_id ON public.target_areas(campaign_id);

ALTER TABLE public.target_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to target_areas" ON public.target_areas;
CREATE POLICY "Allow service_role full access to target_areas"
  ON public.target_areas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. BUSINESSES (Discovered Target Companies & Enterprise Profiles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  industry VARCHAR(100),
  size_range VARCHAR(50), -- 1-10, 11-50, 51-200, 201-500, 500+
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'France',
  status VARCHAR(50) DEFAULT 'discovered', -- discovered, enriched, contacted, customer
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_businesses_tenant_id ON public.businesses(tenant_id);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to businesses" ON public.businesses;
CREATE POLICY "Allow service_role full access to businesses"
  ON public.businesses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. BUSINESS SOURCES (Provenance & Intelligence Provider Sources)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL, -- apollo, hunter, google_maps, manual_import
  source_url TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_sources_business_id ON public.business_sources(business_id);

ALTER TABLE public.business_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to business_sources" ON public.business_sources;
CREATE POLICY "Allow service_role full access to business_sources"
  ON public.business_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. CONTACTS (Key Decision Makers & Leads inside Businesses)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  title VARCHAR(150),
  email VARCHAR(255),
  phone VARCHAR(50),
  linkedin_url TEXT,
  status VARCHAR(50) DEFAULT 'unverified', -- unverified, verified, invalid, unsubscribed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_business_id ON public.contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON public.contacts(tenant_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to contacts" ON public.contacts;
CREATE POLICY "Allow service_role full access to contacts"
  ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 8. LEAD RECORDS (Sales Pipeline Leads & Opportunity Tracking)
-- Pipeline stages: new, contacted, qualified, proposal, won, lost
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_score INT DEFAULT 50,
  pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'new', -- new, contacted, qualified, proposal, won, lost
  notes TEXT,
  assigned_to UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_records_tenant_id ON public.lead_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_records_campaign_id ON public.lead_records(campaign_id);

ALTER TABLE public.lead_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to lead_records" ON public.lead_records;
CREATE POLICY "Allow service_role full access to lead_records"
  ON public.lead_records FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. ACTIVITIES (Outreach & Touchpoint History Timeline)
-- Types: call, email, note, status_change, meeting, whatsapp
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_record_id UUID NOT NULL REFERENCES public.lead_records(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  activity_type VARCHAR(50) NOT NULL, -- call, email, note, status_change, meeting, whatsapp
  summary VARCHAR(255) NOT NULL,
  details TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_lead_record_id ON public.activities(lead_record_id);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to activities" ON public.activities;
CREATE POLICY "Allow service_role full access to activities"
  ON public.activities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 10. USAGE EVENTS (Metered Feature Usage & Entitlement Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL, -- lead_discovered, email_enriched, email_sent, verification_performed
  count INT DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_id ON public.usage_events(tenant_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to usage_events" ON public.usage_events;
CREATE POLICY "Allow service_role full access to usage_events"
  ON public.usage_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. AUDIT LOGS (Workspace Security & Change Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to audit_logs" ON public.audit_logs;
CREATE POLICY "Allow service_role full access to audit_logs"
  ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 12. UPDATED_AT TRIGGER FUNCTION & TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_nexora_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON public.memberships;
CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_businesses_updated_at ON public.businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_lead_records_updated_at ON public.lead_records;
CREATE TRIGGER update_lead_records_updated_at
  BEFORE UPDATE ON public.lead_records
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
