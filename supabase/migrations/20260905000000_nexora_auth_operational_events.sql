-- ==============================================================================
-- Migration: 20260905000000_nexora_auth_operational_events.sql
-- Description: NEXORA Federation & Auth Operational Events Observability (Stage 6C.1)
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
--
-- Security & Operational Invariants:
-- 1. Private schema storage: nexora_internal.auth_operational_events.
-- 2. Zero direct table access granted to application roles (including service_role).
-- 3. Exclusively written via narrow SECURITY DEFINER SET search_path = "" public service RPC.
-- 4. Append-only enforcement: no UPDATE/DELETE privileges granted to any runtime roles.
-- 5. Strict Database-Enforced Allowlist Metadata: reconstructs allowlist (latency_ms,
--    credential_version, revalidation_type, flow) and strips all unknown JSON keys.
-- 6. Overflow-Safe Type Extraction: bounds numeric strings to 1-9 digits before integer cast.
-- 7. Operational Retention: documented 60-day operational retention model.
-- ==============================================================================

-- 1. Ensure nexora_internal schema exists with strict revocation
CREATE SCHEMA IF NOT EXISTS nexora_internal;

REVOKE ALL ON SCHEMA nexora_internal FROM PUBLIC, anon, authenticated, service_role;

-- 2. Table: auth_operational_events (Private Append-Only Operational Telemetry)
CREATE TABLE IF NOT EXISTS nexora_internal.auth_operational_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (length(event_type) <= 64),
    provider TEXT NOT NULL CHECK (provider IN ('maftah', 'legacy_sso', 'dev_auth')),
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'pending', 'info')),
    safe_error_code TEXT CHECK (safe_error_code IS NULL OR length(safe_error_code) <= 64),
    environment TEXT NOT NULL DEFAULT 'production' CHECK (length(environment) <= 32),
    external_org_id UUID,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    session_id UUID,
    subject TEXT CHECK (subject IS NULL OR length(subject) <= 128),
    correlation_id TEXT CHECK (correlation_id IS NULL OR length(correlation_id) <= 128),
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

-- 4. Strict Privilege Isolation on Table: Zero table-level access for any runtime roles
REVOKE ALL ON nexora_internal.auth_operational_events FROM PUBLIC, anon, authenticated, service_role;

-- 5. Service RPC: public.service_log_auth_operational_event
-- Exclusive narrow write path with database-enforced metadata allowlist reconstruction.
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
    v_latency_ms INT;
    v_cred_version INT;
    v_reval_type TEXT;
    v_flow TEXT;
    v_clean_metadata JSONB;
BEGIN
    -- 1. Extract and validate typed allowlisted metadata keys only
    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        -- latency_ms (non-negative integer, bounded to 1-9 digits to prevent integer overflow)
        IF (p_metadata->>'latency_ms') ~ '^[0-9]{1,9}$' THEN
            v_latency_ms := (p_metadata->>'latency_ms')::INT;
        ELSE
            v_latency_ms := NULL;
        END IF;

        -- credential_version (non-negative integer, bounded to 1-9 digits to prevent integer overflow)
        IF (p_metadata->>'credential_version') ~ '^[0-9]{1,9}$' THEN
            v_cred_version := (p_metadata->>'credential_version')::INT;
        ELSE
            v_cred_version := NULL;
        END IF;

        -- revalidation_type (strictly allowlisted values)
        IF (p_metadata->>'revalidation_type') IN ('none', 'cached', 'full') THEN
            v_reval_type := p_metadata->>'revalidation_type';
        ELSE
            v_reval_type := NULL;
        END IF;

        -- flow (bounded string identifier)
        IF (p_metadata->>'flow') IS NOT NULL AND length(p_metadata->>'flow') <= 64 AND (p_metadata->>'flow') ~ '^[a-zA-Z0-9_-]+$' THEN
            v_flow := p_metadata->>'flow';
        ELSE
            v_flow := NULL;
        END IF;
    END IF;

    -- Reconstruct clean metadata with only valid allowlisted keys, discarding unknown/unapproved keys
    v_clean_metadata := jsonb_strip_nulls(
        jsonb_build_object(
            'latency_ms', v_latency_ms,
            'credential_version', v_cred_version,
            'revalidation_type', v_reval_type,
            'flow', v_flow
        )
    );

    -- Strict Append-Only Insert via SECURITY DEFINER
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
        substring(trim(p_event_type) from 1 for 64),
        p_provider,
        p_outcome,
        substring(trim(p_safe_error_code) from 1 for 64),
        COALESCE(substring(trim(p_environment) from 1 for 32), 'production'),
        p_external_org_id,
        p_tenant_id,
        p_session_id,
        substring(trim(p_subject) from 1 for 128),
        substring(trim(p_correlation_id) from 1 for 128),
        COALESCE(v_clean_metadata, '{}'::jsonb),
        now()
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- 6. Strict Function Privilege Lockdown: service_role can EXECUTE only
REVOKE ALL ON FUNCTION public.service_log_auth_operational_event(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.service_log_auth_operational_event(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB
) TO service_role;
