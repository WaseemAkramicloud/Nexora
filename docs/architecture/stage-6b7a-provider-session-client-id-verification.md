# Stage 6B.7A — Final Client ID, Auth.Sessions & Live Continuity Verification

## Status
- **Phase**: Stage 6B.7A — Final Provider Contract Verification (Complete & Verified ✅)
- **Scope**: Actual OAuth `client_id` Enforcement, Exact Hosted `auth.sessions` Validity Semantics, NULL-Safe Expiry Evaluation, and Live Continuity Verification.
- **Production Guardrails**:
  - ❌ ZERO production deployments
  - ❌ ZERO hosted NEXORA Supabase mutations
  - ❌ ZERO production OAuth client registrations
  - ❌ ZERO legacy SSO modifications

---

## 1. Key Verification Findings & Invariants

### 1.1 Actual OAuth Client ID Enforcement (No Hardcoded Labels)
- **Elimination of Hardcoded Label Fallback**: Removed all occurrences of `'lam_client_nexora_dev'` in runtime code.
- **Authoritative Configuration**:
  - Initial ID Token Audience: `expectedAudience = getMaftahOAuthClientId()` (reads `process.env.MAFTAH_OAUTH_CLIENT_ID`).
  - Refreshed Access Token Client ID: `expectedClientId = getMaftahOAuthClientId()` (reads `process.env.MAFTAH_OAUTH_CLIENT_ID`).
  - Server-side runtime strictly requires `MAFTAH_OAUTH_CLIENT_ID` to be configured, ensuring seamless environment switching between Development and Production without code changes.

### 1.2 Exact Hosted `auth.sessions` Schema & Relation
- **Provider Tables**:
  - `auth.sessions`: `id UUID PK`, `user_id UUID`, `oauth_client_id UUID (FK -> auth.oauth_clients.id)`, `not_after TIMESTAMPTZ NULL`, `refreshed_at TIMESTAMP`.
  - `auth.oauth_clients`: `id UUID PK`, `client_id TEXT`, `client_secret TEXT`, `name TEXT`.
- **Validation Predicate in `maftah_internal.validate_oauth_session`**:
  ```sql
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions s
    LEFT JOIN auth.oauth_clients oc ON oc.id = s.oauth_client_id
    WHERE s.id = p_session_id
      AND s.user_id = p_user_id
      AND (
        oc.client_id = p_client_id
        OR oc.id::text = p_client_id
        OR s.oauth_client_id::text = p_client_id
      )
      AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
  );
  ```
- **NULL-Safe `not_after` Semantics**: Supabase Auth sessions frequently have `not_after = NULL` for active sessions; `(s.not_after IS NULL OR s.not_after > clock_timestamp())` ensures NULL is treated as active and valid.
- **Authoritative Session Existence**: Cryptographically valid JWTs whose session row is missing (e.g. user logged out or session revoked) fail closed with `401 Unauthorized` (`oauth_session_invalid`).

### 1.3 Provider Internal Schema Coupling Risk
- `auth.sessions` and `auth.oauth_clients` are internal Supabase GoTrue tables (Beta feature).
- Access is strictly encapsulated within `maftah_internal` functions owned by `postgres` (`SECURITY DEFINER`).
- Zero direct table access granted to `anon`, `authenticated`, or NEXORA. NEXORA continues to interact solely via `POST /api/federation/resolve-entry`.

### 1.4 Temporal Entitlement in 7-Point Business Access Rule
- The frozen 7-point business rule strictly retains the date-effective temporal check:
  `ope.valid_from <= now() AND (ope.valid_until IS NULL OR ope.valid_until > now())`
- Verified: Future entitlements and expired entitlements both fail closed.

---

## 2. Quality Gate Totals

| Metric / Gate | Maftah Ecosystem | NEXORA SaaS |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | 87 / 87 Passed ✅ | 64 / 64 Passed ✅ |
| **TypeScript Typecheck** | 0 errors ✅ | 0 errors ✅ |
| **ESLint / Next Lint** | 0 errors ✅ | 0 errors ✅ |
| **Production Build** | Clean Build ✅ | Clean Build ✅ |
