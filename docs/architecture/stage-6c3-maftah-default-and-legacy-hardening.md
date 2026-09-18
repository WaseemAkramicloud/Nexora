# Stage 6C.3 — NEXORA Maftah Default & Legacy Fallback Hardening

## 1. Stage Status & Objectives

- **Stage 6C.1 Status**: COMPLETE (Human-verified in production on 17 September 2026).
- **Stage 6C.2 Status**: COMPLETE (Public Maftah Rollout & Workspace Switching).
- **Stage 6C.3 Status**: IMPLEMENTED (Maftah Default & Legacy Fallback Hardening).
- **Stage 6C.4 Status**: NOT STARTED.

This document records the hardening specifications that establish Maftah as NEXORA's definitive default authentication system and isolate legacy LAM ID strictly to emergency rollback-only infrastructure.

---

## 2. Maftah Default Authentication Model

Maftah is the sole visible and default authentication engine across all NEXORA customer touchpoints:

1. **Root Unauthenticated Landing (`/`)**:
   Presents the clean NEXORA sign-in card with localized EN / FR / AR language selection and direct entry to Maftah authentication (`/login/maftah`). No legacy login buttons or standard login fallbacks appear.

2. **Direct Authentication Entry (`/login/maftah`)**:
   Standard visible federation sign-in route with real-time multilingual language switching and customer-friendly error message resolution.

3. **Protected Route & Expired Session Redirects**:
   All unauthenticated or expired requests are directed to `/login/maftah` with safe error codes that map to friendly localized guidance.

4. **Unauthorized & Entitlement Failures (`/auth/unauthorized`)**:
   Presents clear localized explanations of access revocation and provides a clean action to re-authenticate via Maftah. Zero legacy SSO links.

5. **Sign-Out Flow (`/api/auth/logout`)**:
   Revokes the local PostgreSQL federation session, deletes vault credentials, clears all browser cookies, and redirects the user to `/login/maftah`.

---

## 3. Safe Workspace Switching & Identification

1. **Workspace Identification**:
   The authenticated account control in the header actively displays:
   - User display name
   - Local NEXORA product role (`Owner`, `Admin`, `Sales Specialist`, `Viewer`)
   - Current active workspace badge (`tenant_name` / `tenant_slug`)
   - Dedicated "Switch workspace" action
   - Sign out action

2. **Server-Controlled Trust Flow**:
   - Initiated via `POST /api/auth/maftah/switch`.
   - Explicitly revokes the current local federation session in database.
   - Generates fresh PKCE state, challenge, and nonce.
   - Directs to Maftah for fresh OAuth authorization.
   - Multi-org selection occurs on `/select-workspace` against verified Maftah eligible organizations.
   - Client-side tenant ID injection is strictly rejected; all workspace links and roles are verified server-side.

---

## 4. Session Recovery & Revocation Matrix

All session evaluation remains strictly fail-closed:

| Scenario | Server Evaluation | Customer UX Outcome |
| :--- | :--- | :--- |
| Normal Active Session | `status == 'active'` AND `membership_status == 'active'` | Seamless dashboard access |
| 8-Hour Absolute Expiry | `expires_at <= now()` -> status set to `expired`, credentials deleted | Session expired -> Redirect to `/login/maftah` with localized message |
| Local Membership Revoked / Suspended | `membership_status != 'active'` | Access inactive -> Redirect to `/login/maftah` with localized message |
| Maftah Entitlement Revoked | Revalidation fails (`revalidateMaftahFederationSession`) -> Session revoked | Access denied -> Redirect to `/login/maftah` with localized message |
| Stale / Consumed Transaction | `tx.status != 'pending'` | Transaction expired -> Redirect to `/login/maftah` with localized message |

---

## 5. Legacy Fallback Isolation (Rollback-Only)

- Legacy LAM ID routes (`/api/auth/sso`, `/api/auth/callback`, legacy logout branches) are retained strictly as emergency rollback infrastructure.
- Legacy LAM ID is **NOT** retired yet.
- Zero customer routes or UI elements link to `id.lubbalmandumah.com`.
- Legacy paths are tagged in source code with `// legacy rollback-only path`.

---

## 6. Security Invariants Preserved

1. Verified ES256 Maftah identity tokens.
2. Mandatory `session_id` + `sub` + `client_id` verification.
3. AES-256-GCM vault encryption with AAD context binding.
4. Absolute 8-hour non-sliding federation sessions.
5. Server-controlled role resolution (no external role escalation).
6. Fail-closed telemetry allowlist with zero credential logging.
