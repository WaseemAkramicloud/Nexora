-- ==============================================================================
-- Migration: 20260903040000_nexora_federation_adapter.sql
-- Description: NEXORA Local Maftah OAuth Adapter & Federation Session Schema (Stage 6B.6A)
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
--
-- Security & Multi-Org Invariants:
-- 1. Normalized External Identity model:
--    external_identities (1) -> (many) external_identity_memberships
--    Allows 1 Maftah subject to hold distinct memberships across multiple tenants.
-- 2. Bidirectional workspace mapping uniqueness for active links:
--    UNIQUE active (issuer, external_organization_id) AND UNIQUE active (issuer, tenant_id).
-- 3. AES-256-GCM structured credential vault with fresh 12-byte IV and AAD context binding.
-- 4. Server-enforced membership <-> tenant referential integrity in session creation RPC.
-- 5. Strict privilege isolation: zero direct table grants to service_role, access exclusively via SECURITY DEFINER RPCs.
-- ==============================================================================

-- 1. Create private internal schema
CREATE SCHEMA IF NOT EXISTS nexora_internal;

REVOKE ALL ON SCHEMA nexora_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nexora_internal TO service_role;

-- 2. Table: external_identities (Represents the human person)
CREATE TABLE IF NOT EXISTS nexora_internal.external_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'maftah_oauth',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT external_identities_issuer_subject_key UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_ext_identities_lookup
    ON nexora_internal.external_identities(issuer, subject, status);

