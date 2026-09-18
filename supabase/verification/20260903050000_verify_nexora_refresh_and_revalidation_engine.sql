-- ==============================================================================
-- Verification: Current NEXORA Refresh & Revalidation Engine
-- Read-only assertions only. This file does not create or mutate data.
-- ==============================================================================

DO $verify$
DECLARE
    v_column_name TEXT;
    v_signature TEXT;
    v_function_oid OID;
    v_function_definition TEXT;
    v_is_security_definer BOOLEAN;
    v_credential_columns CONSTANT TEXT[] := ARRAY[
        'refresh_lock_id',
        'refresh_lock_expires_at',
        'last_refresh_at',
        'access_token_expires_at'
    ];
    v_session_columns CONSTANT TEXT[] := ARRAY[
        'revalidation_lock_id',
        'revalidation_lock_expires_at'
    ];
    v_engine_rpc_signatures CONSTANT TEXT[] := ARRAY[
        'public.service_begin_federation_refresh(uuid,integer)',
        'public.service_complete_federation_refresh(uuid,uuid,integer,text,text,text,timestamp with time zone)',
        'public.service_abort_federation_refresh(uuid,uuid)',
        'public.service_begin_maftah_revalidation(uuid,integer)',
        'public.service_record_maftah_revalidation(uuid,uuid)',
        'public.service_abort_maftah_revalidation(uuid,uuid)',
        'public.service_cleanup_expired_sessions()'
    ];
BEGIN
    FOREACH v_column_name IN ARRAY v_credential_columns LOOP
        ASSERT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'nexora_internal'
              AND table_name = 'federation_session_credentials'
              AND column_name = v_column_name
        ), format('Missing federation_session_credentials.%s', v_column_name);
    END LOOP;

    FOREACH v_column_name IN ARRAY v_session_columns LOOP
        ASSERT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'nexora_internal'
              AND table_name = 'federation_sessions'
              AND column_name = v_column_name
        ), format('Missing federation_sessions.%s', v_column_name);
    END LOOP;

    ASSERT to_regclass('nexora_internal.idx_fsc_refresh_lock') IS NOT NULL,
        'Missing index nexora_internal.idx_fsc_refresh_lock';
    ASSERT to_regclass('nexora_internal.idx_fs_reval_lock') IS NOT NULL,
        'Missing index nexora_internal.idx_fs_reval_lock';

    FOREACH v_signature IN ARRAY v_engine_rpc_signatures LOOP
        v_function_oid := to_regprocedure(v_signature)::OID;
        ASSERT v_function_oid IS NOT NULL, format('Missing refresh/revalidation RPC %s', v_signature);

        SELECT prosecdef
        INTO v_is_security_definer
        FROM pg_proc
        WHERE oid = v_function_oid;

        ASSERT v_is_security_definer, format('%s must be SECURITY DEFINER', v_signature);
        ASSERT has_function_privilege('service_role', v_function_oid, 'EXECUTE'),
            format('service_role must have EXECUTE on %s', v_signature);
        ASSERT NOT has_function_privilege('anon', v_function_oid, 'EXECUTE'),
            format('anon must not have EXECUTE on %s', v_signature);
        ASSERT NOT has_function_privilege('authenticated', v_function_oid, 'EXECUTE'),
            format('authenticated must not have EXECUTE on %s', v_signature);
    END LOOP;

    v_function_oid := to_regprocedure('public.service_get_federation_session(uuid)')::OID;
    ASSERT v_function_oid IS NOT NULL, 'Missing RPC public.service_get_federation_session(uuid)';

    SELECT pg_get_functiondef(v_function_oid)
    INTO v_function_definition;

    ASSERT position('clock_timestamp()' IN v_function_definition) > 0,
        'service_get_federation_session must use the latest absolute-expiry clock';
    ASSERT position('DELETE FROM nexora_internal.federation_session_credentials' IN v_function_definition) > 0,
        'service_get_federation_session must delete credentials when a session expires';
    ASSERT has_function_privilege('service_role', v_function_oid, 'EXECUTE'),
        'service_role must have EXECUTE on service_get_federation_session';
    ASSERT NOT has_function_privilege('anon', v_function_oid, 'EXECUTE'),
        'anon must not have EXECUTE on service_get_federation_session';
    ASSERT NOT has_function_privilege('authenticated', v_function_oid, 'EXECUTE'),
        'authenticated must not have EXECUTE on service_get_federation_session';

    RAISE NOTICE 'Current NEXORA refresh/revalidation engine and permissions: VERIFIED';
END;
$verify$;
