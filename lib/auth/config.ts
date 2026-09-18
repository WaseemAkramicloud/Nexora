/**
 * NEXORA OIDC & Environment Configuration Engine
 * Fail-closed production endpoint resolution. Production mode strictly rejects localhost fallback.
 */

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getNexoraBaseUrl(requestOrigin?: string): string {
  const envUrl = process.env.NEXORA_BASE_URL?.trim()

  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://nexora.lubbalmandumah.com'
    }
    return envUrl
  }

  if (isProductionEnv()) {
    return 'https://nexora.lubbalmandumah.com'
  }

  if (requestOrigin) {
    if (isProductionEnv() && (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1'))) {
      return 'https://nexora.lubbalmandumah.com'
    }
    return requestOrigin
  }

  return 'http://localhost:3001'
}

export type MaftahExposureMode = "hidden" | "pilot" | "public"

/**
 * Authoritative Server-Side Maftah Login Exposure Mode Helper (Stage 6C.2)
 *
 * Allowed values:
 * - "hidden": No Maftah login entry point exposed. Initiation routes (/login/maftah, /api/auth/maftah, /api/auth/maftah/switch) return 404.
 * - "pilot": Dedicated /login/maftah route is available by direct URL.
 * - "public": Normal public login experience uses Maftah authentication as primary visible entrypoint.
 *
 * Fail-closed behavior: Any missing, empty, or invalid value strictly defaults to "hidden".
 */
export function getNexoraMaftahExposureMode(): MaftahExposureMode {
  const envVal = process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE?.trim().toLowerCase()

  if (envVal === "pilot") {
    return "pilot"
  }

  if (envVal === "public") {
    return "public"
  }

  if (envVal === "hidden") {
    return "hidden"
  }

  // Fail-closed default for any invalid or missing configuration
  return "hidden"
}