-- 3. Table: external_identity_memberships (Maps external identity -> tenant membership)
CREATE TABLE IF NOT EXISTS nexora_internal.external_identity_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_identity_id UUID NOT NULL REFERENCES nexora_internal.external_identities(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ext_id_membership_unique UNIQUE (external_identity_id, membership_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_id_memberships_lookup
    ON nexora_internal.external_identity_memberships(external_identity_id, membership_id, status);

-- 4. Table: federation_workspace_links (Maps Maftah Org -> NEXORA Tenant)
CREATE TABLE IF NOT EXISTS nexora_internal.federation_workspace_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    issuer TEXT NOT NULL,
    external_organization_id UUID NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'maftah_oauth',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial Unique Indexes for active workspace mappings (1:1 bidirectional integrity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_fwl_external_org
    ON nexora_internal.federation_workspace_links (issuer, external_organization_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_fwl_tenant
    ON nexora_internal.federation_workspace_links (issuer, tenant_id)
    WHERE status = 'active';

-- 5. Table: federation_sessions
CREATE TABLE IF NOT EXISTS nexora_internal.federation_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    external_organization_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_maftah_revalidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fed_sessions_lookup
    ON nexora_internal.federation_sessions(session_id, status);

-- 6. Table: federation_session_credentials (Option A: Structured Payload Vault)
CREATE TABLE IF NOT EXISTS nexora_internal.federation_session_credentials (
    session_id UUID PRIMARY KEY REFERENCES nexora_internal.federation_sessions(session_id) ON DELETE CASCADE,
    encrypted_credentials TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    credential_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Table: federation_login_transactions (Short-lived multi-org selector state)
CREATE TABLE IF NOT EXISTS nexora_internal.federation_login_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    encrypted_credentials TEXT NOT NULL,
    iv TEXT NOT NULL,
    tag TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fed_login_tx_lookup
    ON nexora_internal.federation_login_transactions(transaction_id, status);

-- Revoke direct table privileges on nexora_internal from all roles (including service_role)
REVOKE ALL ON ALL TABLES IN SCHEMA nexora_internal FROM PUBLIC, anon, authenticated, service_role;

-- ==============================================================================
-- 8. Server-Only RPC Wrappers in  schema (SECURITY DEFINER, service_role only)
-- ==============================================================================

-- 8.1 Resolve Identity Link for a specific Tenant
CREATE OR REPLACE FUNCTION public.service_get_federation_identity_link(
    p_issuer TEXT,
    p_subject TEXT,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_match_count INT;
    v_rec RECORD;
BEGIN
    -- Check how many active memberships exist for this (issuer, subject) in the given tenant
    SELECT COUNT(*)
    INTO v_match_count
    FROM nexora_internal.external_identities ei
    JOIN nexora_internal.external_identity_memberships eim ON ei.id = eim.external_identity_id
    JOIN public.memberships m ON eim.membership_id = m.id
    WHERE ei.issuer = p_issuer
      AND ei.subject = p_subject
      AND ei.status = 'active'
      AND eim.status = 'active'
      AND m.tenant_id = p_tenant_id;

    IF v_match_count = 0 THEN
        RETURN NULL;
    ELSIF v_match_count > 1 THEN
        -- Fail closed on ambiguous same-tenant configuration
        RETURN jsonb_build_object('error', 'identity_link_conflict');
    END IF;

    SELECT
        ei.id AS external_identity_id,
        eim.id AS link_id,
        m.id AS membership_id,
        m.tenant_id,
        m.role,
        m.status AS membership_status,
        m.email,
        m.first_name,
        m.last_name,
        m.avatar_url
    INTO v_rec
    FROM nexora_internal.external_identities ei
    JOIN nexora_internal.external_identity_memberships eim ON ei.id = eim.external_identity_id
    JOIN public.memberships m ON eim.membership_id = m.id
    WHERE ei.issuer = p_issuer
      AND ei.subject = p_subject
      AND ei.status = 'active'
      AND eim.status = 'active'
      AND m.tenant_id = p_tenant_id;

    RETURN to_jsonb(v_rec);
END;
10925;

-- 8.2 Resolve Workspace Link
CREATE OR REPLACE FUNCTION public.service_resolve_federation_workspace(
    p_issuer TEXT,
    p_external_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_rec RECORD;
BEGIN
    SELECT
        fwl.id,
        fwl.tenant_id,
        fwl.status,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status AS tenant_status
    INTO v_rec
    FROM nexora_internal.federation_workspace_links fwl
    JOIN public.tenants t ON fwl.tenant_id = t.id
    WHERE fwl.issuer = p_issuer
      AND fwl.external_organization_id = p_external_org_id
      AND fwl.status = 'active';

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN to_jsonb(v_rec);
END;
10925;

-- 8.3 Create Federation Session with Transactional Integrity
CREATE OR REPLACE FUNCTION public.service_create_federation_session(
    p_membership_id UUID,
    p_tenant_id UUID,
    p_issuer TEXT,
    p_subject TEXT,
    p_external_org_id UUID,
    p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_session_id UUID;
    v_is_valid_membership BOOLEAN;
BEGIN
    -- Transactionally verify membership belongs to specified tenant and is active
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE id = p_membership_id
          AND tenant_id = p_tenant_id
          AND status = 'active'
    ) INTO v_is_valid_membership;

    IF NOT v_is_valid_membership THEN
        RAISE EXCEPTION 'Membership % does not belong to tenant % or is not active', p_membership_id, p_tenant_id;
    END IF;

    INSERT INTO nexora_internal.federation_sessions (
        membership_id,
        tenant_id,
        issuer,
        subject,
        external_organization_id,
        status,
        expires_at
    ) VALUES (
        p_membership_id,
        p_tenant_id,
        p_issuer,
        p_subject,
        p_external_org_id,
        'active',
        p_expires_at
    )
    RETURNING session_id INTO v_session_id;

    RETURN v_session_id;
END;
10925;

-- 8.4 Get Federation Session
CREATE OR REPLACE FUNCTION public.service_get_federation_session(
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_rec RECORD;
BEGIN
    SELECT
        fs.session_id,
        fs.membership_id,
        fs.tenant_id,
        fs.issuer,
        fs.subject,
        fs.external_organization_id,
        fs.status,
        fs.created_at,
        fs.expires_at,
        fs.last_maftah_revalidated_at,
        m.role,
        m.status AS membership_status,
        m.email,
        m.first_name,
        m.last_name,
        m.avatar_url,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status AS tenant_status
    INTO v_rec
    FROM nexora_internal.federation_sessions fs
    JOIN public.memberships m ON fs.membership_id = m.id
    JOIN public.tenants t ON fs.tenant_id = t.id
    WHERE fs.session_id = p_session_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Strict server-side expiration check
    IF v_rec.expires_at <= now() AND v_rec.status = 'active' THEN
        UPDATE nexora_internal.federation_sessions
        SET status = 'expired', updated_at = now()
        WHERE session_id = p_session_id;
        v_rec.status := 'expired';
    END IF;

    RETURN to_jsonb(v_rec);
END;
10925;

-- 8.5 Revoke Federation Session
CREATE OR REPLACE FUNCTION public.service_revoke_federation_session(
    p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
BEGIN
    UPDATE nexora_internal.federation_sessions
    SET status = 'revoked', revoked_at = now(), updated_at = now()
    WHERE session_id = p_session_id;

    -- Delete credentials from vault immediately
    DELETE FROM nexora_internal.federation_session_credentials
    WHERE session_id = p_session_id;

    RETURN FOUND;
END;
10925;

-- 8.6 Store Federation Credentials (Option A: Structured Payload)
CREATE OR REPLACE FUNCTION public.service_store_federation_credentials(
    p_session_id UUID,
    p_encrypted_credentials TEXT,
    p_iv TEXT,
    p_tag TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
BEGIN
    INSERT INTO nexora_internal.federation_session_credentials (
        session_id,
        encrypted_credentials,
        iv,
        tag,
        updated_at
    ) VALUES (
        p_session_id,
        p_encrypted_credentials,
        p_iv,
        p_tag,
        now()
    )
    ON CONFLICT (session_id) DO UPDATE SET
        encrypted_credentials = EXCLUDED.encrypted_credentials,
        iv = EXCLUDED.iv,
        tag = EXCLUDED.tag,
        credential_version = nexora_internal.federation_session_credentials.credential_version + 1,
        updated_at = now();

    RETURN TRUE;
END;
10925;

-- 8.7 Get Federation Credentials
CREATE OR REPLACE FUNCTION public.service_get_federation_credentials(
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_rec RECORD;
BEGIN
    SELECT
        session_id,
        encrypted_credentials,
        iv,
        tag,
        credential_version,
        updated_at
    INTO v_rec
    FROM nexora_internal.federation_session_credentials
    WHERE session_id = p_session_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN to_jsonb(v_rec);
END;
10925;

-- 8.8 Create Login Transaction
CREATE OR REPLACE FUNCTION public.service_create_login_transaction(
    p_issuer TEXT,
    p_subject TEXT,
    p_encrypted_credentials TEXT,
    p_iv TEXT,
    p_tag TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_tx_id UUID;
BEGIN
    INSERT INTO nexora_internal.federation_login_transactions (
        issuer,
        subject,
        encrypted_credentials,
        iv,
        tag,
        expires_at
    ) VALUES (
        p_issuer,
        p_subject,
        p_encrypted_credentials,
        p_iv,
        p_tag,
        now() + interval '10 minutes'
    )
    RETURNING transaction_id INTO v_tx_id;

    RETURN v_tx_id;
END;
10925;

-- 8.9 Get Login Transaction
CREATE OR REPLACE FUNCTION public.service_get_login_transaction(
    p_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_rec RECORD;
BEGIN
    SELECT
        transaction_id,
        issuer,
        subject,
        encrypted_credentials,
        iv,
        tag,
        expires_at,
        status,
        consumed_at,
        created_at
    INTO v_rec
    FROM nexora_internal.federation_login_transactions
    WHERE transaction_id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_rec.expires_at <= now() AND v_rec.status = 'pending' THEN
        UPDATE nexora_internal.federation_login_transactions
        SET status = 'expired'
        WHERE transaction_id = p_transaction_id;
        v_rec.status := 'expired';
    END IF;

    RETURN to_jsonb(v_rec);
END;
10925;

-- 8.10 Consume Login Transaction
CREATE OR REPLACE FUNCTION public.service_consume_login_transaction(
    p_transaction_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
BEGIN
    UPDATE nexora_internal.federation_login_transactions
    SET status = 'consumed', consumed_at = now()
    WHERE transaction_id = p_transaction_id
      AND status = 'pending'
      AND expires_at > now();

    RETURN FOUND;
END;
10925;

-- 8.11 Explicit Link Provisioning RPC (for safe provisioning script)
CREATE OR REPLACE FUNCTION public.service_provision_federation_link(
    p_tenant_id UUID,
    p_membership_id UUID,
    p_issuer TEXT,
    p_external_org_id UUID,
    p_subject TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS 10925
DECLARE
    v_is_valid_membership BOOLEAN;
    v_ext_id UUID;
    v_existing_membership_id UUID;
BEGIN
    -- 1. Validate membership belongs to tenant
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE id = p_membership_id
          AND tenant_id = p_tenant_id
    ) INTO v_is_valid_membership;

    IF NOT v_is_valid_membership THEN
        RETURN jsonb_build_object('success', false, 'error', 'membership_tenant_mismatch');
    END IF;

    -- 2. Upsert external_identities record
    INSERT INTO nexora_internal.external_identities (
        issuer,
        subject,
        provider_type,
        status
    ) VALUES (
        p_issuer,
        p_subject,
        'maftah_oauth',
        'active'
    )
    ON CONFLICT (issuer, subject) DO UPDATE SET
        status = 'active',
        updated_at = now()
    RETURNING id INTO v_ext_id;

    -- 3. Check for conflict: same external identity + same tenant with a different active membership
    SELECT eim.membership_id
    INTO v_existing_membership_id
    FROM nexora_internal.external_identity_memberships eim
    JOIN public.memberships m ON eim.membership_id = m.id
    WHERE eim.external_identity_id = v_ext_id
      AND m.tenant_id = p_tenant_id
      AND eim.membership_id <> p_membership_id
      AND eim.status = 'active';

    IF v_existing_membership_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'same_tenant_membership_conflict');
    END IF;

    -- 4. Upsert external_identity_memberships link
    INSERT INTO nexora_internal.external_identity_memberships (
        external_identity_id,
        membership_id,
        status
    ) VALUES (
        v_ext_id,
        p_membership_id,
        'active'
    )
    ON CONFLICT (external_identity_id, membership_id) DO UPDATE SET
        status = 'active',
        updated_at = now();

    -- 5. Upsert federation_workspace_links
    INSERT INTO nexora_internal.federation_workspace_links (
        tenant_id,
        issuer,
        external_organization_id,
        provider_type,
        status
    ) VALUES (
        p_tenant_id,
        p_issuer,
        p_external_org_id,
        'maftah_oauth',
        'active'
    )
    ON CONFLICT (issuer, external_organization_id) WHERE status = 'active'
    DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
10925;

-- Revoke function execution from public, anon, and authenticated
REVOKE ALL ON FUNCTION public.service_get_federation_identity_link(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_resolve_federation_workspace(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_create_federation_session(UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_get_federation_session(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_revoke_federation_session(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_store_federation_credentials(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_get_federation_credentials(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_create_login_transaction(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_get_login_transaction(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_consume_login_transaction(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_provision_federation_link(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant execution explicitly to service_role
GRANT EXECUTE ON FUNCTION public.service_get_federation_identity_link(TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_resolve_federation_workspace(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_create_federation_session(UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_federation_session(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_revoke_federation_session(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_store_federation_credentials(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_federation_credentials(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_create_login_transaction(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_login_transaction(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_consume_login_transaction(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_provision_federation_link(UUID, UUID, TEXT, UUID, TEXT) TO service_role;
