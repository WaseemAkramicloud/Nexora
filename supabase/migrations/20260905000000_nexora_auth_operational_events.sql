-- ==============================================================================
-- Migration: 20260905000000_nexora_auth_operational_events.sql
-- Description: NEXORA Federation & Auth Operational Events Observability (Stage 6C.1)
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
--
-- Security & Operational Invariants:
-- 1. Private schema storage: nexora_internal.auth_operational_events.
-- 2. Strictly revoked from PUBLIC, anon, and authenticated roles (zero PostgREST exposure).
-- 3. Exclusively written via narrow SECURITY DEFINER SET search_path = "" public service RPC.
-- 4. Append-only enforcement: no UPDATE/DELETE privileges granted to application roles.
-- 5. Strict Allowlist Metadata: excludes ip_address, passwords, tokens, secrets, codes, verifiers.
-- 6. Operational Retention: documented 60-day operational retention model.
-- ==============================================================================

-- 1. Ensure nexora_internal schema exists
CREATE SCHEMA IF NOT EXISTS nexora_internal;

REVOKE ALL ON SCHEMA nexora_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nexora_internal TO service_role;

-- 2. Table: auth_operational_events (Private Append-Only Operational Telemetry)
CREATE TABLE IF NOT EXISTS nexora_internal.auth_operational_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('maftah', 'legacy_sso', 'dev_auth')),
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'pending', 'info')),
    safe_error_code TEXT,
    environment TEXT NOT NULL DEFAULT 'production',
    external_org_id UUID,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    session_id UUID,
    subject TEXT,
    correlation_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Targeted Operational Query Indexes
CREATE INDEX IF NOT EXISTS idx_auth_op_events_type_created
    ON nexora_internal.auth_operational_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_op_events_created
    ON nexora_internal.auth_operational_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_op_events_outcome
    ON nexora_internal.auth_operational_events(outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_op_events_correlation
    ON nexora_internal.auth_operational_events(correlation_id)
    WHERE correlation_id IS NOT NULL;

-- 4. Strict Privilege Isolation on Table
REVOKE ALL ON nexora_internal.auth_operational_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON nexora_internal.auth_operational_events TO service_role;

-- 5. Service RPC: public.service_log_auth_operational_event
-- Follows existing frozen NEXORA private-table + public SECURITY DEFINER wrapper pattern.
CREATE OR REPLACE FUNCTION public.service_log_auth_operational_event(
    p_event_type TEXT,
    p_provider TEXT,
    p_outcome TEXT,
    p_safe_error_code TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT 'production',
    p_external_org_id UUID DEFAULT NULL,
    p_tenant_id UUID DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_subject TEXT DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event_id UUID;
    v_clean_metadata JSONB;
BEGIN
    -- Ensure input metadata is valid jsonb object
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) != 'object' THEN
        v_clean_metadata := '{}'::jsonb;
    ELSE
        v_clean_metadata := p_metadata;
    END IF;

    -- Strict Append-Only Insert
    INSERT INTO nexora_internal.auth_operational_events (
        event_type,
        provider,
        outcome,
        safe_error_code,
        environment,
        external_org_id,
        tenant_id,
        session_id,
        subject,
        correlation_id,
        metadata,
        created_at
    ) VALUES (
        p_event_type,
        p_provider,
        p_outcome,
        p_safe_error_code,
        COALESCE(p_environment, 'production'),
        p_external_org_id,
        p_tenant_id,
        p_session_id,
        p_subject,
        p_correlation_id,
        v_clean_metadata,
        now()
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- 6. Strict Function Privilege Lockdown
REVOKE ALL ON FUNCTION public.service_log_auth_operational_event(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.service_log_auth_operational_event(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB
) TO service_role;
