/**
 * NEXORA Auth & Federation Operational Observability Engine (Stage 6C.1)
 *
 * Security & Reliability Guarantees:
 * 1. Strict Metadata Allowlist: structurally discards any non-allowlisted or sensitive fields.
 * 2. Never logs credentials: zero access tokens, refresh tokens, ID tokens, client secrets,
 *    vault keys, PKCE verifiers, nonces, cookies, or passwords.
 * 3. No ip_address collection or free-form unbounded reason strings in DB events.
 * 4. Telemetry failure isolation: wrapped in strict try/catch; telemetry failure NEVER fails auth.
 * 5. Structured server platform logging ([AUTH_OPERATIONAL_EVENT]) + service-role DB persistence.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin"

export type AuthEventType =
  | "maftah_login_started"
  | "maftah_callback_received"
  | "maftah_token_exchange_success"
  | "maftah_id_token_verified"
  | "maftah_resolver_call_started"
  | "maftah_resolver_http_result"
  | "maftah_resolver_payload_classified"
  | "maftah_selection_required_branch_entered"
  | "maftah_authorized_branch_entered"
  | "maftah_unexpected_status_branch"
  | "maftah_resolver_failure_branch"
  | "maftah_callback_success"
  | "maftah_callback_failed"
  | "maftah_selection_required"
  | "maftah_workspace_selected"
  | "maftah_session_created"
  | "maftah_revalidation_denied"
  | "maftah_refresh_success"
  | "maftah_refresh_failed"
  | "maftah_logout"
  | "legacy_login_started"
  | "legacy_login_success"
  | "legacy_login_failed"

export type AuthProviderType = "maftah" | "legacy_sso" | "dev_auth"
export type AuthOutcomeType = "success" | "failure" | "pending" | "info"

export interface SafeAuthMetadata {
  latency_ms?: number
  credential_version?: number
  revalidation_type?: "periodic" | "forced"
  flow?: "pilot" | "direct"
}

export interface AuthOperationalEventInput {
  eventType: AuthEventType
  provider: AuthProviderType
  outcome: AuthOutcomeType
  safeErrorCode?: string | null
  environment?: string
  externalOrgId?: string | null
  tenantId?: string | null
  sessionId?: string | null
  subject?: string | null
  correlationId?: string | null
  metadata?: SafeAuthMetadata
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sanitizeUuid(val?: string | null): string | null {
  if (!val || typeof val !== "string") return null
  const trimmed = val.trim()
  return UUID_REGEX.test(trimmed) ? trimmed : null
}

function sanitizeErrorCode(val?: string | null): string | null {
  if (!val || typeof val !== "string") return null
  // Only allow alphanumeric and underscore characters for safe error codes
  const cleaned = val.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)
  return cleaned.length > 0 ? cleaned : null
}

function filterSafeMetadata(meta?: SafeAuthMetadata): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {}
  const safe: Record<string, unknown> = {}

  if (typeof meta.latency_ms === "number" && Number.isFinite(meta.latency_ms) && meta.latency_ms >= 0) {
    safe.latency_ms = Math.round(meta.latency_ms)
  }

  if (typeof meta.credential_version === "number" && Number.isInteger(meta.credential_version) && meta.credential_version > 0) {
    safe.credential_version = meta.credential_version
  }

  if (meta.revalidation_type === "periodic" || meta.revalidation_type === "forced") {
    safe.revalidation_type = meta.revalidation_type
  }

  if (meta.flow === "pilot" || meta.flow === "direct") {
    safe.flow = meta.flow
  }

  return safe
}

/**
 * Log an operational authentication event with strict allowlist filtering.
 * Guaranteed best-effort: failure NEVER throws or interrupts caller.
 */
export async function logAuthOperationalEvent(input: AuthOperationalEventInput): Promise<string | null> {
  try {
    const environment = input.environment || (process.env.NODE_ENV === "production" ? "production" : "development")
    const safeErrorCode = sanitizeErrorCode(input.safeErrorCode)
    const externalOrgId = sanitizeUuid(input.externalOrgId)
    const tenantId = sanitizeUuid(input.tenantId)
    const sessionId = sanitizeUuid(input.sessionId)
    const subject = sanitizeUuid(input.subject)
    const correlationId = input.correlationId ? input.correlationId.trim().slice(0, 64) : null
    const cleanMetadata = filterSafeMetadata(input.metadata)

    const payload = {
      event_type: input.eventType,
      provider: input.provider,
      outcome: input.outcome,
      safe_error_code: safeErrorCode,
      environment,
      external_org_id: externalOrgId,
      tenant_id: tenantId,
      session_id: sessionId,
      subject,
      correlation_id: correlationId,
      metadata: cleanMetadata,
      timestamp: new Date().toISOString()
    }

    // Structured platform log
    console.log("[AUTH_OPERATIONAL_EVENT]", JSON.stringify(payload))

    // Best-effort database insertion via service RPC
    const adminDb = getSupabaseAdmin()
    const { data: eventId, error } = await adminDb.rpc("service_log_auth_operational_event", {
      p_event_type: payload.event_type,
      p_provider: payload.provider,
      p_outcome: payload.outcome,
      p_safe_error_code: payload.safe_error_code,
      p_environment: payload.environment,
      p_external_org_id: payload.external_org_id,
      p_tenant_id: payload.tenant_id,
      p_session_id: payload.session_id,
      p_subject: payload.subject,
      p_correlation_id: payload.correlation_id,
      p_metadata: payload.metadata
    })

    if (error) {
      // Safe error trace (does not expose caller data)
      console.warn("[AUTH_OBSERVABILITY_WARN] Database operational event RPC returned error:", error.message)
      return null
    }

    return eventId || null
  } catch (err: any) {
    // Fail-safe: NEVER bubble up observability errors to authentication flows
    console.warn("[AUTH_OBSERVABILITY_WARN] Telemetry logging encountered non-fatal exception:", err?.message || "unknown")
    return null
  }
}
