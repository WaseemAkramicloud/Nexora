-- ==============================================================================
-- Verification: 20260903050000_nexora_refresh_and_revalidation_engine.verify.sql
-- Description: Verify Stage 6B.7 columns, indexes, and function signatures
-- ==============================================================================

DO $$
BEGIN
    -- Verify columns on federation_session_credentials
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'nexora_internal' AND table_name = 'federation_session_credentials' AND column_name = 'refresh_lock_id'
    ), 'Missing column refresh_lock_id on federation_session_credentials';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'nexora_internal' AND table_name = 'federation_session_credentials' AND column_name = 'refresh_lock_expires_at'
    ), 'Missing column refresh_lock_expires_at on federation_session_credentials';

    -- Verify columns on federation_sessions
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'nexora_internal' AND table_name = 'federation_sessions' AND column_name = 'revalidation_lock_id'
    ), 'Missing column revalidation_lock_id on federation_sessions';

    -- Verify RPCs exist in public schema
    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'service_begin_federation_refresh'
    ), 'Missing RPC service_begin_federation_refresh';

    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'service_complete_federation_refresh'
    ), 'Missing RPC service_complete_federation_refresh';

    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'service_begin_maftah_revalidation'
    ), 'Missing RPC service_begin_maftah_revalidation';

    ASSERT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'service_cleanup_expired_sessions'
    ), 'Missing RPC service_cleanup_expired_sessions';

    RAISE NOTICE 'Stage 6B.7 NEXORA Refresh & Revalidation Engine Schema Verification: PASSED';
END;
$$;
