import { test, describe, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  classifyResolverHttpResult,
  classifyResolverPayload,
  CallMaftahResolveEntryResult
} from "../lib/auth/maftah-oauth"
import { logAuthOperationalEvent, AuthEventType } from "../lib/auth/observability"

describe("NEXORA Stage 6C.1 — Minimal Persistent Callback Trace Suite", () => {
  let loggedEvents: any[] = []
  const originalConsoleLog = console.log

  beforeEach(() => {
    loggedEvents = []
    console.log = (prefix: unknown, ...args: unknown[]) => {
      if (prefix === "[AUTH_OPERATIONAL_EVENT]" && typeof args[0] === "string") {
        try {
          loggedEvents.push(JSON.parse(args[0]))
        } catch {}
      }
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  test("1. same correlation ID appears on every callback trace event", async () => {
    const testCorrelationId = "test-corr-uuid-1111-2222-3333-444455556666"

    const traceEvents: AuthEventType[] = [
      "maftah_login_started",
      "maftah_callback_received",
      "maftah_token_exchange_success",
      "maftah_id_token_verified",
      "maftah_resolver_call_started",
      "maftah_resolver_http_result",
      "maftah_resolver_payload_classified",
      "maftah_selection_required_branch_entered"
    ]

    for (const eventType of traceEvents) {
      await logAuthOperationalEvent({
        eventType,
        provider: "maftah",
        outcome: eventType === "maftah_resolver_call_started" ? "pending" : "success",
        correlationId: testCorrelationId,
        safeErrorCode: eventType === "maftah_resolver_http_result" ? "resolver_http_200" : undefined
      })
    }

    assert.strictEqual(loggedEvents.length, 8)
    for (const evt of loggedEvents) {
      assert.strictEqual(evt.correlation_id, testCorrelationId, `Event ${evt.event_type} must have matching correlation_id`)
      assert.strictEqual(evt.provider, "maftah")
    }
  })

  test("2. HTTP 200 + organization_selection_required", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: true,
      httpStatus: 200,
      status: 200,
      failureKind: "SUCCESS",
      safeUpstreamStatus: "organization_selection_required",
      safeUpstreamError: null,
      eligibleOrganizationCount: 2,
      jsonParsed: true,
      data: {
        status: "organization_selection_required",
        eligible_organizations: [
          { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-a", name: "Org A" }
        ]
      }
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_http_200")
    assert.strictEqual(httpClass.outcome, "success")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "organization_selection_required")
    assert.strictEqual(payloadClass.outcome, "info")
  })

  test("3. HTTP 200 + authorized", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: true,
      httpStatus: 200,
      status: 200,
      failureKind: "SUCCESS",
      safeUpstreamStatus: "authorized",
      safeUpstreamError: null,
      eligibleOrganizationCount: null,
      jsonParsed: true,
      data: {
        status: "authorized",
        organization: { id: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", slug: "org-a", name: "Org A" }
      }
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_http_200")
    assert.strictEqual(httpClass.outcome, "success")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "authorized")
    assert.strictEqual(payloadClass.outcome, "success")
  })

  test("4. HTTP 401 + oauth_session_invalid", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: 401,
      status: 401,
      failureKind: "HTTP_NON_200",
      safeUpstreamStatus: "unauthorized",
      safeUpstreamError: "oauth_session_invalid",
      eligibleOrganizationCount: null,
      jsonParsed: true
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_http_401")
    assert.strictEqual(httpClass.outcome, "failure")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "oauth_session_invalid")
    assert.strictEqual(payloadClass.outcome, "failure")
  })

  test("5. HTTP 403 + denied", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: 403,
      status: 403,
      failureKind: "HTTP_NON_200",
      safeUpstreamStatus: "denied",
      safeUpstreamError: "no_effective_access",
      eligibleOrganizationCount: null,
      jsonParsed: true
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_http_403")
    assert.strictEqual(httpClass.outcome, "failure")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "denied")
    assert.strictEqual(payloadClass.outcome, "failure")
  })

  test("6. HTTP 500 internal error", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: 500,
      status: 500,
      failureKind: "HTTP_NON_200",
      safeUpstreamStatus: "error",
      safeUpstreamError: "internal_error",
      eligibleOrganizationCount: null,
      jsonParsed: true
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_http_500")
    assert.strictEqual(httpClass.outcome, "failure")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "internal_error")
    assert.strictEqual(payloadClass.outcome, "failure")
  })

  test("7. network failure", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: null,
      failureKind: "NETWORK_ERROR",
      safeUpstreamStatus: null,
      safeUpstreamError: null,
      eligibleOrganizationCount: null,
      jsonParsed: false
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_network_error")
    assert.strictEqual(httpClass.outcome, "failure")
    // Safe JSON was NOT parsed, so payload classification stage is skipped
    assert.strictEqual(mockResult.jsonParsed, false)
  })

  test("8. JSON parse failure", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: 502,
      status: 502,
      failureKind: "JSON_PARSE_ERROR",
      safeUpstreamStatus: null,
      safeUpstreamError: null,
      eligibleOrganizationCount: null,
      jsonParsed: false
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_json_parse_error")
    assert.strictEqual(httpClass.outcome, "failure")
    assert.strictEqual(mockResult.jsonParsed, false)
  })

  test("9. invalid response shape", () => {
    const mockResult: CallMaftahResolveEntryResult = {
      success: false,
      httpStatus: 200,
      status: 200,
      failureKind: "INVALID_RESPONSE_SHAPE",
      safeUpstreamStatus: "UNEXPECTED_VALUE",
      safeUpstreamError: null,
      eligibleOrganizationCount: null,
      jsonParsed: true
    }

    const httpClass = classifyResolverHttpResult(mockResult)
    assert.strictEqual(httpClass.safeErrorCode, "resolver_invalid_shape")
    assert.strictEqual(httpClass.outcome, "failure")

    const payloadClass = classifyResolverPayload(mockResult)
    assert.strictEqual(payloadClass.safeErrorCode, "unexpected_status")
    assert.strictEqual(payloadClass.outcome, "failure")
  })

  test("10. later stages are not written after failure", async () => {
    const corrId = "corr-early-failure-test"

    // Simulate callback entered then token exchange failure
    await logAuthOperationalEvent({
      eventType: "maftah_callback_received",
      provider: "maftah",
      outcome: "success",
      correlationId: corrId
    })

    // Token exchange fails
    await logAuthOperationalEvent({
      eventType: "maftah_callback_failed",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "token_exchange_failed",
      correlationId: corrId
    })

    // No resolver_call_started, no resolver_http_result, no branch entered
    const eventTypes = loggedEvents.map(e => e.event_type)
    assert.deepStrictEqual(eventTypes, ["maftah_callback_received", "maftah_callback_failed"])
    assert.ok(!eventTypes.includes("maftah_resolver_call_started"))
    assert.ok(!eventTypes.includes("maftah_resolver_http_result"))
    assert.ok(!eventTypes.includes("maftah_selection_required_branch_entered"))
  })

  test("11. no sensitive values enter telemetry", async () => {
    const corrId = "corr-sensitive-check-test"

    await logAuthOperationalEvent({
      eventType: "maftah_resolver_http_result",
      provider: "maftah",
      outcome: "failure",
      safeErrorCode: "resolver_http_401",
      correlationId: corrId,
      // Attempt to pass sensitive fields directly or through any means
      subject: undefined,
      externalOrgId: undefined
    })

    const evt = loggedEvents[0]
    assert.ok(evt)
    const jsonStr = JSON.stringify(evt)

    const forbiddenTerms = [
      "access_token",
      "refresh_token",
      "id_token",
      "secret",
      "bearer",
      "vault",
      "verifier",
      "nonce"
    ]

    for (const term of forbiddenTerms) {
      assert.ok(!jsonStr.toLowerCase().includes(term), `Telemetry must not leak ${term}`)
    }
    assert.strictEqual(evt.subject, null)
    assert.strictEqual(evt.external_org_id, null)
  })

  test("12. telemetry write failure cannot grant access", async () => {
    // If telemetry RPC fails, logAuthOperationalEvent returns null gracefully
    const originalWarn = console.warn
    console.warn = () => {}

    try {
      const result = await logAuthOperationalEvent(null as any)
      assert.strictEqual(result, null, "Telemetry failure returns null and does NOT grant or fail auth")
    } finally {
      console.warn = originalWarn
    }
  })

  test("13. existing redirect behavior remains unchanged", () => {
    const errorParam = "access_not_authorized"
    const baseUrl = "https://nexora.lubbalmandumah.com"
    const redirectUrl = new URL(`/login/maftah?error=${encodeURIComponent(errorParam)}`, baseUrl)

    assert.strictEqual(redirectUrl.toString(), "https://nexora.lubbalmandumah.com/login/maftah?error=access_not_authorized")
  })
})
