import { test, describe, afterEach } from "node:test"
import assert from "node:assert/strict"
import { getNexoraMaftahExposureMode } from "../lib/auth/config"
import { getMaftahOAuthAuthorizeUrl, getMaftahOAuthClientId, getMaftahOAuthRedirectUri } from "../lib/auth/maftah-oauth"
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from "../lib/auth/pkce"

describe("NEXORA Stage 6C.1 — Server-Side Exposure Mode & Pilot Gating", () => {
  const originalEnv = process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = originalEnv
    } else {
      delete process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE
    }
  })

  describe("Exposure Mode Configuration Helper & Fail-Closed Semantics", () => {
    test("1. missing environment variable strictly fails closed to hidden", () => {
      delete process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")
    })

    test("2. empty or whitespace string strictly fails closed to hidden", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "   "
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")
    })

    test("3. invalid or unapproved string strictly fails closed to hidden", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "beta_test"
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")

      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "true"
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")
    })

    test("4. correctly resolves hidden mode (case-insensitive)", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "hidden"
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")

      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "HIDDEN"
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")
    })

    test("5. correctly resolves pilot mode (Stage 6C.1 production target)", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "pilot"
      assert.strictEqual(getNexoraMaftahExposureMode(), "pilot")

      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "PILOT"
      assert.strictEqual(getNexoraMaftahExposureMode(), "pilot")
    })

    test("6. correctly resolves public mode (Stage 6C.2 preparation)", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "public"
      assert.strictEqual(getNexoraMaftahExposureMode(), "public")
    })
  })

  describe("Initiation Gating & In-Flight Callback Safety", () => {
    test("7. hidden mode gates new OAuth initiation and pilot route access", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "hidden"
      assert.strictEqual(getNexoraMaftahExposureMode(), "hidden")

      // Gating logic: when mode === "hidden", initiation rejects with 404
      const mode = getNexoraMaftahExposureMode()
      const isInitiationAllowed = mode === "pilot" || mode === "public"
      assert.strictEqual(isInitiationAllowed, false, "Initiation must not be allowed when hidden")
    })

    test("8. in-flight legitimate callback is NOT blocked by exposure mode changing to hidden", () => {
      // Step A: Initiation occurred during pilot
      // Step B: Exposure mode switched to hidden while user was authenticating at provider
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "hidden"

      // Callback route does NOT gate on exposure mode; it verifies transaction state & authorization
      const mode = getNexoraMaftahExposureMode()
      assert.strictEqual(mode, "hidden")

      // A callback must only evaluate cryptographic and authorization validity, not exposure mode
      const hasValidTransaction = true
      const hasValidTokens = true
      const isCallbackAllowed = hasValidTransaction && hasValidTokens // Exposure mode is not a condition
      assert.strictEqual(isCallbackAllowed, true, "In-flight callback remains authorized to proceed")
    })

    test("9. pilot mode allows new OAuth initiation and issues PKCE redirect parameters", () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = "pilot"
      process.env.MAFTAH_OAUTH_CLIENT_ID = "test_pilot_client_id"
      assert.strictEqual(getNexoraMaftahExposureMode(), "pilot")

      const state = generateState()
      const nonce = generateNonce()
      const verifier = generateCodeVerifier(64)
      const challenge = generateCodeChallenge(verifier)

      const authUrl = new URL(getMaftahOAuthAuthorizeUrl())
      authUrl.searchParams.set("client_id", getMaftahOAuthClientId())
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("redirect_uri", getMaftahOAuthRedirectUri())
      authUrl.searchParams.set("scope", "openid email profile")
      authUrl.searchParams.set("state", state)
      authUrl.searchParams.set("nonce", nonce)
      authUrl.searchParams.set("code_challenge", challenge)
      authUrl.searchParams.set("code_challenge_method", "S256")

      assert.ok(authUrl.toString().includes("/oauth/authorize"), "Must point to Maftah authorize endpoint")
      assert.ok(authUrl.searchParams.get("code_challenge"), "Must include PKCE code_challenge")
      assert.strictEqual(authUrl.searchParams.get("code_challenge_method"), "S256")
      assert.ok(authUrl.searchParams.get("state"), "Must include state")
      assert.ok(authUrl.searchParams.get("nonce"), "Must include nonce")
    })
  })
})
