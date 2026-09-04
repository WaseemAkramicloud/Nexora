-- ==============================================================================
-- Migration: 20260903050000_nexora_refresh_and_revalidation_engine.sql
-- Description: Concurrency-safe OAuth refresh lease, CAS credential rotation,
--              revalidation lock, 8-hour session non-sliding boundary, and expiry cleanup.
-- Stage: 6B.7 — Refresh Rotation, Live Revalidation & 8-Hour Session Continuity
-- ==============================================================================

-- 1. Extend federation_session_credentials with refresh lease and token expiry columns
ALTER TABLE nexora_internal.federation_session_credentials
    ADD COLUMN IF NOT EXISTS refresh_lock_id UUID,
    ADD COLUMN IF NOT EXISTS refresh_lock_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fsc_refresh_lock
    ON nexora_internal.federation_session_credentials(session_id, refresh_lock_id, refresh_lock_expires_at);

-- 2. Extend federation_sessions with revalidation lease columns
ALTER TABLE nexora_internal.federation_sessions
    ADD COLUMN IF NOT EXISTS revalidation_lock_id UUID,
    ADD COLUMN IF NOT EXISTS revalidation_lock_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fs_reval_lock
    ON nexora_internal.federation_sessions(session_id, revalidation_lock_id, revalidation_lock_expires_at);

-- 3. Atomic RPC: service_begin_federation_refresh
CREATE OR REPLACE FUNCTION public.service_begin_federation_refresh(
    p_session_id UUID,
    p_lease_seconds INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session RECORD;
    v_creds RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lock_id UUID;
    v_lock_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Validate session is active and not expired (8-hour hard boundary)
    SELECT
        session_id,
        status,
        expires_at,
        issuer,
        subject,
        external_organization_id
    INTO v_session
    FROM nexora_internal.federation_sessions
    WHERE session_id = p_session_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;

    IF v_session.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_active', 'status', v_session.status);
    END IF;

    IF v_session.expires_at <= v_now THEN
        -- Mark expired and destroy credentials immediately
        UPDATE nexora_internal.federation_sessions
        SET status = 'expired', updated_at = v_now
        WHERE session_id = p_session_id;

        DELETE FROM nexora_internal.federation_session_credentials
        WHERE session_id = p_session_id;

        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;

    -- 2. Load and inspect current refresh lease
    SELECT
        session_id,
        encrypted_credentials,
        iv,
        tag,
        credential_version,
        refresh_lock_id,
        refresh_lock_expires_at,
        access_token_expires_at
    INTO v_creds
    FROM nexora_internal.federation_session_credentials
    WHERE session_id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'credentials_not_found');
    END IF;

    -- If another unexpired lease exists, return locked/busy
    IF v_creds.refresh_lock_id IS NOT NULL AND v_creds.refresh_lock_expires_at > v_now THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'locked',
            'error', 'refresh_in_progress',
            'retry_after_ms', 1000
        );
    END IF;

    -- 3. Atomically acquire refresh lease
    v_lock_id := gen_random_uuid();
    v_lock_expires_at := v_now + (COALESCE(p_lease_seconds, 30) || ' seconds')::interval;

    UPDATE nexora_internal.federation_session_credentials
    SET refresh_lock_id = v_lock_id,
        refresh_lock_expires_at = v_lock_expires_at,
        updated_at = v_now
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'lock_id', v_lock_id,
        'lock_expires_at', v_lock_expires_at,
        'credential_version', v_creds.credential_version,
        'encrypted_credentials', v_creds.encrypted_credentials,
        'iv', v_creds.iv,
        'tag', v_creds.tag,
        'access_token_expires_at', v_creds.access_token_expires_at,
        'session_expires_at', v_session.expires_at,
        'issuer', v_session.issuer,
        'subject', v_session.subject,
        'external_organization_id', v_session.external_organization_id
    );
END;
$$;

