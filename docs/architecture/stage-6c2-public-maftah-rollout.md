# Stage 6C.2 — NEXORA Public Maftah Rollout & Workspace Switching Architecture Specification

## 1. Stage Status & Objectives

- **Stage 6C.1 Status**: COMPLETE (Human-verified in production on 17 September 2026).
- **Stage 6C.2 Status**: IMPLEMENTED (Public Maftah Rollout).
- **Stage 6C.3 Status**: NOT STARTED.

This document records the architectural specification and security model for moving NEXORA into the normal public Maftah authentication experience.

---

## 2. Normal Customer Authentication Architecture

Maftah is now the normal visible authentication path across all NEXORA entrypoints:

```
Unauthenticated User opens NEXORA (/)
  │
  ▼
Clean NEXORA Sign-in Page
  │ (Presents localized EN / FR / AR UI; no pilot wording, no internal product IDs)
  ▼
"Sign in with LAM Maftah" (/login/maftah -> /api/auth/maftah)
  │ (PKCE code_challenge + state + nonce + correlationId)
  ▼
Maftah OAuth Provider (Central Identity)
  │ (User authenticates and grants access)
  ▼
NEXORA Callback Handler (/api/auth/maftah/callback)
  │ (Authoritative entry resolution via Maftah resolve-entry endpoint)
  ├────────────────────────────────────────────────────────┐
  ▼                                                        ▼
Single Organization (status: "authorized")   Multi-Organization (status: "organization_selection_required")
  │                                                        │
  │                                                        ▼
  │                                              Encrypted Login Transaction Created
  │                                                        │
  │                                                        ▼
  │                                              /select-workspace (User chooses org)
  │                                                        │
  │                                                        ▼
  │                                              selectWorkspaceAction (Authoritative re-verification with Maftah)
  ├────────────────────────────────────────────────────────┘
  ▼
Resolve Local Workspace Mapping (`service_resolve_federation_workspace`)
  │
  ▼
Resolve Tenant-Scoped Local Identity Link (`service_get_federation_identity_link`)
  │
  ▼
Create Server Federation Session (`service_create_federation_session` — 8h absolute expiry)
  │
  ▼
Store Encrypted Credentials in Vault (`nexora_internal.federation_session_credentials`)
  │
  ▼
Set Version-2 HTTP-Only Session Cookie (`nexora_session`) & Enter NEXORA Dashboard
```

---

## 3. Login Route Normalization

All unauthenticated routes and redirects converge on the Maftah login experience:
- Root `/`: Renders the clean NEXORA sign-in card with language switcher (EN / FR / AR) and button to `/login/maftah`.
- `/login/maftah`: Server-rendered dynamic route rendering the localized login card with customer error message mapping.
- `/auth/unauthorized`: Renders localized access entitlement messages and directs to `/login/maftah`.
- `/api/auth/logout`: Clears browser cookies, revokes the local federation session in DB, and redirects to `/login/maftah`.

---

## 4. Exposure Mode Configuration

- **Environment Variable**: `NEXORA_MAFTAH_LOGIN_EXPOSURE`
- **Values**:
  - `hidden`: Initiation endpoints return 404 (Emergency fail-closed rollback).
  - `pilot`: Dedicated `/login/maftah` route is accessible.
  - `public`: Normal public production mode. Maftah is the primary visible authentication path.
- **Fail-Closed Default**: Any missing, empty, or unapproved value strictly resolves to `hidden`.
- **Production Target for Stage 6C.2**: `public`.

---

## 5. Safe Workspace Switching Trust Flow

Stage 6C.2 implements authenticated workspace switching for multi-organization users without trusting client-side state:

