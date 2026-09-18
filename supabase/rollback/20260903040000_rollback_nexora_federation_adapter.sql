-- ==============================================================================
-- Rollback: Current NEXORA Federation Adapter
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
--
-- DESTRUCTIVE: do not execute as a verification step. This is the terminal
-- federation teardown and uses the current function signatures. The dedicated
-- newer rollback files should normally be applied first.
-- ==============================================================================

-- Refresh/revalidation RPCs introduced after the base adapter.
DROP FUNCTION IF EXISTS public.service_cleanup_expired_sessions();
DROP FUNCTION IF EXISTS public.service_abort_maftah_revalidation(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_record_maftah_revalidation(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_begin_maftah_revalidation(UUID, INT);
DROP FUNCTION IF EXISTS public.service_abort_federation_refresh(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_complete_federation_refresh(UUID, UUID, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.service_begin_federation_refresh(UUID, INT);

-- Base federation RPCs, including the three login-transaction RPCs.
DROP FUNCTION IF EXISTS public.service_consume_login_transaction(UUID);
DROP FUNCTION IF EXISTS public.service_get_login_transaction(UUID);
DROP FUNCTION IF EXISTS public.service_create_login_transaction(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.service_provision_federation_link(UUID, UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.service_get_federation_credentials(UUID);
DROP FUNCTION IF EXISTS public.service_store_federation_credentials(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.service_revoke_federation_session(UUID);
DROP FUNCTION IF EXISTS public.service_get_federation_session(UUID);
DROP FUNCTION IF EXISTS public.service_create_federation_session(UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.service_resolve_federation_workspace(TEXT, UUID);
DROP FUNCTION IF EXISTS public.service_get_federation_identity_link(TEXT, TEXT, UUID);

-- Operational telemetry references a table inside nexora_internal. Remove its
-- wrapper before the private schema is removed if its dedicated rollback has
-- not already run.
DROP FUNCTION IF EXISTS public.service_log_auth_operational_event(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB);

-- Removes the six current federation tables and any remaining private objects.
DROP SCHEMA IF EXISTS nexora_internal CASCADE;
