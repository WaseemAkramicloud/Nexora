# Stage 6B.6 — NEXORA Local Maftah OAuth Adapter & Session Foundation

**Status:** STAGE 6B.6 COMPLETE — NEXORA LOCAL MAFTAH ADAPTER IMPLEMENTED & VERIFIED ✅  
**Scope:** Hosted Maftah Development Provider $\to$ Local NEXORA Only  
**Target Repositories:**  
* Ecosystem Authority: LAM Maftah (`/Users/waseemakram/My Comp Data/My Packages/LAM Maftah Ecosystem`)
* SaaS Product Adapter: NEXORA (`/Users/waseemakram/My Comp Data/My ERPs/Nexora`)

---

## 1. Executive Summary & Deliverables

Stage 6B.6 completes the first runtime integration on the SaaS product side by implementing the **NEXORA Local Maftah OAuth Adapter, Private Security Schema, and Version-2 Session Foundation**.

### Core Invariants Maintained:
1. **Parallel Coexistence:** Legacy SSO routes (`/api/auth/sso`, `/api/auth/callback`) remain 100% operational and untouched.
2. **Dedicated Maftah Routes:** Created dedicated paths `GET /api/auth/maftah` (initiation) and `GET /api/auth/maftah/callback` (callback).
3. **Cryptographic Identity Assertion:** Canonical user identity is asserted strictly via ID Token `(issuer, subject)` validated against asymmetric JWKS (`ES256` / `RS256`), with full PKCE (S256), state, and nonce protection.
4. **Authoritative Access Resolution:** Zero reliance on client-side or ID-token claims for product authorization. NEXORA calls `POST /api/federation/resolve-entry` with `Authorization: Bearer <OAuth Access Token>`.
5. **Private Security Schema:** Created `nexora_internal` schema for identity links, workspace links, federation sessions, encrypted credential vault (AES-256-GCM), and login transactions, accessible strictly via server-only RPCs.
6. **No Direct Database Access:** Zero Maftah database credentials, secrets, or remote SQL queries exist in NEXORA.
7. **No Auto-Provisioning:** Fail-closed resolution (`workspace_not_provisioned`, `membership_not_provisioned`, `membership_not_active`).
8. **Controlled Provisioning Utility:** Created `scripts/provision-maftah-nexora-link.mjs` with `--dry-run` and `--execute`.

---

## 2. NEXORA Internal Database Schema Specification

Migration [`20260903040000_nexora_federation_adapter.sql`](file:///Users/waseemakram/My%20Comp%20Data/My%20ERPs/Nexora/supabase/migrations/20260903040000_nexora_federation_adapter.sql):

### 2.1 Private Tables (`nexora_internal` schema)
* `external_identity_links`: Maps `(issuer, subject)` $\to$ `public.memberships(id)`. Unique constraint: `UNIQUE (issuer, subject)`.
* `federation_workspace_links`: Maps `(issuer, external_organization_id)` $\to$ `public.tenants(id)`. Unique constraint: `UNIQUE (issuer, external_organization_id)`.
* `federation_sessions`: Tracks active sessions (`session_id`, `membership_id`, `tenant_id`, `issuer`, `subject`, `external_organization_id`, `status`, `expires_at`, `last_maftah_revalidated_at`).
* `federation_session_credentials`: Private vault storing AES-256-GCM encrypted `encrypted_access_token` and `encrypted_refresh_token` with initialization vector `iv` and authentication tag `tag`.
* `federation_login_transactions`: Short-lived (10-minute) server-side state for multi-organization workspace selection.

### 2.2 Server-Only RPCs (`public` schema, `service_role` only)
* `public.service_get_federation_identity_link(p_issuer text, p_subject text)`
* `public.service_resolve_federation_workspace(p_issuer text, p_external_org_id uuid)`
* `public.service_create_federation_session(...)`
* `public.service_get_federation_session(p_session_id uuid)`
* `public.service_revoke_federation_session(p_session_id uuid)`
* `public.service_store_federation_credentials(...)`
* `public.service_create_login_transaction(...)`
* `public.service_get_login_transaction(p_transaction_id uuid)`
* `public.service_consume_login_transaction(p_transaction_id uuid)`

---

## 3. Session Versioning Architecture

The `nexora_session` HTTP-only cookie supports dual payloads:
* **Version 1 (Legacy):** `{ v: 1, lamCustomerId, lamCompanyId, tenantId, membershipId, ... }`
* **Version 2 (Maftah Federation):** `{ v: 2, sid: "<federation_session_uuid>" }`
  - Cookie contains **ZERO** access tokens, refresh tokens, ID tokens, client secrets, or authorization evidence.
  - Server-side `getCurrentSession()` resolves active session, tenant, and membership from NEXORA PostgreSQL via `service_get_federation_session`.

---

## 4. Multi-Organization Workspace Selector

For users entitled to multiple Maftah organizations:
1. Maftah returns `organization_selection_required` with eligible organizations.
2. Callback sets short-lived cookie `nexora_maftah_tx` and redirects to `/select-workspace`.
3. NEXORA queries live `/resolve-entry` to list candidate organizations.
4. User selects organization $\to$ Server Action calls Maftah with `requested_org_id` $\to$ Authoritative 7-point validation $\to$ Session created.

---

## 5. Quality Gate Totals

| Repository | Test / Quality Gate | Result |
| :--- | :--- | :--- |
| **NEXORA** | `npm test` (35 unit & integration tests) | **35 / 35 PASS (100%)** ✅ |
| **NEXORA** | `npx tsc --noEmit` (TypeScript Typecheck) | **PASS (0 errors)** ✅ |
| **NEXORA** | `npm run lint` (ESLint) | **PASS (0 errors)** ✅ |
| **NEXORA** | `npm run build` (Next.js 14 Production Build) | **PASS (All 42 routes compiled)** ✅ |
| **Maftah** | `npm run test:federation` (77 unit tests) | **77 / 77 PASS (100%)** ✅ |
