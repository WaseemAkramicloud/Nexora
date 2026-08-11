-- ============================================================================
-- MIGRATION: NEXORA Platform Superadmin & Team Invitation Schema
-- Date: 2026-08-11
-- Purpose: Isolated platform administration role (platform_superadmin) separate
--          from customer tenant owners, and pending LAM team invitation queue.
-- ============================================================================

-- 1. Create Isolated Platform Administrators Table
CREATE TABLE IF NOT EXISTS public.platform_administrators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lam_customer_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'platform_superadmin', -- platform_superadmin, platform_support_admin
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_administrators_lam ON public.platform_administrators(lam_customer_id);

ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to platform_administrators" ON public.platform_administrators;
CREATE POLICY "Allow service_role full access to platform_administrators"
  ON public.platform_administrators FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Create Pending Team Invitations Queue Table
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'sales_user',
  status VARCHAR(50) NOT NULL DEFAULT 'pending_lam_grant', -- pending_lam_grant, accepted, expired
  requested_by UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_tenant ON public.team_invitations(tenant_id);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to team_invitations" ON public.team_invitations;
CREATE POLICY "Allow service_role full access to team_invitations"
  ON public.team_invitations FOR ALL TO service_role USING (true) WITH CHECK (true);
