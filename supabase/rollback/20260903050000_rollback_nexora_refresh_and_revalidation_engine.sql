-- ==============================================================================
-- Rollback Migration: 20260903050000_nexora_refresh_and_revalidation_engine.rollback.sql
-- Description: Revert Stage 6B.7 schema extensions and RPCs
-- ==============================================================================

DROP FUNCTION IF EXISTS public.service_cleanup_expired_sessions();
DROP FUNCTION IF EXISTS public.service_abort_maftah_revalidation(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_record_maftah_revalidation(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_begin_maftah_revalidation(UUID, INT);
DROP FUNCTION IF EXISTS public.service_abort_federation_refresh(UUID, UUID);
DROP FUNCTION IF EXISTS public.service_complete_federation_refresh(UUID, UUID, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.service_begin_federation_refresh(UUID, INT);

DROP INDEX IF EXISTS nexora_internal.idx_fs_reval_lock;
ALTER TABLE nexora_internal.federation_sessions
    DROP COLUMN IF EXISTS revalidation_lock_id,
    DROP COLUMN IF EXISTS revalidation_lock_expires_at;

DROP INDEX IF EXISTS nexora_internal.idx_fsc_refresh_lock;
ALTER TABLE nexora_internal.federation_session_credentials
    DROP COLUMN IF EXISTS refresh_lock_id,
    DROP COLUMN IF EXISTS refresh_lock_expires_at,
    DROP COLUMN IF EXISTS last_refresh_at,
    DROP COLUMN IF EXISTS access_token_expires_at;
