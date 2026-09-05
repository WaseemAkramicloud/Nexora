# Stage 6C.1 — Controlled Maftah Login Exposure, Operational Observability & Rollout Foundation

## 1. Executive Summary & Baseline Traceability

Stage 6C.1 transitions the Maftah → NEXORA federation from engineering topology verification into a **controlled rollout foundation** with zero disruption to legacy customers.

### Verified Git Commit Traceability:
- **NEXORA Pre-6C Baseline**: `c043f5b5a69f31ba50600c757cec6f690596077d` (`feat(federation): implement Nexora parallel Maftah OAuth adapter, multi-org identity resolution, AES-GCM vault, and session continuity`)
- **NEXORA Stage 6C.1 HEAD**: `05f72fe907eb6bfecf7773ea455a109968aa23e4` (Pushed to `origin/main`)
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
  │ Normal UI -> SSO only │ │ Normal UI -> SSO only│ │ Normal UI -> Dual Btn│
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

## 3. Pilot Route Specification (`/login/maftah`)

### Route Characteristics:
- **Path**: `/login/maftah` (Server-rendered dynamic route).
- **Behavior**:
  - In `hidden` mode: Server returns `notFound()` (HTTP 404).
  - In `pilot` / `public` mode: Renders dedicated Maftah Pilot Login interface.
- **Approved Visual Direction**:
  - Light, restrained, clean, professional, understated style (`bg-slate-50`, clean white card `bg-white border border-slate-200 shadow-sm`, `text-slate-900`, `bg-indigo-600` primary button).
  - Primary CTA: "Continue with LAM Maftah" linking directly to `/api/auth/maftah`.
  - Secondary fallback link: "Return to standard login" linking to `/`.
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
