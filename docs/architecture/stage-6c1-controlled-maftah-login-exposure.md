# Stage 6C.1 — Controlled Maftah Login Exposure, Operational Observability & Rollout Foundation

## 1. Executive Summary & Baseline Traceability

Stage 6C.1 completed the production-proven Maftah → NEXORA federation rollout for the authorized pilot topology. The normal user-facing NEXORA authentication path now presents Maftah only; the legacy LAM ID implementation remains temporarily in source as an unlinked rollback fallback.

### Verified Git Commit Traceability:
- **NEXORA Pre-6C Baseline**: `c043f5b5a69f31ba50600c757cec6f690596077d` (`feat(federation): implement Nexora parallel Maftah OAuth adapter, multi-org identity resolution, AES-GCM vault, and session continuity`)
- **NEXORA Stage 6C.1 initial exposure HEAD**: `05f72fe907eb6bfecf7773ea455a109968aa23e4`
- **LAM Maftah Pre-6C Baseline**: `7aa7226327de867fcc0fd8935fbd60b3888ab180` (`docs(stage-6b): freeze Stage 6B reference architecture baseline`)
- **LAM Maftah Stage 6C.1 HEAD**: `7a45d1df3684ca347fcdd52efbe3a1e0b57cf681` (Pushed to `origin/main`)

---

## 2. Server-Side Exposure Mode State Machine

```
   ┌─────────────────────────────────────────────────────────────┐
   │         NEXORA_MAFTAH_LOGIN_EXPOSURE Env Variable           │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
          ┌───────────────────────┼────────────────────────┐
          ▼                       ▼                        ▼
     ['hidden' / invalid]      ['pilot']               ['public']
          │                       │                        │
  ┌───────┴───────────────┐ ┌─────┴────────────────┐ ┌─────┴────────────────┐
  │ State 0: Dark Hidden  │ │ State 1: Pilot Gate  │ │ State 2: General Avail │
  ├───────────────────────┤ ├──────────────────────┤ ├──────────────────────┤
  │ /login/maftah -> 404  │ │ /login/maftah -> 200 │ │ /login/maftah -> 200 │
  │ /api/auth/maftah->404 │ │ /api/auth/maftah->302│ │ /api/auth/maftah->302│
  │ New login -> blocked  │ │ Normal UI -> Maftah  │ │ Normal UI -> Maftah  │
  │ Callback -> Processed │ │ Callback -> Processed│ │ Callback -> Processed│
  └───────────────────────┘ └──────────────────────┘ └──────────────────────┘
```

### Exposure Mode Helper Semantics (`lib/auth/config.ts`)
```typescript
export function getNexoraMaftahExposureMode(): 'hidden' | 'pilot' | 'public' {
  const raw = process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE?.trim().toLowerCase();
  if (raw === 'pilot') return 'pilot';
  if (raw === 'public') return 'public';
  return 'hidden'; // Fail-closed default
}
```

---

## 3. User-Facing Route Specification (`/login/maftah`)

### Route Characteristics:
- **Path**: `/login/maftah` (Server-rendered dynamic route).
- **Behavior**:
  - In `hidden` mode: Server returns `notFound()` (HTTP 404).
  - In `pilot` / `public` mode: Renders the dedicated Maftah login interface.
- **Approved Visual Direction**:
  - Light, restrained, clean, professional, understated style (`bg-slate-50`, clean white card `bg-white border border-slate-200 shadow-sm`, `text-slate-900`, `bg-indigo-600` primary button).
  - Primary CTA: "Continue with LAM Maftah" linking directly to `/api/auth/maftah`.
  - No visible legacy LAM ID or standard-login fallback link.
  - Neutral trust footer: "Secured by LAM Maftah".
  - Full multilingual support: English (`en`), French (`fr`), and Arabic (`ar` with `dir="rtl"`).

---

## 4. Operational Observability & Safe Telemetry

### 4.1 Schema Isolation & Security Boundary
- **Private Schema**: `nexora_internal.auth_operational_events`
- **Hosted Migration**: `20260905000000_nexora_auth_operational_events.sql` was manually applied through the Supabase Dashboard SQL Editor on 5 September 2026.
- **RPC**: `public.service_log_auth_operational_event` (SECURITY DEFINER, `SET search_path = ''`, granted exclusively to `service_role`).
- **PostgREST OpenAPI**: Direct table access strictly revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`.

### 4.2 Strict Metadata Allowlist (`lib/auth/observability.ts` & DB RPC)
- Allowed & Reconstructed keys: `latency_ms` (1-9 digits INT), `credential_version` (1-9 digits INT), `revalidation_type` (`'none'|'cached'|'full'`), `flow` (max 64 chars).
- Prohibited & Discarded: All `tokens`, `secrets`, `passwords`, `cookies`, `code_verifiers`, `nonces`, `ip_address`, and free-form stack traces.
- Telemetry failures are strictly non-fatal and safely isolated from the authentication execution flow.

---

## 5. Hosting & Operational Mechanics

### Environment Propagation:
In Vercel hosting, updating `NEXORA_MAFTAH_LOGIN_EXPOSURE` requires a **deployment rollout / redeploy** to propagate the new value across Serverless Function Lambdas.

---

## 6. Production Closure Record — 17 September 2026

Human production verification proved the complete Stage 6C.1 path:

- NEXORA initiated Maftah OAuth and completed the callback using the native Supabase OAuth access-token audience `authenticated`. The legacy federation audience remains accepted only as a transitional compatibility audience.
- `organization_selection_required` produced an encrypted, one-time login transaction and the `/select-workspace` selector.
- Both authorized Maftah organizations appeared and resolved to the two existing NEXORA workspaces.
- Selecting each workspace created the correct tenant-scoped NEXORA session and preserved its distinct local NEXORA product role.
- NEXORA Sign out revoked the local federation session, removed stored federation credentials, cleared the product cookie, and returned the browser to `/login/maftah` without terminating the central Maftah identity session.
- Legacy LAM ID navigation is removed from the normal Maftah user flow. The legacy implementation is retained temporarily as unlinked rollback code.

### Production schema reconciliation record

- `20260903040000_nexora_federation_adapter.sql` was manually applied to hosted NEXORA production after its corrupted PostgreSQL `$$` delimiters were repaired.
- `20260917000000_reconcile_nexora_refresh_and_revalidation_engine.sql` reconciled the later refresh/revalidation columns, indexes, RPCs, permissions, and latest `service_get_federation_session` definition.
- The hosted production schema was verified correct after reconciliation.
- Supabase migration-history reconciliation remains a separate controlled maintenance item. No migration ledger entry has been fabricated by this closure work.

### Diagnostic disposition

- `KEEP_OPERATIONAL`: allowlisted `AUTH_OPERATIONAL_EVENT` platform events, private `auth_operational_events` persistence, and non-sensitive telemetry-failure warnings.
- `REMOVE_TEMPORARY`: incident-only `NEXORA_MAFTAH_DIAG` resolver/callback markers and legacy OIDC nonce, PKCE, callback, and token-verification console traces.
- `REDUCE_VERBOSITY`: customer login copy no longer exposes pilot stages, product IDs, protocol internals, session-boundary internals, database identifiers, or production-visible development controls.

### Stage state

- **Stage 6C.1: COMPLETE**
- **Stage 6C.2: NOT STARTED**
