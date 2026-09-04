# Stage 6B.7B — Canonical OAuth Client ↔ Session Binding Correction

## Status
- **Phase**: Stage 6B.7B — Canonical OAuth Client Binding Correction (Complete & Verified ✅)
- **Scope**: Single Canonical `oc.client_id = p_client_id` Comparison, Strict `INNER JOIN auth.oauth_clients`, Removal of Permissive OR Predicates, NULL-Safe Expiry.
- **Production Guardrails**:
  - ❌ ZERO production deployments
  - ❌ ZERO hosted NEXORA Supabase mutations
  - ❌ ZERO production OAuth client registrations
  - ❌ ZERO legacy SSO modifications

---

## 1. Architectural Correction & Tightening

### 1.1 Problem Addressed
In Stage 6B.7 / 6B.7A, the SQL function `maftah_internal.validate_oauth_session` included an overly permissive OR condition:
```sql
-- REPLACED / REMOVED:
AND (
  oc.client_id = p_client_id
  OR oc.id::text = p_client_id
  OR s.oauth_client_id::text = p_client_id
)
```
Accepting three separate database identifiers created ambiguity across the identifier namespace and allowed internal primary keys (`oc.id::text`) to be accepted interchangeably as public credentials.

### 1.2 Canonical Provider Model
In Supabase Auth OAuth Server:
- `auth.sessions.oauth_client_id` is a UUID foreign key referencing `auth.oauth_clients.id`.
- The public OAuth 2.0 client identifier presented in the verified JWT `payload.client_id` corresponds to `auth.oauth_clients.client_id`.
- Therefore, the canonical relational mapping requires:
  1. Strict **`INNER JOIN`**: `JOIN auth.oauth_clients oc ON oc.id = s.oauth_client_id` (an OAuth federation session must reference a valid provider client row).
  2. Exact **Canonical Match**: `oc.client_id = p_client_id` (single public client identifier check).
  3. **User Match**: `s.user_id = p_user_id`.
  4. **NULL-Safe Expiry**: `(s.not_after IS NULL OR s.not_after > clock_timestamp())`.

### 1.3 Final SQL Predicate (Migration `20260903041000_tighten_oauth_session_validation.sql`)
```sql
SELECT EXISTS (
  SELECT 1
  FROM auth.sessions s
  JOIN auth.oauth_clients oc ON oc.id = s.oauth_client_id
  WHERE s.id = p_session_id
    AND s.user_id = p_user_id
    AND oc.client_id = p_client_id
    AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
);
```

---

## 2. Test Verification Matrix (11 / 11 Unit Tests Passing)

1. **Positive Match**: Correct session + correct user + correct canonical public `client_id` $\to$ `true`
2. **Internal ID Negative Test**: Passing internal DB UUID (`oc.id`) when `oc.client_id` is public identifier $\to$ `false` (fails closed)
3. **Wrong Public Client**: Token with wrong public `client_id` $\to$ `false`
4. **Different Client Session**: Session pointing to a different client PK $\to$ `false`
5. **Orphaned Session**: Missing `auth.oauth_clients` row (INNER JOIN fails) $\to$ `false`
6. **Missing Session**: Non-existent `session_id` $\to$ `false`
7. **Wrong User**: Session belonging to different `user_id` $\to$ `false`
8. **Expired Session**: `not_after` in past $\to$ `false`
9. **NULL `not_after`**: `not_after = NULL` (open-ended active session) $\to$ `true`
10. **Future `not_after`**: `not_after` in future $\to$ `true`
11. **Malformed / Empty Input**: Null or whitespace arguments $\to$ `false` (fail-closed)

---

## 3. Quality Gate Totals

- **Maftah Federation Test Suite**: 91 / 91 Tests Passing ✅ (`npm run test:federation`)
- **NEXORA SaaS Test Suite**: 64 / 64 Tests Passing ✅ (`npm test`)
- **Typecheck & Lint**: Clean (0 errors across both repositories) ✅
- **Production Build**: Clean (both Next.js applications build cleanly) ✅
