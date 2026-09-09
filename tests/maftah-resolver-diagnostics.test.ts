import { test, describe, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  callMaftahResolveEntry,
  sanitizeSafeBodyStatus,
  sanitizeSafeBodyError
} from "../lib/auth/maftah-oauth"

describe("NEXORA Stage 6C.1 — Resolver Boundary Diagnostics & Safety Matrix", () => {
  const originalFetch = globalThis.fetch
  let loggedMessages: string[] = []
  const originalConsoleLog = console.log

  beforeEach(() => {
    loggedMessages = []
    console.log = (...args: unknown[]) => {
      loggedMessages.push(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.log = originalConsoleLog
  })

  test("1. HTTP 200 + organization_selection_required", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "organization_selection_required",
          eligible_organizations: [
            { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-1", name: "Org 1" },
            { id: "a789fb29-d0bd-48ce-b77b-8ee58a968604", slug: "org-2", name: "Org 2" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, true)
    assert.strictEqual(res.failureKind, "SUCCESS")
    assert.strictEqual(res.httpStatus, 200)
    assert.strictEqual(res.safeUpstreamStatus, "organization_selection_required")
    assert.strictEqual(res.eligibleOrganizationCount, 2)

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog, "resolver_result diagnostic marker must be logged")
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, 200)
    assert.strictEqual(parsed.responseOk, true)
    assert.strictEqual(parsed.jsonParsed, true)
    assert.strictEqual(parsed.bodyStatus, "organization_selection_required")
    assert.strictEqual(parsed.eligibleOrganizationCount, 2)
    assert.strictEqual(parsed.failureKind, "SUCCESS")
  })

  test("2. HTTP 200 + authorized", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "authorized",
          organization: { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-1", name: "Org 1" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, true)
    assert.strictEqual(res.failureKind, "SUCCESS")
    assert.strictEqual(res.httpStatus, 200)
    assert.strictEqual(res.safeUpstreamStatus, "authorized")

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.bodyStatus, "authorized")
    assert.strictEqual(parsed.failureKind, "SUCCESS")
  })

  test("3. HTTP 200 + unexpected status / invalid shape", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "custom_unrecognized_status_payload",
          random_field: "unexpected"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "INVALID_RESPONSE_SHAPE")
    assert.strictEqual(res.httpStatus, 200)
    assert.strictEqual(res.safeUpstreamStatus, "UNEXPECTED_VALUE")

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.bodyStatus, "UNEXPECTED_VALUE")
    assert.strictEqual(parsed.failureKind, "INVALID_RESPONSE_SHAPE")
    assert.ok(!diagLog.includes("custom_unrecognized_status_payload"), "Must not leak raw unrecognized status")
  })

  test("4. HTTP 401 + oauth_session_invalid", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "unauthorized",
          error: "oauth_session_invalid"
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "HTTP_NON_200")
    assert.strictEqual(res.httpStatus, 401)
    assert.strictEqual(res.safeUpstreamStatus, "unauthorized")
    assert.strictEqual(res.safeUpstreamError, "oauth_session_invalid")

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, 401)
    assert.strictEqual(parsed.responseOk, false)
    assert.strictEqual(parsed.bodyStatus, "unauthorized")
    assert.strictEqual(parsed.bodyError, "oauth_session_invalid")
    assert.strictEqual(parsed.failureKind, "HTTP_NON_200")
  })

  test("5. HTTP 403 + denied", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "denied",
          error: "no_effective_access"
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "HTTP_NON_200")
    assert.strictEqual(res.httpStatus, 403)
    assert.strictEqual(res.safeUpstreamStatus, "denied")
    assert.strictEqual(res.safeUpstreamError, "no_effective_access")

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, 403)
    assert.strictEqual(parsed.bodyStatus, "denied")
    assert.strictEqual(parsed.bodyError, "no_effective_access")
    assert.strictEqual(parsed.failureKind, "HTTP_NON_200")
  })

  test("6. HTTP 500 internal error", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "error",
          error: "internal_error"
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "HTTP_NON_200")
    assert.strictEqual(res.httpStatus, 500)
    assert.strictEqual(res.safeUpstreamStatus, "error")
    assert.strictEqual(res.safeUpstreamError, "internal_error")

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, 500)
    assert.strictEqual(parsed.failureKind, "HTTP_NON_200")
  })

  test("7. invalid / non-JSON response", async () => {
    globalThis.fetch = async () => {
      return new Response(
        "<html><body>502 Bad Gateway: cloudflare html error page</body></html>",
        { status: 502, headers: { "Content-Type": "text/html" } }
      )
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "JSON_PARSE_ERROR")
    assert.strictEqual(res.httpStatus, 502)

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, 502)
    assert.strictEqual(parsed.jsonParsed, false)
    assert.strictEqual(parsed.failureKind, "JSON_PARSE_ERROR")
    assert.ok(!diagLog.includes("<html>"), "Raw HTML body must NOT be logged")
  })

  test("8. network / fetch rejection", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:443")
    }

    const res = await callMaftahResolveEntry("dummy_token")
    assert.strictEqual(res.success, false)
    assert.strictEqual(res.failureKind, "NETWORK_ERROR")
    assert.strictEqual(res.httpStatus, null)

    const diagLog = loggedMessages.find(m => m.includes("[NEXORA_MAFTAH_DIAG resolver_result]"))
    assert.ok(diagLog)
    const parsed = JSON.parse(diagLog.replace("[NEXORA_MAFTAH_DIAG resolver_result]", "").trim())
    assert.strictEqual(parsed.httpStatus, null)
    assert.strictEqual(parsed.responseOk, null)
    assert.strictEqual(parsed.jsonParsed, false)
    assert.strictEqual(parsed.failureKind, "NETWORK_ERROR")
    assert.ok(!diagLog.includes("ECONNREFUSED"), "Raw error exception details must not leak")
  })

  test("9. no token or secret leakage in diagnostics", async () => {
    const sensitiveToken = "super_secret_access_token_123456789_xyz"
    const sensitiveOrgId = "7433026d-18b3-4cbc-896f-6c917c1dd6eb"

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          status: "denied",
          error: "no_effective_access",
          secret_key_leaked: "do_not_log_this"
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    await callMaftahResolveEntry(sensitiveToken, sensitiveOrgId)

    for (const log of loggedMessages) {
      assert.ok(!log.includes(sensitiveToken), "Access token must not appear in any log")
      assert.ok(!log.includes(sensitiveOrgId), "Organization UUID must not appear in diagnostic log")
      assert.ok(!log.includes("do_not_log_this"), "Arbitrary response keys must not appear in diagnostic log")
    }
  })

  test("10. current redirect behavior remains unchanged on resolver failure", () => {
    // Assert helper sanitizers strictly enforce expected allowlists
    assert.strictEqual(sanitizeSafeBodyStatus("organization_selection_required"), "organization_selection_required")
    assert.strictEqual(sanitizeSafeBodyStatus("authorized"), "authorized")
    assert.strictEqual(sanitizeSafeBodyStatus("arbitrary_status"), "UNEXPECTED_VALUE")
    assert.strictEqual(sanitizeSafeBodyError("oauth_session_invalid"), "oauth_session_invalid")
    assert.strictEqual(sanitizeSafeBodyError("arbitrary_error_code"), "UNEXPECTED_VALUE")
  })
})
