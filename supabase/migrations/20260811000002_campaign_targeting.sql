-- ============================================================================
-- MIGRATION: NEXORA Campaign Builder & Targeting Schema (Independent Supabase DB)
-- Date: 2026-08-11
-- Purpose: Support advanced campaign targeting, polygon-ready geography,
--          keyword & category criteria, contact preferences, and usage limits.
-- ============================================================================

-- 1. Update Campaigns Table with Owner, Limits, Preferences & Criteria
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desired_result_limit INT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS contact_preferences TEXT[] DEFAULT '{"email", "phone"}',
  ADD COLUMN IF NOT EXISTS provider_criteria JSONB DEFAULT '{}';

-- 2. Update Target Areas Table for Future-Proof Polygon Geography
ALTER TABLE public.target_areas
  ADD COLUMN IF NOT EXISTS geography_type VARCHAR(50) DEFAULT 'radius', -- radius, polygon, region, country
  ADD COLUMN IF NOT EXISTS center_address TEXT,
  ADD COLUMN IF NOT EXISTS center_latitude NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS center_longitude NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS polygon_coordinates JSONB DEFAULT '[]';

-- 3. Create Campaign Targeting Rules Table
CREATE TABLE IF NOT EXISTS public.campaign_targeting_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  business_categories TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  exclusions TEXT[] DEFAULT '{}',
  min_company_size VARCHAR(50) DEFAULT '1',
  max_company_size VARCHAR(50) DEFAULT '500+',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_targeting_rules_campaign ON public.campaign_targeting_rules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targeting_rules_tenant ON public.campaign_targeting_rules(tenant_id);

ALTER TABLE public.campaign_targeting_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to campaign_targeting_rules" ON public.campaign_targeting_rules;
CREATE POLICY "Allow service_role full access to campaign_targeting_rules"
  ON public.campaign_targeting_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger for campaign_targeting_rules
DROP TRIGGER IF EXISTS update_campaign_targeting_rules_updated_at ON public.campaign_targeting_rules;
CREATE TRIGGER update_campaign_targeting_rules_updated_at
  BEFORE UPDATE ON public.campaign_targeting_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
