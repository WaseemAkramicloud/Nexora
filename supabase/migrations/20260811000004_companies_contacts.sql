-- ============================================================================
-- MIGRATION: NEXORA Canonical Companies & Contacts Schema Expansion
-- Date: 2026-08-11
-- Purpose: Advanced company/contact data quality states, explicit consent flags,
--          tags, owner assignments, and merge history deduplication.
-- ============================================================================

-- 1. Extend Businesses Table for Tags, Owner, Score, Data Quality State & Merges
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(50) DEFAULT 'Discovered',
  ADD COLUMN IF NOT EXISTS whatsapp_authorized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_enrichment_status ON public.businesses(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_id);

-- 2. Extend Contacts Table for Verification Date, Confidence & Source IDs
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS verification_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3, 2) DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'Unverified',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contacts_verification_status ON public.contacts(verification_status);

-- 3. Create Business Merges Audit Table (Preserves full merge history without data loss)
CREATE TABLE IF NOT EXISTS public.business_merges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  target_business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  merged_by UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  snapshot_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_merges_tenant ON public.business_merges(tenant_id);

ALTER TABLE public.business_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to business_merges" ON public.business_merges;
CREATE POLICY "Allow service_role full access to business_merges"
  ON public.business_merges FOR ALL TO service_role USING (true) WITH CHECK (true);
