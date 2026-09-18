import { test, describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  callMaftahResolveEntry,
  sanitizeSafeBodyStatus,
  sanitizeSafeBodyError
} from "../lib/auth/maftah-oauth"

describe("NEXORA — Resolver Boundary Classification & Safety Matrix", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("1. HTTP 200 + organization_selection_required", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        status: "organization_selection_required",
        eligible_organizations: [
          { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-1", name: "Org 1" },
          { id: "a789fb29-d0bd-48ce-b77b-8ee58a968604", slug: "org-2", name: "Org 2" }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.failureKind, "SUCCESS")
    assert.strictEqual(result.httpStatus, 200)
    assert.strictEqual(result.safeUpstreamStatus, "organization_selection_required")
    assert.strictEqual(result.eligibleOrganizationCount, 2)
  })

  test("2. HTTP 200 + authorized", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        status: "authorized",
        organization: { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-1", name: "Org 1" }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.failureKind, "SUCCESS")
    assert.strictEqual(result.httpStatus, 200)
    assert.strictEqual(result.safeUpstreamStatus, "authorized")
  })

  test("3. HTTP 200 + unexpected status fails closed with a sanitized classification", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ status: "custom_unrecognized_status_payload", random_field: "unexpected" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "INVALID_RESPONSE_SHAPE")
    assert.strictEqual(result.safeUpstreamStatus, "UNEXPECTED_VALUE")
  })

  test("4. HTTP 401 + oauth_session_invalid", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ status: "unauthorized", error: "oauth_session_invalid" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "HTTP_NON_200")
    assert.strictEqual(result.httpStatus, 401)
    assert.strictEqual(result.safeUpstreamStatus, "unauthorized")
    assert.strictEqual(result.safeUpstreamError, "oauth_session_invalid")
  })

  test("5. HTTP 403 + denied", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ status: "denied", error: "no_effective_access" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "HTTP_NON_200")
    assert.strictEqual(result.httpStatus, 403)
    assert.strictEqual(result.safeUpstreamStatus, "denied")
    assert.strictEqual(result.safeUpstreamError, "no_effective_access")
  })

  test("6. HTTP 500 internal error", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ status: "error", error: "internal_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "HTTP_NON_200")
    assert.strictEqual(result.httpStatus, 500)
    assert.strictEqual(result.safeUpstreamStatus, "error")
    assert.strictEqual(result.safeUpstreamError, "internal_error")
  })

  test("7. invalid non-JSON response fails closed without returning the body", async () => {
    globalThis.fetch = async () => new Response(
      "<html><body>502 Bad Gateway: upstream detail</body></html>",
      { status: 502, headers: { "Content-Type": "text/html" } }
    )

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "JSON_PARSE_ERROR")
    assert.strictEqual(result.httpStatus, 502)
    assert.strictEqual(result.data, undefined)
  })

  test("8. network rejection fails closed without returning exception detail", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed: private upstream detail")
    }

    const result = await callMaftahResolveEntry("dummy_token")

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.failureKind, "NETWORK_ERROR")
    assert.strictEqual(result.httpStatus, null)
    assert.strictEqual(JSON.stringify(result).includes("private upstream detail"), false)
  })

  test("9. safe classification fields never contain request credentials or arbitrary response fields", async () => {
    const sensitiveToken = "super_secret_access_token_123456789_xyz"
    const sensitiveOrgId = "7433026d-18b3-4cbc-896f-6c917c1dd6eb"

    globalThis.fetch = async () => new Response(
      JSON.stringify({
        status: "denied",
        error: "no_effective_access",
        secret_key_leaked: "do_not_return_this"
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )

    const result = await callMaftahResolveEntry(sensitiveToken, sensitiveOrgId)
    const safeClassification = JSON.stringify({
      failureKind: result.failureKind,
      httpStatus: result.httpStatus,
      safeUpstreamStatus: result.safeUpstreamStatus,
      safeUpstreamError: result.safeUpstreamError,
      eligibleOrganizationCount: result.eligibleOrganizationCount,
      error: result.error
    })

    assert.strictEqual(safeClassification.includes(sensitiveToken), false)
    assert.strictEqual(safeClassification.includes(sensitiveOrgId), false)
    assert.strictEqual(safeClassification.includes("do_not_return_this"), false)
  })

  test("10. safe resolver fields remain strictly allowlisted", () => {
    assert.strictEqual(sanitizeSafeBodyStatus("organization_selection_required"), "organization_selection_required")
    assert.strictEqual(sanitizeSafeBodyStatus("authorized"), "authorized")
    assert.strictEqual(sanitizeSafeBodyStatus("arbitrary_status"), "UNEXPECTED_VALUE")
    assert.strictEqual(sanitizeSafeBodyError("oauth_session_invalid"), "oauth_session_invalid")
    assert.strictEqual(sanitizeSafeBodyError("arbitrary_error_code"), "UNEXPECTED_VALUE")
  })
})
