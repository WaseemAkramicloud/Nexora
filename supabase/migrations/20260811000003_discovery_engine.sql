-- ============================================================================
-- MIGRATION: NEXORA Business Discovery Engine & Job Queue Schema
-- Date: 2026-08-11
-- Purpose: Asynchronous discovery job execution, geographic partitioning,
--          provider source tracking, canonical normalization, deduplication hashes.
-- ============================================================================

-- 1. Extend Businesses Table for Provider Source IDs & Deduplication
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS source_provider_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dedup_hash VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_tenant_dedup ON public.businesses(tenant_id, dedup_hash);

-- 2. Create Discovery Jobs Table
CREATE TABLE IF NOT EXISTS public.discovery_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  job_type VARCHAR(50) NOT NULL DEFAULT 'maps_places', -- maps_places, apollo_b2b
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, running, completed, failed, paused
  total_requested_limit INT DEFAULT 100,
  discovered_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  idempotency_key VARCHAR(255) UNIQUE,
  error_message TEXT,
  params JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_tenant ON public.discovery_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_campaign ON public.discovery_jobs(campaign_id);

ALTER TABLE public.discovery_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to discovery_jobs" ON public.discovery_jobs;
CREATE POLICY "Allow service_role full access to discovery_jobs"
  ON public.discovery_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create Discovery Job Runs Table (Geographic Partitions & Audit)
CREATE TABLE IF NOT EXISTS public.discovery_job_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.discovery_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partition_index INT DEFAULT 0,
  partition_bounds JSONB DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- queued, running, completed, failed
  credits_consumed INT DEFAULT 0,
  error_log TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_discovery_job_runs_job ON public.discovery_job_runs(job_id);

ALTER TABLE public.discovery_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to discovery_job_runs" ON public.discovery_job_runs;
CREATE POLICY "Allow service_role full access to discovery_job_runs"
  ON public.discovery_job_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger for discovery_jobs
DROP TRIGGER IF EXISTS update_discovery_jobs_updated_at ON public.discovery_jobs;
CREATE TRIGGER update_discovery_jobs_updated_at
  BEFORE UPDATE ON public.discovery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
