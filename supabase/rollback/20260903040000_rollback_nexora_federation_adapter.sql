-- ==============================================================================
-- Rollback: 20260903040000_rollback_nexora_federation_adapter.sql
-- Description: Rollback NEXORA Local Maftah OAuth Adapter & Federation Schema
-- Target: NEXORA PostgreSQL (zfancncassjmghxzogbm)
-- ==============================================================================

-- 1. Drop public RPC wrappers
DROP FUNCTION IF EXISTS public.service_consume_login_transaction(UUID);
DROP FUNCTION IF EXISTS public.service_get_login_transaction(UUID);
DROP FUNCTION IF EXISTS public.service_create_login_transaction(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.service_store_federation_credentials(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.service_revoke_federation_session(UUID);
DROP FUNCTION IF EXISTS public.service_get_federation_session(UUID);
DROP FUNCTION IF EXISTS public.service_create_federation_session(UUID, UUID, TEXT, TEXT, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.service_resolve_federation_workspace(TEXT, UUID);
DROP FUNCTION IF EXISTS public.service_get_federation_identity_link(TEXT, TEXT);

-- 2. Drop internal schema and all associated tables/indexes
DROP SCHEMA IF EXISTS nexora_internal CASCADE;
