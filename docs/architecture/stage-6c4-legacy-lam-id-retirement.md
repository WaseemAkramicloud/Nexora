# NEXORA Architecture Record — Stage 6C.4: Legacy LAM ID Retirement

## Executive Summary

Stage 6C.4 formally retires and decommissions the legacy LAM ID integration (`https://id.lubbalmandumah.com`) from NEXORA. Following this stage, NEXORA operates with **ONE unified and authoritative identity architecture: LAM Maftah**.

NEXORA’s runtime authentication, session verification, workspace switching, and logout flows now exclusively utilize the LAM Maftah federation contract (OAuth 2.0 / OIDC + resolver flow) with zero operational dependency on legacy LAM ID.

---

## 1. Milestone Status Registry

* **Stage 6C.1 — Controlled Pilot**: **COMPLETE** (human-verified in production)
* **Stage 6C.2 — Public Maftah Rollout**: **COMPLETE** (public exposure, workspace switching, error localization in EN/FR/AR)
* **Stage 6C.3 — Maftah Default & Legacy Hardening**: **COMPLETE** (default convergence, fail-closed recovery, account header integration)
* **Stage 6C.4 — Legacy LAM ID Retirement**: **COMPLETE** (all legacy SSO endpoints, config getters, RS256 token verification, and legacy logout branches decommissioned)

---

## 2. Identity & Access Architecture Division of Responsibility

| Component | Responsibility Owner | Operational Details |
| :--- | :--- | :--- |
| **Ecosystem Identity & Access** | **LAM Maftah** | Central authentication, user accounts, organization memberships, and OAuth 2.0 / OIDC tokens. |
| **Product-Local Authorization** | **NEXORA** | Tenant-specific workspace data, local roles (`owner`, `admin`, `sales_user`, `viewer`), local session lifecycle, and encrypted credential vault. |
| **Database Boundary** | **Strict Zero-Shared DB** | NEXORA and Maftah maintain completely separate Supabase databases; communication is strictly over HTTPS via OAuth/OIDC and HMAC-signed APIs. |
| **Trust Model** | **Federation Contract** | NEXORA trusts Maftah via asymmetric ES256 JWKS verification, ID token assertions, and the `/resolve-entry` contract. |

---

## 3. Scope of Decommissioned Code & Routes

1. **Legacy SSO Initiation Route (`/api/auth/sso`)**:
   - Decommissioned.
   - Any requests or bookmarked URLs safely 302 redirect to `/login/maftah` (preserving relative `returnUrl` where valid).
   - Zero redirects to `id.lubbalmandumah.com`.

2. **Legacy OAuth Callback Route (`/api/auth/callback`)**:
   - Decommissioned.
   - Any historical requests safely clear residual cookies and 302 redirect to `/login/maftah?error=legacy_sso_retired`.
   - Never exchanges authorization codes or creates sessions.

3. **Legacy Configuration Getters (`lib/auth/config.ts`)**:
   - Removed `getLamIssuer`, `getLamClientId`, `getLamClientSecret`, `getLamAuthorizeEndpoint`, `getLamTokenEndpoint`, `getLamUserinfoEndpoint`, `getLamJwksEndpoint`, and `getNexoraCallbackUrl`.

4. **Legacy Cryptography & JWKS Logic (`lib/auth/jwks.ts`)**:
   - Deleted obsolete RS256 token verification engine and JWKS cache pointing to `id.lubbalmandumah.com`.
   - Removed legacy `verifyLamOidcToken` and `LamTokenPayload` re-exports from `lib/auth/jwt.ts`.

5. **Sign-Out Route (`/api/auth/logout` & `lib/auth/logout.ts`)**:
   - Removed legacy authentication logout branches.
   - All logout operations revoke local federation sessions, purge encrypted credentials, clear cookies, and redirect to `/login/maftah`.

---

## 4. Unused Environment Variables for Vercel Cleanup

The following legacy environment variables are confirmed unused by NEXORA code and are candidates for deletion from Vercel Production:

* `LAM_OIDC_ISSUER`
* `LAM_CLIENT_ID`
* `LAM_CLIENT_SECRET`
* `LAM_OIDC_AUTHORIZE_URL`
* `LAM_OIDC_TOKEN_URL`
* `LAM_OIDC_USERINFO_URL`
* `LAM_OIDC_JWKS_URL`
* `LAM_OIDC_LOGOUT_URL`
* `LAM_PORTAL_URL`

**Retained Active Variables**:
* `MAFTAH_OAUTH_CLIENT_ID`
* `MAFTAH_OAUTH_CLIENT_SECRET`
* `NEXORA_CREDENTIAL_VAULT_KEY`
* `MAFTAH_OAUTH_ISSUER`
* `MAFTAH_OAUTH_AUTHORIZE_URL`
* `MAFTAH_OAUTH_TOKEN_URL`
* `MAFTAH_OAUTH_JWKS_URL`
* `LAM_INTER_SERVICE_SECRET` (for inter-service HMAC endpoints)
* `LAM_HOOK_SECRET` (for webhook endpoints)

---

## 5. Verification Invariants

1. ✅ Old SSO entry does not authenticate users.
2. ✅ Obsolete callback cannot create a NEXORA session.
3. ✅ Obsolete login entry safely redirects to `/login/maftah`.
4. ✅ Zero active runtime requests in `app/` or `lib/` target `id.lubbalmandumah.com`.
5. ✅ Zero legacy issuer/JWKS/token URLs remain in active auth logic.
6. ✅ Maftah login functions and resolves canonical Maftah endpoints.
7. ✅ Workspace switching functions via fresh Maftah OAuth initiation.
8. ✅ Sign out revokes federation session and redirects to `/login/maftah`.
9. ✅ Session revalidation remains fail-closed.
10. ✅ Tenant-local role isolation remains intact.
