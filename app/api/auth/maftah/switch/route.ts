import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from "@/lib/auth/pkce"
import { getNexoraMaftahExposureMode } from "@/lib/auth/config"
import { clearSessionCookie } from "@/lib/auth/session"
import { logAuthOperationalEvent } from "@/lib/auth/observability"
import {
  getMaftahOAuthAuthorizeUrl,
  getMaftahOAuthClientId,
  getMaftahOAuthRedirectUri
} from "@/lib/auth/maftah-oauth"

export const dynamic = "force-dynamic"

/**
 * Safe Workspace Switching Endpoint (Stage 6C.2)
 *
 * Required trust flow:
 * current NEXORA session
 * -> user chooses Switch workspace
 * -> terminate / revoke current NEXORA federation session
 * -> initiate a fresh Maftah OAuth / resolver authorization round-trip
 * -> new one-time login transaction if organization selection is required
 * -> /select-workspace
 * -> selected organization reauthorized with Maftah
 * -> new NEXORA federation session
 * -> selected tenant
 *
 * Never trusts client-supplied tenant ID or local state.
 */
async function handleSwitchWorkspace(req: NextRequest) {
  const exposureMode = getNexoraMaftahExposureMode()
  if (exposureMode === "hidden") {
    return new NextResponse("Not Found", { status: 404 })
  }

  // 1. Safely revoke/terminate current local federation session and clear cookies
  const logoutState = await clearSessionCookie()

  const correlationId = crypto.randomUUID()
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier(64)
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // 2. Log Operational Event
  await logAuthOperationalEvent({
    eventType: "maftah_switch_workspace_started",
    provider: "maftah",
    outcome: "pending",
    correlationId,
    sessionId: logoutState.federationSessionId || null,
    metadata: {
      flow: "switch_workspace"
    }
  })

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60
  }

  const cookieStore = cookies()
  cookieStore.set("nexora_maftah_oauth_state", state, cookieOptions)
  cookieStore.set("nexora_maftah_code_verifier", codeVerifier, cookieOptions)
  cookieStore.set("nexora_maftah_nonce", nonce, cookieOptions)
  cookieStore.set("nexora_maftah_corr_id", correlationId, cookieOptions)

  // 3. Initiate fresh Maftah OAuth round-trip
  const authUrl = new URL(getMaftahOAuthAuthorizeUrl())
  authUrl.searchParams.set("client_id", getMaftahOAuthClientId())
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("redirect_uri", getMaftahOAuthRedirectUri())
  authUrl.searchParams.set("scope", "openid email profile")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("nonce", nonce)
  authUrl.searchParams.set("code_challenge", codeChallenge)
  authUrl.searchParams.set("code_challenge_method", "S256")

  const response = NextResponse.redirect(authUrl.toString(), 302)
  response.cookies.set("nexora_maftah_oauth_state", state, cookieOptions)
  response.cookies.set("nexora_maftah_code_verifier", codeVerifier, cookieOptions)
  response.cookies.set("nexora_maftah_nonce", nonce, cookieOptions)
  response.cookies.set("nexora_maftah_corr_id", correlationId, cookieOptions)

  return response
}

export async function GET(req: NextRequest) {
  return handleSwitchWorkspace(req)
}

export async function POST(req: NextRequest) {
  return handleSwitchWorkspace(req)
}
