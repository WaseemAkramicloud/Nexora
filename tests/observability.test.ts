import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { logAuthOperationalEvent } from "../lib/auth/observability"

describe("NEXORA Stage 6C.1 — Auth Operational Observability & Metadata Allowlist", () => {
  test("1. successfully logs valid operational event with allowlisted metadata", async () => {
    let loggedJson: any = null
    const originalLog = console.log
    console.log = (prefix: string, jsonStr: string) => {
      if (prefix === "[AUTH_OPERATIONAL_EVENT]") {
        loggedJson = JSON.parse(jsonStr)
      }
    }

    try {
      await logAuthOperationalEvent({
        eventType: "maftah_login_started",
        provider: "maftah",
        outcome: "pending",
        correlationId: "corr-12345-test",
        metadata: {
          flow: "pilot",
          latency_ms: 45
        }
      })

      assert.ok(loggedJson !== null)
      assert.strictEqual(loggedJson.event_type, "maftah_login_started")
      assert.strictEqual(loggedJson.provider, "maftah")
      assert.strictEqual(loggedJson.outcome, "pending")
      assert.strictEqual(loggedJson.correlation_id, "corr-12345-test")
      assert.strictEqual(loggedJson.metadata.flow, "pilot")
      assert.strictEqual(loggedJson.metadata.latency_ms, 45)
    } finally {
      console.log = originalLog
    }
  })

  test("2. strictly discards forbidden fields (tokens, secrets, passwords, cookies, ip_address)", async () => {
    let loggedJson: any = null
    const originalLog = console.log
    console.log = (prefix: string, jsonStr: string) => {
      if (prefix === "[AUTH_OPERATIONAL_EVENT]") {
        loggedJson = JSON.parse(jsonStr)
      }
    }

    try {
      const maliciousInput: any = {
        eventType: "maftah_callback_failed",
        provider: "maftah",
        outcome: "failure",
        safeErrorCode: "token_exchange_failed",
        access_token: "secret_access_token_12345",
        refresh_token: "secret_refresh_token_67890",
        client_secret: "super_secret_client_key",
        password: "user_plaintext_password",
        ip_address: "192.168.1.1",
        reason: "free form exception: stack trace at line 42 with token eyJ...",
        metadata: {
          flow: "pilot",
          raw_token: "secret_token_in_meta",
          authorization_code: "auth_code_123",
          pkce_verifier: "verifier_secret_xyz"
        }
      }

      await logAuthOperationalEvent(maliciousInput)

      assert.ok(loggedJson !== null)
      // Check root properties
      assert.strictEqual(loggedJson.access_token, undefined)
      assert.strictEqual(loggedJson.refresh_token, undefined)
      assert.strictEqual(loggedJson.client_secret, undefined)
      assert.strictEqual(loggedJson.password, undefined)
      assert.strictEqual(loggedJson.ip_address, undefined)
      assert.strictEqual(loggedJson.reason, undefined)

      // Check metadata allowlist
      assert.strictEqual(loggedJson.metadata.flow, "pilot")
      assert.strictEqual(loggedJson.metadata.raw_token, undefined)
      assert.strictEqual(loggedJson.metadata.authorization_code, undefined)
      assert.strictEqual(loggedJson.metadata.pkce_verifier, undefined)
    } finally {
      console.log = originalLog
    }
  })

  test("3. invalid UUIDs are sanitized to null to prevent malformed data insertion", async () => {
    let loggedJson: any = null
    const originalLog = console.log
    console.log = (prefix: string, jsonStr: string) => {
      if (prefix === "[AUTH_OPERATIONAL_EVENT]") {
        loggedJson = JSON.parse(jsonStr)
      }
    }

    try {
      await logAuthOperationalEvent({
        eventType: "maftah_session_created",
        provider: "maftah",
        outcome: "success",
        tenantId: "not-a-valid-uuid",
        externalOrgId: "7433026d-18b3-4cbc-896f-6c917c1dd6eb", // valid
        sessionId: "invalid_session_id",
        subject: "24b87f7f-f077-4914-9569-4074a1556c62" // valid
      })

      assert.ok(loggedJson !== null)
      assert.strictEqual(loggedJson.tenant_id, null)
      assert.strictEqual(loggedJson.external_org_id, "7433026d-18b3-4cbc-896f-6c917c1dd6eb")
      assert.strictEqual(loggedJson.session_id, null)
      assert.strictEqual(loggedJson.subject, "24b87f7f-f077-4914-9569-4074a1556c62")
    } finally {
      console.log = originalLog
    }
  })

  test("4. telemetry execution failure NEVER throws or interrupts authentication caller", async () => {
    const originalWarn = console.warn
    let warnEmitted = false
    console.warn = () => { warnEmitted = true }

    try {
      // Passing invalid data or forcing DB error should not throw
      const result = await logAuthOperationalEvent(null as any)
      assert.strictEqual(result, null)
      assert.strictEqual(warnEmitted, true)
    } finally {
      console.warn = originalWarn
    }
  })
})
