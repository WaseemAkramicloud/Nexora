# NEXORA — SaaS ERP Solution

NEXORA is an enterprise SaaS application designed under the central **LAM Architecture** identity model.

---

## 1. Authentication & Identity Architecture

NEXORA relies strictly on the central identity authority **LAM ID** (`https://id.lubbalmandumah.com`) for user authentication, product entitlement verification, and multi-tenant access control.

* **Protocol**: OAuth 2.0 / OpenID Connect (OIDC) Authorization Code Flow with PKCE (`S256`).
* **Token Verification**: RS256 JWT signature verification using public keys dynamically retrieved from LAM ID's JWKS endpoint (`https://id.lubbalmandumah.com/.well-known/jwks.json`).
* **Product Entitlement**: Strict claim validation ensuring `products` includes `'nexora'`.
* **Tenant Isolation**: Automated mapping from LAM company context to NEXORA local tenant workspaces and database memberships.
* **Credentials & Passwords**: NEXORA creates **no local user passwords**. Identity management is delegated entirely to LAM ID.

> [!NOTE]
> **OBSOLETE REQUIREMENT**: Local development no longer requires running LAM ID locally on port `3000`. All environments connect to the live identity authority at `https://id.lubbalmandumah.com`.

---

## 2. Environments & Network Endpoints

### Local Development Environment
* **NEXORA App URL**: `http://localhost:3001`
* **NEXORA Callback URL**: `http://localhost:3001/api/auth/callback`
* **LAM ID Authority**: `https://id.lubbalmandumah.com`
* **LAM Authorize Endpoint**: `https://id.lubbalmandumah.com/api/sso/authorize`
* **LAM Token Endpoint**: `https://id.lubbalmandumah.com/api/sso/token`
* **LAM JWKS Endpoint**: `https://id.lubbalmandumah.com/.well-known/jwks.json`

### Production Environment
* **NEXORA App URL**: `https://nexora.lubbalmandumah.com`
* **NEXORA Callback URL**: `https://nexora.lubbalmandumah.com/api/auth/callback`
* **LAM ID Authority**: `https://id.lubbalmandumah.com`
* **LAM Authorize Endpoint**: `https://id.lubbalmandumah.com/api/sso/authorize`
* **LAM Token Endpoint**: `https://id.lubbalmandumah.com/api/sso/token`
* **LAM JWKS Endpoint**: `https://id.lubbalmandumah.com/.well-known/jwks.json`

---

## 3. Development Commands

```bash
# Start local development server (automatically binds to port 3001)
npm run dev

# Run full authentication and inter-service security unit test suite
npm test

# Build production bundle
npm run build
```

---

## 4. Environment Variables Configuration

Copy `.env` and configure environment-specific parameters:

```env
# NEXORA Core Configuration
PROJECT_NAME=NEXORA
NEXORA_BASE_URL=http://localhost:3001
NEXORA_CALLBACK_URL=http://localhost:3001/api/auth/callback

# Live LAM ID OAuth / OIDC Configuration
LAM_OIDC_ISSUER=https://id.lubbalmandumah.com
LAM_CLIENT_ID=lam_app_nexora
LAM_CLIENT_SECRET=lam_secret_nexora_app_key_2026
LAM_OIDC_AUTHORIZE_URL=https://id.lubbalmandumah.com/api/sso/authorize
LAM_OIDC_TOKEN_URL=https://id.lubbalmandumah.com/api/sso/token
LAM_OIDC_USERINFO_URL=https://id.lubbalmandumah.com/api/sso/userinfo
LAM_OIDC_JWKS_URL=https://id.lubbalmandumah.com/.well-known/jwks.json
LAM_PORTAL_URL=https://id.lubbalmandumah.com

# Inter-Service & Session Secrets
LAM_INTER_SERVICE_SECRET=lam_inter_service_secret_key_2026
NEXORA_SESSION_SECRET=nexora_local_session_signing_secret_2026
ENABLE_DEV_AUTH=false
```

For production deployment on Vercel, set `NEXORA_BASE_URL=https://nexora.lubbalmandumah.com` and `NEXORA_CALLBACK_URL=https://nexora.lubbalmandumah.com/api/auth/callback`.

---

## 5. LAM ID Application Registration & Callback Whitelist

To maintain strict service isolation, NEXORA does not directly modify the central LAM ID database.

The central LAM ID application registry (`sso_applications` record for `client_id: lam_app_nexora`) must be configured in the central LAM ID service to whitelist both callback URLs:

1. Development Callback: `http://localhost:3001/api/auth/callback`
2. Production Callback: `https://nexora.lubbalmandumah.com/api/auth/callback`

> [!WARNING]
> Do NOT use wildcard callback URLs (`http://localhost:*` or `https://*.lubbalmandumah.com`). Each redirect URI must be explicitly listed in the whitelist.

---

---

## 7. E2E Testing & Guaranteed Teardown

For full details on live integration testing between LAM ID and NEXORA, see [E2E Architecture & Teardown Documentation](file:///Users/waseemakram/My%20Comp%20Data/My%20ERPs/Nexora/docs/E2E_TESTING.md).

```bash
# Run live E2E test suite (requires explicit production acknowledgement if targeting live DBs)
ALLOW_PRODUCTION_E2E=true node scripts/live-e2e-suite.js

# Test controlled failure teardown behavior
ALLOW_PRODUCTION_E2E=true E2E_SIMULATE_FAILURE_STEP=7 node scripts/live-e2e-suite.js
```

> [!CAUTION]
> **BROWSER VERIFICATION REQUIREMENT (SAFARI ONLY)**:
> All manual or browser-based user verification (SSO login, PKCE flow, session cookies) must be performed strictly using **Safari on macOS**. Google Chrome / Chromium must not be used.