-- 4. Atomic RPC: service_complete_federation_refresh (CAS on version + lock verification)
CREATE OR REPLACE FUNCTION public.service_complete_federation_refresh(
    p_session_id UUID,
    p_lock_id UUID,
    p_expected_version INT,
    p_encrypted_credentials TEXT,
    p_iv TEXT,
    p_tag TEXT,
    p_access_token_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_creds RECORD;
    v_session_status TEXT;
    v_session_expires_at TIMESTAMPTZ;
BEGIN
    -- Verify session status
    SELECT status, expires_at INTO v_session_status, v_session_expires_at
    FROM nexora_internal.federation_sessions
    WHERE session_id = p_session_id;

    IF NOT FOUND OR v_session_status <> 'active' OR v_session_expires_at <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_active_or_expired');
    END IF;

    -- Inspect credentials and verify lock + expected version
    SELECT * INTO v_creds
    FROM nexora_internal.federation_session_credentials
    WHERE session_id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'credentials_not_found');
    END IF;

    -- Lock owner must match and not be expired
    IF v_creds.refresh_lock_id IS NULL OR v_creds.refresh_lock_id <> p_lock_id OR v_creds.refresh_lock_expires_at <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_lock');
    END IF;

    -- CAS version check: exactly equal to expected version
    IF v_creds.credential_version <> p_expected_version THEN
        RETURN jsonb_build_object('success', false, 'error', 'version_mismatch', 'current_version', v_creds.credential_version);
    END IF;

    -- Atomically finalize refresh: replace credentials, increment version, record timestamps, clear lock
    UPDATE nexora_internal.federation_session_credentials
    SET encrypted_credentials = p_encrypted_credentials,
        iv = p_iv,
        tag = p_tag,
        credential_version = v_creds.credential_version + 1,
        access_token_expires_at = p_access_token_expires_at,
        last_refresh_at = v_now,
        refresh_lock_id = NULL,
        refresh_lock_expires_at = NULL,
        updated_at = v_now
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_version', v_creds.credential_version + 1,
        'last_refresh_at', v_now
    );
END;
$$;

-- 5. Atomic RPC: service_abort_federation_refresh
CREATE OR REPLACE FUNCTION public.service_abort_federation_refresh(
    p_session_id UUID,
    p_lock_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE nexora_internal.federation_session_credentials
    SET refresh_lock_id = NULL,
        refresh_lock_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE session_id = p_session_id
      AND refresh_lock_id = p_lock_id;

    RETURN FOUND;
END;
$$;

-- 6. Atomic RPC: service_begin_maftah_revalidation (Stampede lock)
CREATE OR REPLACE FUNCTION public.service_begin_maftah_revalidation(
    p_session_id UUID,
    p_lease_seconds INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lock_id UUID;
    v_lock_expires_at TIMESTAMPTZ;
BEGIN
    SELECT
        session_id,
        status,
        expires_at,
        last_maftah_revalidated_at,
        revalidation_lock_id,
        revalidation_lock_expires_at,
        external_organization_id
    INTO v_session
    FROM nexora_internal.federation_sessions
    WHERE session_id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;

    IF v_session.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_active');
    END IF;

    IF v_session.expires_at <= v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_expired');
    END IF;

    -- If another unexpired revalidation lock is held, signal busy
    IF v_session.revalidation_lock_id IS NOT NULL AND v_session.revalidation_lock_expires_at > v_now THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'locked',
            'error', 'revalidation_in_progress',
            'retry_after_ms', 1000
        );
    END IF;

    -- Acquire lock
    v_lock_id := gen_random_uuid();
    v_lock_expires_at := v_now + (COALESCE(p_lease_seconds, 30) || ' seconds')::interval;

    UPDATE nexora_internal.federation_sessions
    SET revalidation_lock_id = v_lock_id,
        revalidation_lock_expires_at = v_lock_expires_at,
        updated_at = v_now
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'lock_id', v_lock_id,
        'lock_expires_at', v_lock_expires_at,
        'external_organization_id', v_session.external_organization_id,
        'last_maftah_revalidated_at', v_session.last_maftah_revalidated_at
    );
