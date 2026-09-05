-- Verification Script: 20260905000000_verify_nexora_auth_operational_events.sql
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'nexora_internal' AND table_name = 'auth_operational_events'
    ), 'Table nexora_internal.auth_operational_events does not exist';

    ASSERT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_schema = 'public' AND routine_name = 'service_log_auth_operational_event'
    ), 'RPC public.service_log_auth_operational_event does not exist';

    RAISE NOTICE 'Verification passed: auth_operational_events table and RPC exist.';
END $$;