```
Authenticated NEXORA Session
  │
  ▼
User clicks "Switch workspace" (Account menu in header)
  │
  ▼
POST / GET /api/auth/maftah/switch
  │
  ├─ 1. Safely revoke current local federation session (`service_revoke_federation_session`)
  ├─ 2. Clear browser session cookies (`nexora_session`, `nexora_maftah_tx`)
  ├─ 3. Generate fresh PKCE verifier, challenge, state, nonce, and correlationId
  ├─ 4. Log operational event `maftah_switch_workspace_started`
  └─ 5. Redirect browser to Maftah OAuth authorize URL
  │
  ▼
Fresh Maftah OAuth & Resolver Round-Trip
  │
  ▼
/api/auth/maftah/callback
  │ (Re-evaluates user's eligible organizations at Maftah)
  ├──────────────────────────────────────────────────────┐
  ▼                                                      ▼
Multiple Organizations                                 Single Organization
  │                                                      │
  ▼                                                      ▼
Create 10-minute encrypted transaction                 Direct federation session creation
  │                                                      │
  ▼                                                      ▼
Redirect to /select-workspace                          Redirect to /
  │
  ▼
User selects organization
  │
  ▼
selectWorkspaceAction
  ├─ Decrypt transaction access token
  ├─ Authoritative re-verification with Maftah: callMaftahResolveEntry(token, organization_id)
  ├─ Server-side mapping to local tenant & membership
  ├─ Create new 8-hour federation session in NEXORA DB
  └─ Set new session cookie & redirect to /
```

### Security Guarantees:
1. **Zero Client Tenant Trust**: The client cannot specify a `tenant_id` to switch to. It only submits a transient `transaction_id` and Maftah `organization_id`.
2. **Fresh Maftah Authorization**: Every switch requires re-authorization through Maftah.
3. **Session Invalidation**: Old federation session is explicitly revoked on the server before switching.
4. **Tenant-Scoped Local Roles**: Local product roles are resolved from the tenant's `team_members` / `external_identity_memberships` in NEXORA DB.

---

## 6. Customer-Facing Error Model & Localization

Machine error codes are strictly mapped to clear, localized customer messages. No raw internal error codes, PostgREST errors, or database details are shown to end users.

| Internal Safe Code | English (`en`) | French (`fr`) | Arabic (`ar`) |
| :--- | :--- | :--- | :--- |
| `access_not_authorized` | You do not currently have access to NEXORA. | Vous n'avez pas actuellement accès à NEXORA. | ليس لديك صلاحية الوصول إلى نيكسورا NEXORA حالياً. |
| `transaction_expired` | Your sign-in session expired. Please sign in again. | Votre session de connexion a expiré. Veuillez vous reconnecter. | انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً. |
| `workspace_not_provisioned` | This workspace is not yet available in NEXORA. | Cet espace de travail n'est pas encore disponible dans NEXORA. | مساحة العمل هذه غير متوفرة في نيكسورا NEXORA بعد. |
| `membership_not_active` | Your NEXORA access is currently inactive. | Votre accès à NEXORA est actuellement inactif. | صلاحية وصولك إلى نيكسورا NEXORA غير نشطة حالياً. |
| `organization_access_denied` | You no longer have access to this workspace. | Vous n'avez plus accès à cet espace de travail. | لم يعد لديك صلاحية الوصول إلى مساحة العمل هذه. |
| `session_creation_failed` | We could not complete your sign-in. Please try again. | Impossible de finaliser votre connexion. Veuillez réessayer. | تعذر إكمال تسجيل الدخول. يرجى المحاولة مرة أخرى. |
| `credential_decryption_failed` | Your sign-in data could not be verified securely. Please sign in again. | Vos données de connexion n'ont pas pu être vérifiées en toute sécurité. Veuillez vous reconnecter. | تعذر التحقق من بيانات تسجيل الدخول بأمان. يرجى تسجيل الدخول مجدداً. |

All error alerts support full RTL layout direction when Arabic is selected.

---

## 7. Legacy LAM ID Coexistence (Rollback-Only)

- Legacy LAM ID code paths (`/api/auth/sso`, `/api/auth/callback`, legacy logout branches) are retained strictly for emergency rollback.
- Legacy LAM ID is **NOT** retired yet.
- No user-facing links point to legacy LAM ID (`id.lubbalmandumah.com`).
- No normal Maftah authentication flow depends on legacy code.
- Identified in codebase as `// legacy rollback-only path`.

---

## 8. Fail-Closed Invariants Preserved

1. Verified Maftah identity via cryptographically signed ES256 ID tokens.
2. `session_id` + `sub` + `client_id` verification on refresh / revalidation.
3. Server-controlled workspace links (`federation_workspace_links`).
4. Server-controlled tenant roles (`external_identity_memberships`).
5. AES-256-GCM credential vault storage with AAD binding.
6. Non-sliding 8-hour absolute federation session expiry.
7. Single-use, 10-minute bound login transactions.
