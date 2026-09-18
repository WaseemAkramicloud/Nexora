-- ==============================================================================
-- Verification: Current NEXORA Federation Adapter Base Schema
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
-- Read-only assertions only. This file does not create or mutate data.
-- ==============================================================================

DO $verify$
DECLARE
    v_table_name TEXT;
    v_signature TEXT;
    v_function_oid OID;
    v_is_security_definer BOOLEAN;
    v_tables CONSTANT TEXT[] := ARRAY[
        'external_identities',
        'external_identity_memberships',
        'federation_workspace_links',
        'federation_sessions',
        'federation_session_credentials',
        'federation_login_transactions'
    ];
    v_base_rpc_signatures CONSTANT TEXT[] := ARRAY[
        'public.service_get_federation_identity_link(text,text,uuid)',
        'public.service_resolve_federation_workspace(text,uuid)',
        'public.service_create_federation_session(uuid,uuid,text,text,uuid,timestamp with time zone)',
        'public.service_get_federation_session(uuid)',
        'public.service_revoke_federation_session(uuid)',
        'public.service_store_federation_credentials(uuid,text,text,text)',
        'public.service_get_federation_credentials(uuid)',
        'public.service_create_login_transaction(text,text,text,text,text)',
        'public.service_get_login_transaction(uuid)',
        'public.service_consume_login_transaction(uuid)',
        'public.service_provision_federation_link(uuid,uuid,text,uuid,text)'
    ];
BEGIN
    ASSERT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = 'nexora_internal'
    ), 'Schema nexora_internal must exist';

    FOREACH v_table_name IN ARRAY v_tables LOOP
        ASSERT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'nexora_internal'
              AND table_name = v_table_name
        ), format('Missing table nexora_internal.%s', v_table_name);

        ASSERT NOT has_table_privilege('anon', format('nexora_internal.%I', v_table_name), 'SELECT'),
            format('anon must not read nexora_internal.%s', v_table_name);
        ASSERT NOT has_table_privilege('authenticated', format('nexora_internal.%I', v_table_name), 'SELECT'),
            format('authenticated must not read nexora_internal.%s', v_table_name);
    END LOOP;

    ASSERT NOT has_schema_privilege('anon', 'nexora_internal', 'USAGE'),
        'anon must not have USAGE on nexora_internal';
    ASSERT NOT has_schema_privilege('authenticated', 'nexora_internal', 'USAGE'),
        'authenticated must not have USAGE on nexora_internal';
    ASSERT has_schema_privilege('service_role', 'nexora_internal', 'USAGE'),
        'service_role must have USAGE on nexora_internal';

    FOREACH v_signature IN ARRAY v_base_rpc_signatures LOOP
        v_function_oid := to_regprocedure(v_signature)::OID;
        ASSERT v_function_oid IS NOT NULL, format('Missing base federation RPC %s', v_signature);

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

    RAISE NOTICE 'Current NEXORA federation adapter base schema and permissions: VERIFIED';
END;
$verify$;
