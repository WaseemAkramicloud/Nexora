-- ============================================================================
-- MIGRATION: NEXORA AI Lead Qualification & Human Approval Schema
-- Date: 2026-08-11
-- Purpose: Source-backed ICP evaluation, fit priority scoring, verified facts,
--          suggested outreach angles, and human approval workflow audit trail.
-- ============================================================================

-- 1. Extend Businesses Table for Approval States & Audit
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS approval_state VARCHAR(50) DEFAULT 'Pending Review',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_businesses_approval_state ON public.businesses(approval_state);

-- 2. Create Reusable ICP Criteria Table
CREATE TABLE IF NOT EXISTS public.icp_criteria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_industries TEXT[] DEFAULT '{}',
  target_company_sizes TEXT[] DEFAULT '{}',
  target_geographies TEXT[] DEFAULT '{}',
  required_signals TEXT[] DEFAULT '{}',
  disqualifiers TEXT[] DEFAULT '{}',
  weight_rules JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_icp_criteria_tenant ON public.icp_criteria(tenant_id);

ALTER TABLE public.icp_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to icp_criteria" ON public.icp_criteria;
CREATE POLICY "Allow service_role full access to icp_criteria"
  ON public.icp_criteria FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create AI Qualifications Table
CREATE TABLE IF NOT EXISTS public.ai_qualifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  icp_criteria_id UUID REFERENCES public.icp_criteria(id) ON DELETE SET NULL,
  fit_score INT NOT NULL DEFAULT 50,
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium', -- High, Medium, Low
  explanation TEXT NOT NULL,
  verified_facts TEXT[] DEFAULT '{}', -- Strictly source-backed!
  suggested_outreach_angle TEXT NOT NULL,
  confidence_status VARCHAR(50) DEFAULT 'High Confidence', -- High Confidence, Insufficient Data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_qualifications_business ON public.ai_qualifications(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_qualifications_priority ON public.ai_qualifications(priority);

ALTER TABLE public.ai_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to ai_qualifications" ON public.ai_qualifications;
CREATE POLICY "Allow service_role full access to ai_qualifications"
  ON public.ai_qualifications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger for icp_criteria
DROP TRIGGER IF EXISTS update_icp_criteria_updated_at ON public.icp_criteria;
CREATE TRIGGER update_icp_criteria_updated_at
  BEFORE UPDATE ON public.icp_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
