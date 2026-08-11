-- ============================================================================
-- MIGRATION: NEXORA Enrichment & Verification Pipeline Schema
-- Date: 2026-08-11
-- Purpose: Asynchronous enrichment jobs, freshness caching, named vs generic contact
--          classification, email verification details, credit usage tracking.
-- ============================================================================

-- 1. Create Enrichment Jobs Table
CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, running, completed, failed, needs_manual_review
  job_type VARCHAR(50) NOT NULL DEFAULT 'enrichment_full', -- enrichment_full, domain_resolution, email_verification
  provider_name VARCHAR(50) DEFAULT 'Hunter & Lusha Adapter',
  idempotency_key VARCHAR(255) UNIQUE,
  cached_until TIMESTAMP WITH TIME ZONE,
  credits_consumed INT DEFAULT 1,
  result_summary JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_tenant ON public.enrichment_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_business ON public.enrichment_jobs(business_id);

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to enrichment_jobs" ON public.enrichment_jobs;
CREATE POLICY "Allow service_role full access to enrichment_jobs"
  ON public.enrichment_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Extend Contacts Table for Classification & Verification Details
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type VARCHAR(50) DEFAULT 'named', -- named vs generic_business
  ADD COLUMN IF NOT EXISTS cached_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verification_details JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contacts_type ON public.contacts(contact_type);

-- Updated_at trigger for enrichment_jobs
DROP TRIGGER IF EXISTS update_enrichment_jobs_updated_at ON public.enrichment_jobs;
CREATE TRIGGER update_enrichment_jobs_updated_at
  BEFORE UPDATE ON public.enrichment_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
