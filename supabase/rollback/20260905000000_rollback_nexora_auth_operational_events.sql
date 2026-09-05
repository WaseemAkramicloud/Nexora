-- Rollback Script: 20260905000000_rollback_nexora_auth_operational_events.sql
DROP FUNCTION IF EXISTS public.service_log_auth_operational_event(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS nexora_internal.auth_operational_events CASCADE;
