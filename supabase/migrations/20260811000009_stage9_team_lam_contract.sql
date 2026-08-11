-- ============================================================================
-- MIGRATION: NEXORA Team Administration, Integrations & LAM Contract Schema
-- Date: 2026-08-11
-- Purpose: Tenant entitlement status, official WhatsApp Business log,
--          webhook health monitoring, and GDPR compliance retention jobs.
-- ============================================================================

-- 1. Extend Tenants Table for LAM Entitlements & Policy
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS entitlement_status VARCHAR(50) DEFAULT 'active', -- active, suspended, updated
  ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(50) DEFAULT 'enterprise',     -- starter, professional, enterprise
  ADD COLUMN IF NOT EXISTS max_seats INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS jurisdiction_policy JSONB DEFAULT '{"gdpr_strict": true, "opt_in_required": true}';

CREATE INDEX IF NOT EXISTS idx_tenants_entitlement ON public.tenants(entitlement_status);

-- 2. Create WhatsApp Messages Log Table
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number VARCHAR(50) NOT NULL,
  message_text TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, delivered, read, failed
  whatsapp_message_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON public.whatsapp_messages(tenant_id);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "Allow service_role full access to whatsapp_messages"
  ON public.whatsapp_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create Webhook Health Table
CREATE TABLE IF NOT EXISTS public.webhook_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- resend, sendgrid, whatsapp
  endpoint_url TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'healthy', -- healthy, degraded, failing
  last_ping_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  failure_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhook_health_tenant ON public.webhook_health(tenant_id);

ALTER TABLE public.webhook_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to webhook_health" ON public.webhook_health;
CREATE POLICY "Allow service_role full access to webhook_health"
  ON public.webhook_health FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Create GDPR Retention & Erasure Jobs Table
CREATE TABLE IF NOT EXISTS public.data_retention_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- export_gdpr, anonymize_delete
  target_type VARCHAR(50) NOT NULL, -- business, contact
  target_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_retention_jobs_tenant ON public.data_retention_jobs(tenant_id);

ALTER TABLE public.data_retention_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to data_retention_jobs" ON public.data_retention_jobs;
CREATE POLICY "Allow service_role full access to data_retention_jobs"
  ON public.data_retention_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
