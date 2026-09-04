-- ==============================================================================
-- Verification: 20260903040000_verify_nexora_federation_adapter.sql
-- Description: Structural & Permission Verification for NEXORA Federation Adapter
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
-- ==============================================================================

DO $verify$
DECLARE
    v_schema_exists BOOLEAN;
    v_eil_exists BOOLEAN;
    v_fwl_exists BOOLEAN;
    v_fs_exists BOOLEAN;
    v_fsc_exists BOOLEAN;
    v_flt_exists BOOLEAN;
    v_has_anon_priv BOOLEAN;
    v_has_auth_priv BOOLEAN;
    v_has_service_priv BOOLEAN;
BEGIN
    -- 1. Verify schema exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'nexora_internal'
    ) INTO v_schema_exists;
    ASSERT v_schema_exists, 'Schema nexora_internal must exist';

    -- 2. Verify all tables exist
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'nexora_internal' AND table_name = 'external_identity_links') INTO v_eil_exists;
    ASSERT v_eil_exists, 'Table nexora_internal.external_identity_links must exist';

    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'nexora_internal' AND table_name = 'federation_workspace_links') INTO v_fwl_exists;
    ASSERT v_fwl_exists, 'Table nexora_internal.federation_workspace_links must exist';

    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'nexora_internal' AND table_name = 'federation_sessions') INTO v_fs_exists;
    ASSERT v_fs_exists, 'Table nexora_internal.federation_sessions must exist';

    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'nexora_internal' AND table_name = 'federation_session_credentials') INTO v_fsc_exists;
    ASSERT v_fsc_exists, 'Table nexora_internal.federation_session_credentials must exist';

    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'nexora_internal' AND table_name = 'federation_login_transactions') INTO v_flt_exists;
    ASSERT v_flt_exists, 'Table nexora_internal.federation_login_transactions must exist';

    -- 3. Verify public RPCs exist with SECURITY DEFINER
    ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'service_get_federation_identity_link'), 'service_get_federation_identity_link must be SECURITY DEFINER';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'service_resolve_federation_workspace'), 'service_resolve_federation_workspace must be SECURITY DEFINER';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'service_create_federation_session'), 'service_create_federation_session must be SECURITY DEFINER';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'service_get_federation_session'), 'service_get_federation_session must be SECURITY DEFINER';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'service_revoke_federation_session'), 'service_revoke_federation_session must be SECURITY DEFINER';

    -- 4. Verify privilege isolation on internal schema
    SELECT has_schema_privilege('anon', 'nexora_internal', 'USAGE') INTO v_has_anon_priv;
    ASSERT NOT v_has_anon_priv, 'anon role MUST NOT have USAGE on nexora_internal';

    SELECT has_schema_privilege('authenticated', 'nexora_internal', 'USAGE') INTO v_has_auth_priv;
    ASSERT NOT v_has_auth_priv, 'authenticated role MUST NOT have USAGE on nexora_internal';

    SELECT has_schema_privilege('service_role', 'nexora_internal', 'USAGE') INTO v_has_service_priv;
    ASSERT v_has_service_priv, 'service_role MUST have USAGE on nexora_internal';

    RAISE NOTICE 'NEXORA Federation Adapter Schema & Permissions Verification: SUCCESS';
END;
$verify$;
