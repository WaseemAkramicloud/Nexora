# Stage 6C.1 — Controlled Maftah Login Exposure, Operational Observability & Rollout Foundation

## 1. Executive Summary & Stage Scope

Stage 6C.1 transitions the Maftah → NEXORA federation from verification/engineering topology into a **controlled rollout foundation** with zero disruption to legacy customers.

### Architectural Invariants:
1. **Federation Freeze**: The underlying OIDC/OAuth PKCE federation, token verification, session lifecycle, 7-point access matrix, and credential vault remain 100% frozen.
2. **Deterministic Exposure State**: Entry into Maftah login is gated server-side in NEXORA via `NEXORA_MAFTAH_LOGIN_EXPOSURE` (`hidden` | `pilot` | `public`).
3. **Fail-Closed Safety**: Any undefined, invalid, or empty exposure setting strictly resolves to `hidden`.
4. **Initiation-Only Gating**: Hidden mode blocks *new initiation* (`/login/maftah` and `/api/auth/maftah` return HTTP 404). Valid in-flight callbacks (`/api/auth/maftah/callback`) and existing active sessions are unaffected.
5. **Zero Normal Login Alteration**: The default customer entrypoint (`/` unauthenticated view) remains 100% legacy SSO.
6. **Dedicated Pilot Route**: Controlled pilot users initiate authentication exclusively at `/login/maftah`.
7. **Strict Safe Observability**: Operational telemetry uses private storage (`nexora_internal.auth_operational_events`), narrow SECURITY DEFINER RPC (`public.service_log_auth_operational_event`), and an explicit allowlist that rejects all credentials, secrets, tokens, codes, and raw IP addresses.

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
- **UI Design System**:
  - Dark glassmorphism card matching NEXORA design language.
  - "LAM ID SSO (Maftah Pilot)" branded action button linking directly to `/api/auth/maftah`.
  - Secondary fallback link: "Return to standard login" linking to `/`.
  - Full i18n support: English (`en`), French (`fr`), Arabic (`ar` with `dir="rtl"`).

---

## 4. Operational Observability & Safe Telemetry

### 4.1 Schema Isolation & Security Boundary
- **Private Schema**: `nexora_internal.auth_operational_events`
- **RPC**: `public.service_log_auth_operational_event` (SECURITY DEFINER, `SET search_path = ''`, granted exclusively to `service_role`).
- **PostgREST OpenAPI**: Zero exposure to `PUBLIC`, `anon`, or `authenticated` roles.

### 4.2 Strict Metadata Allowlist (`lib/auth/observability.ts`)
```typescript
interface OperationalEventPayload {
  eventType: string;          // e.g., 'maftah_login_started', 'maftah_token_exchanged'
  provider: 'maftah' | 'legacy_sso' | 'dev_auth';
  outcome: 'success' | 'failure' | 'pending' | 'info';
  safeErrorCode?: string;     // High-level categorical error (e.g., 'state_mismatch')
  environment?: string;       // Defaults to process.env.NODE_ENV
  externalOrgId?: string;     // UUID or null
  tenantId?: string;          // UUID or null
  sessionId?: string;         // UUID or null
  subject?: string;           // UUID string or null
  correlationId?: string;     // Trace ID
  metadata?: {
    latency_ms?: number;
    credential_version?: number;
    revalidation_type?: 'none' | 'cached' | 'full';
    flow?: string;
  };
}
```

### 4.3 Explicit Security Exclusions:
- ❌ Zero credential logging (`access_token`, `refresh_token`, `id_token`).
- ❌ Zero secret logging (`client_secret`, `vault_key`, `code_verifier`, `nonce`, `state`).
- ❌ Zero raw network identifiers (`ip_address`, `user_agent` headers).
- ❌ Zero free-form error stack traces or raw provider messages in `metadata`.
- ❌ Zero blocking behavior (telemetry failures are caught and logged without throwing).

---

## 5. Rollback & Emergency Kill-Switch Runbook

### Immediate Rollback (Kill-Switch):
Set the environment variable in production:
```bash
NEXORA_MAFTAH_LOGIN_EXPOSURE=hidden
```
**Effect**:
- New OAuth initiations via `/api/auth/maftah` immediately return HTTP 404.
- Pilot route `/login/maftah` immediately returns HTTP 404.
- In-flight callback exchanges (`/api/auth/maftah/callback`) already initiated will still complete legitimately.
- Existing active user sessions remain valid until natural expiration or logout.
- Normal legacy login (`/api/auth/sso`) remains 100% operational.

### Database Rollback:
Execute `supabase/rollback/20260905000000_rollback_nexora_auth_operational_events.sql` if operational events schema removal is required.
