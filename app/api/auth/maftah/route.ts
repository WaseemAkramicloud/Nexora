import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from "@/lib/auth/pkce"
import { getNexoraMaftahExposureMode } from "@/lib/auth/config"
import { logAuthOperationalEvent } from "@/lib/auth/observability"
import {
  getMaftahOAuthAuthorizeUrl,
  getMaftahOAuthClientId,
  getMaftahOAuthRedirectUri
} from "@/lib/auth/maftah-oauth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // 1. Exposure Mode Gate (Stage 6C.1)
  // Initiation is blocked when exposure mode is "hidden"
  const exposureMode = getNexoraMaftahExposureMode()
  if (exposureMode === "hidden") {
    return new NextResponse("Not Found", { status: 404 })
  }

  const correlationId = crypto.randomUUID()
  const state = generateState()
  const nonce = generateNonce()
  const codeVerifier = generateCodeVerifier(64)
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // 2. Log Maftah Login Started Event (Best-Effort, Safe Allowlist)
  await logAuthOperationalEvent({
    eventType: "maftah_login_started",
    provider: "maftah",
    outcome: "pending",
    correlationId,
    metadata: {
      flow: "pilot"
    }
  })

  const cookieStore = cookies()
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60
  }

  cookieStore.set("nexora_maftah_oauth_state", state, cookieOptions)
  cookieStore.set("nexora_maftah_code_verifier", codeVerifier, cookieOptions)
  cookieStore.set("nexora_maftah_nonce", nonce, cookieOptions)
  cookieStore.set("nexora_maftah_corr_id", correlationId, cookieOptions)

  const authUrl = new URL(getMaftahOAuthAuthorizeUrl())
  authUrl.searchParams.set("client_id", getMaftahOAuthClientId())
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("redirect_uri", getMaftahOAuthRedirectUri())
  authUrl.searchParams.set("scope", "openid email profile")
  authUrl.searchParams.set("state", state)
  authUrl.searchParams.set("nonce", nonce)
  authUrl.searchParams.set("code_challenge", codeChallenge)
  authUrl.searchParams.set("code_challenge_method", "S256")

  return NextResponse.redirect(authUrl.toString(), 302)
}
