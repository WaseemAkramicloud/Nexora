# E2E Test Suite & Teardown Architecture Documentation

This document describes the test harness architecture, guaranteed teardown behavior, security guards, and browser verification requirements for running end-to-end (E2E) tests between LAM ID and NEXORA.

---

## 1. Overview & Test Harness Isolation

The E2E test suite (`scripts/live-e2e-suite.js`) verifies the end-to-end integration flow between central identity authority **LAM ID** and **NEXORA**.

> [!IMPORTANT]
> **Runtime Isolation Guard**:
> Server-side test harness credentials (such as LAM service-role database keys used in `scripts/live-e2e-suite.js`) are strictly isolated to test tooling scripts.
> Normal NEXORA production runtime code (`app/`, `lib/`) **never** imports LAM service-role keys or directly accesses the LAM database. NEXORA production code communicates with LAM exclusively via established OAuth 2.0 / OIDC Authorization Code Flow (PKCE RS256) and HMAC-signed inter-service API endpoints (`/api/inter-service/*`).

---

## 2. Production Safety Guard

The E2E test suite includes an explicit safety control to prevent accidental execution against live production systems.

```bash
# Executing against production without acknowledgement will FAIL CLOSED:
node scripts/live-e2e-suite.js
# => ❌ E2E EXECUTION BLOCKED BY PRODUCTION SAFETY GUARD

# To execute against live/production environments:
ALLOW_PRODUCTION_E2E=true node scripts/live-e2e-suite.js
```

### Safety Rules:
- The script automatically detects if configured target services point to production databases (`*.supabase.co` or production domains).
- If production is detected and `ALLOW_PRODUCTION_E2E=true` is absent, the suite **fails closed** immediately before creating any records or executing tests.

---

## 3. Staging Environment Recommendation

* **Staging / Test Environments**: Recommended for full destructive E2E suite executions.
* **Production Environments**: Should ideally run non-destructive health checks, smoke tests, and OIDC endpoint validations. When full live E2E tests are run on production, guaranteed teardown ensures zero lingering test record pollution.

---

## 4. Unique Test Run Identification & Exact ID Tracking

To prevent broad or dangerous bulk deletions (e.g. `DELETE WHERE name LIKE '%Apex%'`), every test execution generates a unique `runId`:

```javascript
const runId = `e2e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
```

### Tracking Scope:
- Synthetic companies: `Apex Live Enterprise Solutions (${runId})`
- Test Executive Email: `live.user.${runId}@apexenterprise.test`
- Test Employee Email: `live.employee.${runId}@apexenterprise.test`
- Platform Admin Email: `superadmin.${runId}@lam.com`

All primary keys created during setup are captured in `createdResources`:
```javascript
const createdResources = {
  runId,
  lam: { companyId, customerId, authUserId, membershipId, entitlementId, productAccessId },
  nexora: { tenantId, invitationIds, membershipIds, platformAdminCustomerIds }
}
```

Teardown deletes resources **strictly by captured primary-key IDs**.

---

## 5. Guaranteed Teardown & Execution Order

All test execution steps run inside a `try ... finally` block. Teardown runs unconditionally, even if:
- an assertion fails;
- OAuth/PKCE verification fails;
- an inter-service route fails;
- an exception is thrown;
- `process.env.E2E_SIMULATE_FAILURE_STEP` is set.

### Teardown Execution Order:
1. **LAM User Access**: Revoke & delete `customer_product_access` by primary key.
2. **LAM Membership**: Remove `customer_company_memberships` by primary key.
3. **LAM Entitlement**: Remove `customer_product_entitlements` by primary key.
4. **LAM Invitations**: Remove `customer_invitations` linked to test `company_id`.
5. **NEXORA Tenant Deprovisioning**: Call HMAC-signed endpoint `POST /api/inter-service/provisioning` (`action: 'deprovision'`) to delete NEXORA tenant and cascading workspace data (`memberships`, `invitations`, `campaigns`, `target_areas`, `businesses`, `contacts`, `lead_records`, `activities`, `audit_logs`).
6. **NEXORA Platform Admin Deletion**: Call HMAC-signed endpoint `POST /api/inter-service/platform-admins` (`action: 'delete'`) using exact `lamCustomerId`.
7. **LAM Company Deletion**: Delete `crm_companies` by primary key.
8. **LAM Customer Identity & Auth User Cleanup**: Delete `customer_identities` and `auth.users` ONLY if created by this exact run, test-only, and having no other company memberships.

---

## 6. Cleanup Verification & Failure Visibility

Following teardown, the suite re-queries both databases using the exact captured primary keys to verify total removal.

### Final Status Outcomes:
- `FUNCTIONAL TEST PASSED — CLEANUP VERIFIED`
- `FUNCTIONAL TEST FAILED — CLEANUP VERIFIED`
- `FUNCTIONAL TEST PASSED — CLEANUP FAILED`
- `FUNCTIONAL TEST FAILED — CLEANUP FAILED`

If any cleanup step fails, the suite reports `CLEANUP FAILED` and lists the remaining non-sensitive safe resource IDs. Credentials, tokens, keys, passwords, and secrets are never logged.

---

## 7. Controlled Failure Testing

To verify teardown-on-failure behavior without mutating test code:

```bash
ALLOW_PRODUCTION_E2E=true E2E_SIMULATE_FAILURE_STEP=7 node scripts/live-e2e-suite.js
```

This simulates a failure at step 7 and confirms that teardown completes successfully and outputs `FUNCTIONAL TEST FAILED — CLEANUP VERIFIED`.

---

## 8. Browser-Based Testing Guidelines (SAFARI ONLY)

For all end-to-end, login, SSO, and UI verification testing:

> [!CAUTION]
> **SAFARI ONLY — NEVER USE GOOGLE CHROME**
> - **Mandatory Browser**: **Safari on macOS**.
> - Do **NOT** use Google Chrome, Chromium, or Chrome-based automated tools as a substitute for Safari.
> - If automated Safari driver tools are not available or fail to execute, complete all automated server-side integration tests, report `Manual Safari verification required`, document exact manual verification steps, and wait for confirmation in Safari.
> - Never claim `Real Browser Test PASSED` unless the browser used was Safari.
