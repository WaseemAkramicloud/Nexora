# Stage 6B.6A — Multi-Org Identity Cardinality, Credential Vault & Session-Boundary Correction

**Status:** STAGE 6B.6A COMPLETE — MULTI-ORG IDENTITY & VAULT CORRECTIONS FULLY VERIFIED ✅  
**Scope:** NEXORA Local Adapter Core Refinements  
**Target:** NEXORA (`/Users/waseemakram/My Comp Data/My ERPs/Nexora`) & Maftah Ecosystem Architecture

---

## 1. Executive Summary of Corrections

Stage 6B.6A resolves four structural requirements in the NEXORA Local Federation Adapter:

1. **Normalized Multi-Org External Identity Model:**
   - Decomposed single-table link into `external_identities` (Person) and `external_identity_memberships` (Tenant Link).
   - Allows a single external Maftah subject (`auth.users.id`) to hold distinct memberships across multiple NEXORA tenants.
2. **Bidirectional Workspace Mapping Uniqueness:**
   - Enforced 1:1 active mapping between Maftah organization UUID and NEXORA tenant UUID via partial unique indexes:
     - `UNIQUE (issuer, external_organization_id) WHERE status = 'active'`
     - `UNIQUE (issuer, tenant_id) WHERE status = 'active'`
3. **Structured AES-256-GCM Credential Vault with AAD Context Binding:**
   - Encrypts unified JSON credential payload (`access_token`, `refresh_token`, `access_token_expires_at`, `credential_version`) using a fresh 12-byte random IV.
   - Binds ciphertext to its database record via Additional Authenticated Data (`session_id:version:purpose`), preventing cross-record decryption.
   - Enforces strict 64-hex character validation on `NEXORA_CREDENTIAL_VAULT_KEY`.
4. **Bounded Development Session Lifetime:**
   - Capped Maftah v2 development session to **60 minutes** (`expires_at` and cookie `maxAge = 3600`).
   - Server-side `service_get_federation_session` enforces active status and date-effective expiration. Legacy v1 7-day lifetime remains untouched.
5. **Strict Privilege Isolation:**
   - Zero direct table access granted to `service_role` on `nexora_internal.*`. All database operations are executed via `SECURITY DEFINER` RPC wrappers in `public`.

---

## 2. Final Normalized Database Schema

Migration [`20260903040000_nexora_federation_adapter.sql`](file:///Users/waseemakram/My%20Comp%20Data/My%20ERPs/Nexora/supabase/migrations/20260903040000_nexora_federation_adapter.sql):

### 2.1 `nexora_internal.external_identities`
```sql
CREATE TABLE nexora_internal.external_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'maftah_oauth',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT external_identities_issuer_subject_key UNIQUE (issuer, subject)
);
```

### 2.2 `nexora_internal.external_identity_memberships`
```sql
CREATE TABLE nexora_internal.external_identity_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_identity_id UUID NOT NULL REFERENCES nexora_internal.external_identities(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ext_id_membership_unique UNIQUE (external_identity_id, membership_id)
);
```

### 2.3 `nexora_internal.federation_workspace_links`
```sql
CREATE TABLE nexora_internal.federation_workspace_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    issuer TEXT NOT NULL,
    external_organization_id UUID NOT NULL,
    provider_type TEXT NOT NULL DEFAULT 'maftah_oauth',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_unique_active_fwl_external_org ON nexora_internal.federation_workspace_links (issuer, external_organization_id) WHERE status = 'active';
CREATE UNIQUE INDEX idx_unique_active_fwl_tenant ON nexora_internal.federation_workspace_links (issuer, tenant_id) WHERE status = 'active';
```

---

## 3. Quality Gate Summary

| Suite | Component | Tests | Status |
| :--- | :--- | :--- | :--- |
| **NEXORA Legacy Auth** | OIDC, Session, RLS, Roles, Inter-Service | 20 | **PASS (20/20)** ✅ |
| **NEXORA Stage 6B.6A** | Multi-Org Identity, AES-GCM Vault, AAD Context, ID Token, Session Bounding | 20 | **PASS (20/20)** ✅ |
| **NEXORA Total Tests** | Full Test Suite (`npm test`) | **40** | **100% PASS (40/40)** ✅ |
| **NEXORA TypeScript** | `npx tsc --noEmit` | — | **PASS (0 errors)** ✅ |
| **NEXORA ESLint** | `npm run lint` | — | **PASS (0 errors)** ✅ |
| **NEXORA Build** | `npm run build` | — | **PASS (42 routes compiled)** ✅ |
| **Maftah Federation** | `npm run test:federation` | 77 | **PASS (77/77)** ✅ |
