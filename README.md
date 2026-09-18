# NEXORA — SaaS ERP Solution

NEXORA is an enterprise SaaS application designed under the central **LAM Architecture** identity model.

---

## 1. Authentication & Identity Architecture

NEXORA uses **LAM Maftah** as its single, authoritative identity and federation provider. Maftah resolves authorized organizations; NEXORA independently maps them to existing local tenants, memberships, and product roles.

* **Protocol**: OAuth 2.0 / OpenID Connect (OIDC) Authorization Code Flow with PKCE (`S256`).
* **Token Verification**: Maftah OAuth access tokens and ID tokens are verified independently via asymmetric ES256 JWKS.
* **Tenant Isolation**: Authorized Maftah organizations map only to explicitly provisioned NEXORA tenants and memberships.
* **Product Authorization**: NEXORA local roles remain authoritative inside each selected workspace.
* **Credentials & Passwords**: NEXORA creates **no local user passwords**. Federation credentials are encrypted server-side and scoped to the local product session.
* **Legacy LAM ID Status**: Fully **RETIRED** in Stage 6C.4. Zero operational dependency on `id.lubbalmandumah.com`.

---

## 2. Environments & Network Endpoints

### Local Development Environment
* **NEXORA App URL**: `http://localhost:3001`
* **Maftah Login URL**: `http://localhost:3001/login/maftah`
* **Maftah OAuth Callback**: `http://localhost:3001/api/auth/maftah/callback`

### Production Environment
* **NEXORA App URL**: `https://nexora.lubbalmandumah.com`
* **Maftah Login URL**: `https://nexora.lubbalmandumah.com/login/maftah`
* **Maftah OAuth Callback**: `https://nexora.lubbalmandumah.com/api/auth/maftah/callback`

---

## 3. Development Commands

```bash
# Start local development server (automatically binds to port 3001)
npm run dev

# Run full authentication and security unit test suite
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
NEXORA_BASE_URL=https://nexora.lubbalmandumah.com
NEXORA_MAFTAH_LOGIN_EXPOSURE=public

# LAM Maftah OAuth 2.0 Federation Configuration
MAFTAH_OAUTH_CLIENT_ID=your_maftah_client_id
MAFTAH_OAUTH_CLIENT_SECRET=your_maftah_client_secret
MAFTAH_OAUTH_ISSUER=https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1
MAFTAH_OAUTH_AUTHORIZE_URL=https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/oauth/authorize
MAFTAH_OAUTH_TOKEN_URL=https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/oauth/token
MAFTAH_OAUTH_JWKS_URL=https://ujqjtarsdtbnwzqegtzy.supabase.co/auth/v1/.well-known/jwks.json
MAFTAH_API_URL=https://maftah.lubbalmandumah.com

# Server Credential Vault Key (32-byte hex)
NEXORA_CREDENTIAL_VAULT_KEY=your_32_byte_hex_key

# Inter-Service & Session Secrets
LAM_INTER_SERVICE_SECRET=lam_inter_service_secret_key_2026
NEXORA_SESSION_SECRET=nexora_local_session_signing_secret_2026
```

---

## 5. Stage 6C.1 — Complete

Stage 6C.1 has been completed and human-verified in production.
- **Production Proof**: Multi-organization selection, two mapped NEXORA workspaces, distinct local roles, session creation, refresh engine, and NEXORA-local sign-out verified in production on 17 September 2026.
- **Status**: COMPLETE.
- **Architecture Specification**: [`docs/architecture/stage-6c1-controlled-maftah-login-exposure.md`](docs/architecture/stage-6c1-controlled-maftah-login-exposure.md)

---

## 6. Stage 6C.2 — Complete

Stage 6C.2 has been completed:
- **Public Rollout**: Maftah is the visible normal authentication path.
- **Safe Workspace Switching**: Authenticated multi-org users switch workspaces through fresh Maftah OAuth/resolver authorization (`/api/auth/maftah/switch` -> `/select-workspace`). Old session safely revoked before switching.
- **Customer Error UX**: Raw machine codes masked; friendly localized error messages in EN, FR, AR with RTL support.
- **Status**: COMPLETE.
- **Architecture Specification**: [`docs/architecture/stage-6c2-public-maftah-rollout.md`](docs/architecture/stage-6c2-public-maftah-rollout.md)

---

## 7. Stage 6C.3 — Complete

Stage 6C.3 establishes Maftah as NEXORA's definitive default authentication path:
- **Maftah Default**: All normal authentication entrypoints (`/`, `/login/maftah`, `/auth/unauthorized`, session recovery, logout) use Maftah by default.
- **Fail-Closed Session Recovery**: Expired sessions, revoked memberships, and failed revalidations fail closed cleanly to `/login/maftah` with localized user guidance.
- **Status**: COMPLETE.
- **Architecture Specification**: [`docs/architecture/stage-6c3-maftah-default-and-legacy-hardening.md`](docs/architecture/stage-6c3-maftah-default-and-legacy-hardening.md)

---

## 8. Stage 6C.4 — Complete

Stage 6C.4 completes the retirement of the legacy LAM ID integration from NEXORA:
- **Legacy LAM ID Retired**: Legacy SSO initiation (`/api/auth/sso`), legacy callback (`/api/auth/callback`), legacy RS256 JWKS/token validation, and legacy global logout logic have been decommissioned.
- **Single Identity Architecture**: NEXORA exclusively integrates with LAM Maftah. Zero operational dependency on `id.lubbalmandumah.com`.
- **Status**: COMPLETE.
- **Architecture Specification**: [`docs/architecture/stage-6c4-legacy-lam-id-retirement.md`](docs/architecture/stage-6c4-legacy-lam-id-retirement.md)
