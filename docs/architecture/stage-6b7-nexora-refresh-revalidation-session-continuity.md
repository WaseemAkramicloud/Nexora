# Stage 6B.7 — OAuth Session Validity, Refresh Rotation, Live Revalidation & 8-Hour Session Continuity

## Status
- **Phase**: Stage 6B.7 — Development Integration (Completed & Verified ✅)
- **Scope**: Provider-Session Validity Enforcement, OAuth Refresh-Token Rotation Engine, Live Authorization Revalidation (30-Minute Interval + Sensitive Actions), Bounded 8-Hour Absolute NEXORA Sessions, and Fail-Closed Revocation Propagation.
- **Environment**: Hosted Maftah Development Provider + Local NEXORA Adapter.
- **Production Guardrails**:
  - ❌ ZERO production deployments
  - ❌ ZERO hosted NEXORA Supabase migrations
  - ❌ ZERO production OAuth client registrations
  - ❌ ZERO legacy SSO modifications (Legacy v1 7-day SSO remains operational in parallel)

---

## 1. Architectural Architecture & Invariants

### 1.1 Maftah OAuth Session Validity Hardening (Part A)
- **Token Claims**: Supabase OAuth Access Tokens issued to registered ecosystem clients contain:
  - `session_id`: UUID matching `auth.sessions.id`
  - `sub`: UUID matching `auth.sessions.user_id`
  - `client_id`: Text matching registered client ID
- **Internal RPC Validation**: `maftah_internal.validate_oauth_session` executes as `SECURITY DEFINER` within the `auth` schema:
  - Confirms active session existence in `auth.sessions`
  - Validates `user_id = sub` AND `oauth_client_id = client_id`
  - Validates `not_after IS NULL OR not_after > now()`
- **Fail-Closed Enforcement**: If no live session exists or if the session was revoked:
  - Returns `401 Unauthorized` with `{ "status": "unauthorized", "error": "oauth_session_invalid" }` and `Cache-Control: no-store`.

### 1.2 Final NEXORA v2 Session Lifetime (8-Hour Hard Boundary) (Part B)
- **Absolute Lifetime**: `federation_sessions.expires_at = created_at + 8 hours`.
- **Cookie MaxAge**: `nexora_session` cookie `maxAge = 28,800 seconds` (8 hours).
- **Strict Non-Sliding Behavior**:
  - Token refreshes do **NOT** modify `expires_at`.
  - Revalidation calls do **NOT** modify `expires_at`.
  - Normal browser activity does **NOT** modify `expires_at`.
  - At the 8-hour boundary, credentials are deleted transactionally from the vault and the user must re-authenticate.

### 1.3 Concurrency-Safe Refresh Lease & Rotation Engine (Part C)
- **Lease Coordination**: `refresh_lock_id UUID` and `refresh_lock_expires_at TIMESTAMPTZ` (~30s TTL).
- **Compare-And-Swap (CAS)**: `credential_version` incrementation ensures stale processes cannot overwrite newer tokens.
- **Network Call Isolation**: Token endpoint POST (`grant_type=refresh_token`, `client_secret_basic`) is executed outside PostgreSQL transactions.
- **Pre-Storage Verification**: Refreshed access tokens must pass full cryptographic signature (ES256/RS256 via JWKS), `iss`, `aud`, `client_id`, `sub`, and `session_id` checks before being persisted to the vault.
- **Rotated Token Handling**: Always persists newly issued refresh tokens; safely retains existing refresh token if provider omits it.
- **Failure Classification**:
  - *Definitive* (400/401 `invalid_grant`): Revokes local federation session, deletes vault credentials.
  - *Transient* (5xx/network timeout): Aborts refresh lease, retains session record, denies stale request without destroying session.

### 1.4 Live Maftah Authorization Revalidation (Part D)
- **Standard Freshness Interval**: 30 minutes (`last_maftah_revalidated_at`).
- **Request-Driven**: No idle polling or cron traffic. Revalidation occurs on active user requests when $\ge 30$ minutes stale.
- **Exact Established Organization**: Always requests `requested_org_id = external_organization_id`. Fails closed if not authorized for exact matching organization.
- **Stampede Lock**: Short-lived `revalidation_lock_id` coordinates concurrent requests when crossing the 30-minute window.
- **Proactive Refresh**: Proactively refreshes OAuth token if access token expires within 5 minutes before calling `/resolve-entry`.
- **401 Recovery**: Triggers 1 controlled token refresh and retries `/resolve-entry` once before failing closed.

### 1.5 Sensitive Action Revalidation (Part E)
- All classified sensitive operations enforce live, non-cached Maftah revalidation (`getCurrentSession({ forceRevalidate: true })`):
  - Team invitations (`POST /api/team/invite`)
  - Ownership reassignment (`POST /api/team/reassign`)
  - Campaign creation / launch (`POST /api/campaigns`)
  - Outreach sequence dispatch (`POST /api/outreach/dispatch`)
  - GDPR export / erasure (`POST /api/compliance/gdpr`)
  - Platform administrator actions (`GET /api/admin/platform`)

---

## 2. Test Verification Summary

| Component / Test Suite | Tests Passing | Status |
| :--- | :--- | :--- |
| **Maftah Federation API & JWT Verifier** | 87 / 87 | Passed ✅ |
| **NEXORA Refresh Rotation & Revalidation Engine** | 64 / 64 | Passed ✅ |
| **NEXORA Typecheck & Lint** | Clean (0 errors) | Passed ✅ |
| **NEXORA Production Build** | Clean (0 errors) | Passed ✅ |
| **Maftah Typecheck & Lint** | Clean (0 errors) | Passed ✅ |
| **Maftah Production Build** | Clean (0 errors) | Passed ✅ |
