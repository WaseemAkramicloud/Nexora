-- ============================================================================
-- MIGRATION: NEXORA Central Inbox, Real-Event Analytics & Usage Ledger Schema
-- Date: 2026-08-11
-- Purpose: Central responses inbox, AI response categories, transparent credit usage ledger,
--          and secure LAM entitlement reporting function.
-- ============================================================================

-- 1. Create Inbox Messages Table
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE SET NULL,
  dispatch_id UUID REFERENCES public.outreach_dispatches(id) ON DELETE SET NULL,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  response_category VARCHAR(50) NOT NULL DEFAULT 'Unclear', -- Interested, Not Interested, Referral, Out of Office, Unsubscribe, Unclear, Manual Review
  ai_classification_confidence NUMERIC(3, 2) DEFAULT 0.85,
  classified_by VARCHAR(50) DEFAULT 'ai_assisted', -- ai_assisted, human_corrected
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_tenant ON public.inbox_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_category ON public.inbox_messages(response_category);

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to inbox_messages" ON public.inbox_messages;
CREATE POLICY "Allow service_role full access to inbox_messages"
  ON public.inbox_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Create Transparent Usage Ledger Table
CREATE TABLE IF NOT EXISTS public.usage_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- discovery_search, enrichment_credit, verification_check, email_dispatch, ai_qualification
  credits_consumed INT DEFAULT 1,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_tenant ON public.usage_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_type ON public.usage_ledger(event_type);

ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to usage_ledger" ON public.usage_ledger;
CREATE POLICY "Allow service_role full access to usage_ledger"
  ON public.usage_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Secure LAM Entitlement SQL Function (Isolated Entitlement Interface)
CREATE OR REPLACE FUNCTION public.get_lam_entitlement_summary(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_discovery_credits INT;
  v_enrichment_credits INT;
  v_verification_credits INT;
  v_email_credits INT;
  v_ai_credits INT;
  v_total_credits INT;
BEGIN
  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_discovery_credits FROM public.usage_ledger WHERE tenant_id = p_tenant_id AND event_type = 'discovery_search';
  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_enrichment_credits FROM public.usage_ledger WHERE tenant_id = p_tenant_id AND event_type = 'enrichment_credit';
  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_verification_credits FROM public.usage_ledger WHERE tenant_id = p_tenant_id AND event_type = 'verification_check';
  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_email_credits FROM public.usage_ledger WHERE tenant_id = p_tenant_id AND event_type = 'email_dispatch';
  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_ai_credits FROM public.usage_ledger WHERE tenant_id = p_tenant_id AND event_type = 'ai_qualification';

  v_total_credits := v_discovery_credits + v_enrichment_credits + v_verification_credits + v_email_credits + v_ai_credits;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'total_credits_consumed', v_total_credits,
    'breakdown', jsonb_build_object(
      'discovery_credits', v_discovery_credits,
      'enrichment_credits', v_enrichment_credits,
      'verification_credits', v_verification_credits,
      'email_credits', v_email_credits,
      'ai_credits', v_ai_credits
    ),
    'reported_at', timezone('utc'::text, now())
  );
END;
$$;

-- Trigger for updated_at on inbox_messages
DROP TRIGGER IF EXISTS update_inbox_messages_updated_at ON public.inbox_messages;
CREATE TRIGGER update_inbox_messages_updated_at
  BEFORE UPDATE ON public.inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_nexora_updated_at();
