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

export function getNexoraCallbackUrl(requestOrigin?: string): string {
  const envCallback = process.env.NEXORA_CALLBACK_URL?.trim()

  if (envCallback) {
    if (isProductionEnv() && (envCallback.includes('localhost') || envCallback.includes('127.0.0.1'))) {
      return 'https://nexora.lubbalmandumah.com/api/auth/callback'
    }
    return envCallback
  }

  const baseUrl = getNexoraBaseUrl(requestOrigin)
  return `${baseUrl}/api/auth/callback`
}

export function getLamIssuer(): string {
  const envUrl = process.env.LAM_OIDC_ISSUER?.trim()
  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://id.lubbalmandumah.com'
    }
    return envUrl
  }
  return 'https://id.lubbalmandumah.com'
}

export function getLamClientId(): string {
  return process.env.LAM_CLIENT_ID?.trim() || 'lam_app_nexora'
}

export function getLamClientSecret(): string {
  return process.env.LAM_CLIENT_SECRET?.trim() || 'lam_secret_nexora_app_key_2026'
}

export function getLamAuthorizeEndpoint(): string {
  const envUrl = process.env.LAM_OIDC_AUTHORIZE_URL?.trim()
  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://id.lubbalmandumah.com/api/sso/authorize'
    }
    return envUrl
  }
  return `${getLamIssuer()}/api/sso/authorize`
}

export function getLamTokenEndpoint(): string {
  const envUrl = process.env.LAM_OIDC_TOKEN_URL?.trim()
  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://id.lubbalmandumah.com/api/sso/token'
    }
    return envUrl
  }
  return `${getLamIssuer()}/api/sso/token`
}

export function getLamUserinfoEndpoint(): string {
  const envUrl = process.env.LAM_OIDC_USERINFO_URL?.trim()
  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://id.lubbalmandumah.com/api/sso/userinfo'
    }
    return envUrl
  }
  return `${getLamIssuer()}/api/sso/userinfo`
}

export function getLamJwksEndpoint(): string {
  const envUrl = process.env.LAM_OIDC_JWKS_URL?.trim()
  if (envUrl) {
    if (isProductionEnv() && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return 'https://id.lubbalmandumah.com/.well-known/jwks.json'
    }
    return envUrl
  }
  return `${getLamIssuer()}/.well-known/jwks.json`
}