END;
$$;

-- 7. Atomic RPC: service_record_maftah_revalidation
CREATE OR REPLACE FUNCTION public.service_record_maftah_revalidation(
    p_session_id UUID,
    p_lock_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    UPDATE nexora_internal.federation_sessions
    SET last_maftah_revalidated_at = v_now,
        revalidation_lock_id = NULL,
        revalidation_lock_expires_at = NULL,
        updated_at = v_now
    WHERE session_id = p_session_id
      AND (p_lock_id IS NULL OR revalidation_lock_id = p_lock_id);

    RETURN FOUND;
END;
$$;

-- 8. Atomic RPC: service_abort_maftah_revalidation
CREATE OR REPLACE FUNCTION public.service_abort_maftah_revalidation(
    p_session_id UUID,
    p_lock_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE nexora_internal.federation_sessions
    SET revalidation_lock_id = NULL,
        revalidation_lock_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE session_id = p_session_id
      AND revalidation_lock_id = p_lock_id;

    RETURN FOUND;
END;
$$;

-- 9. Cleanup RPC: service_cleanup_expired_sessions & transactions
CREATE OR REPLACE FUNCTION public.service_cleanup_expired_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_expired_sessions INT := 0;
    v_deleted_creds INT := 0;
    v_cleaned_tx INT := 0;
BEGIN
    -- A. Transition expired sessions
    UPDATE nexora_internal.federation_sessions
    SET status = 'expired', updated_at = v_now
    WHERE expires_at <= v_now AND status = 'active';
    GET DIAGNOSTICS v_expired_sessions = ROW_COUNT;

    -- B. Delete credentials for all expired or revoked sessions
    DELETE FROM nexora_internal.federation_session_credentials fsc
    USING nexora_internal.federation_sessions fs
    WHERE fsc.session_id = fs.session_id
      AND fs.status IN ('expired', 'revoked');
    GET DIAGNOSTICS v_deleted_creds = ROW_COUNT;

    -- C. Clean up expired/consumed login transactions (remove credential ciphertext)
    DELETE FROM nexora_internal.federation_login_transactions
    WHERE expires_at <= v_now OR status IN ('consumed', 'expired');
    GET DIAGNOSTICS v_cleaned_tx = ROW_COUNT;

    RETURN jsonb_build_object(
        'expired_sessions_count', v_expired_sessions,
        'deleted_credentials_count', v_deleted_creds,
        'cleaned_transactions_count', v_cleaned_tx
    );
END;
$$;

-- 10. Update service_get_federation_session to ensure credential destruction upon expiry
CREATE OR REPLACE FUNCTION public.service_get_federation_session(
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
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

    -- Absolute 8-hour expiry enforcement: destroy credentials upon expiration
    IF v_rec.expires_at <= v_now AND v_rec.status = 'active' THEN
        UPDATE nexora_internal.federation_sessions
        SET status = 'expired', updated_at = v_now
        WHERE session_id = p_session_id;
        v_rec.status := 'expired';

        DELETE FROM nexora_internal.federation_session_credentials
        WHERE session_id = p_session_id;
    END IF;

    RETURN to_jsonb(v_rec);
END;
$$;

-- Revoke all permissions on new RPCs from PUBLIC, anon, authenticated
REVOKE ALL ON FUNCTION public.service_begin_federation_refresh(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_complete_federation_refresh(UUID, UUID, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_abort_federation_refresh(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_begin_maftah_revalidation(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_record_maftah_revalidation(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_abort_maftah_revalidation(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_cleanup_expired_sessions() FROM PUBLIC, anon, authenticated;

-- Grant execute explicitly to service_role only
GRANT EXECUTE ON FUNCTION public.service_begin_federation_refresh(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_complete_federation_refresh(UUID, UUID, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_abort_federation_refresh(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_begin_maftah_revalidation(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_record_maftah_revalidation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_abort_maftah_revalidation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_cleanup_expired_sessions() TO service_role;
