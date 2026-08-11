-- ============================================================================
-- MIGRATION: NEXORA Production Email Outreach Engine Schema
-- Date: 2026-08-11
-- Purpose: Sender connections, multi-step email sequences, dispatches,
--          signed webhooks, event deduplication, reply-stop rules & suppression lists.
-- ============================================================================

-- 1. Create Sender Connections Table
CREATE TABLE IF NOT EXISTS public.sender_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'resend', -- resend, sendgrid, smtp
  daily_limit INT DEFAULT 200,
  sent_today INT DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, paused, error
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sender_connections_tenant ON public.sender_connections(tenant_id);

ALTER TABLE public.sender_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to sender_connections" ON public.sender_connections;
CREATE POLICY "Allow service_role full access to sender_connections"
  ON public.sender_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Create Email Sequences Table
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, paused
  steps JSONB NOT NULL DEFAULT '[]', -- Array of step configs with delays & templates
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_sequences_tenant ON public.email_sequences(tenant_id);

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to email_sequences" ON public.email_sequences;
CREATE POLICY "Allow service_role full access to email_sequences"
  ON public.email_sequences FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Create Outreach Dispatches Table (With Webhook Deduplication)
CREATE TABLE IF NOT EXISTS public.outreach_dispatches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  sender_connection_id UUID REFERENCES public.sender_connections(id) ON DELETE SET NULL,
  step_number INT DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, sent, delivered, bounced, replied, unsubscribed, suppressed, stopped_on_reply
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  webhook_event_id VARCHAR(255) UNIQUE, -- Deduplicates incoming webhook events!
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_dispatches_tenant ON public.outreach_dispatches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_dispatches_business ON public.outreach_dispatches(business_id);
CREATE INDEX IF NOT EXISTS idx_outreach_dispatches_status ON public.outreach_dispatches(status);

ALTER TABLE public.outreach_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to outreach_dispatches" ON public.outreach_dispatches;
CREATE POLICY "Allow service_role full access to outreach_dispatches"
  ON public.outreach_dispatches FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Create Suppression List Table
CREATE TABLE IF NOT EXISTS public.suppression_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  domain VARCHAR(255),
  reason VARCHAR(50) NOT NULL DEFAULT 'unsubscribe', -- hard_bounce, unsubscribe, objection, manual_suppress
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppression_list_tenant_email ON public.suppression_list(tenant_id, email);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to suppression_list" ON public.suppression_list;
CREATE POLICY "Allow service_role full access to suppression_list"
  ON public.suppression_list FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_sender_connections_updated_at ON public.sender_connections;
CREATE TRIGGER update_sender_connections_updated_at
  BEFORE UPDATE ON public.sender_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_email_sequences_updated_at ON public.email_sequences;
CREATE TRIGGER update_email_sequences_updated_at
  BEFORE UPDATE ON public.email_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();

DROP TRIGGER IF EXISTS update_outreach_dispatches_updated_at ON public.outreach_dispatches;
CREATE TRIGGER update_outreach_dispatches_updated_at
  BEFORE UPDATE ON public.outreach_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
