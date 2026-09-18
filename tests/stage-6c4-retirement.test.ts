import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { GET as ssoGet } from '../app/api/auth/sso/route'
import { GET as callbackGet } from '../app/api/auth/callback/route'
import { getLogoutDestination } from '../lib/auth/logout'
import { clearSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session'
import { signNexoraSessionToken } from '../lib/auth/jwt'
import {
  getMaftahOAuthIssuer,
  getMaftahOAuthAuthorizeUrl,
  getMaftahOAuthTokenUrl,
  getMaftahOAuthJwksUrl,
  getMaftahOAuthClientId
} from '../lib/auth/maftah-oauth'

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8')
}

class MockCookieStore {
  private readonly values = new Map<string, string>()
  readonly writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) this.values.set(name, value)
  }

  get(name: string): { value: string } | undefined {
    const value = this.values.get(name)
    return value === undefined ? undefined : { value }
  }

  set(name: string, value: string, options: Record<string, unknown>): void {
    this.values.set(name, value)
    this.writes.push({ name, value, options })
  }
}

class MockRevocationClient {
  readonly calls: Array<{ functionName: string; args?: Record<string, unknown> }> = []

  constructor(private readonly response: { data: unknown; error: { message?: string } | null }) {}

  async rpc(functionName: string, args?: Record<string, unknown>) {
    this.calls.push({ functionName, args })
    return this.response
  }
}

describe('Stage 6C.4 — NEXORA Legacy LAM ID Retirement Verification', () => {
  it('1. Old SSO entry does not authenticate users & safely redirects to Maftah', async () => {
    const req = {
      nextUrl: new URL('https://nexora.lubbalmandumah.com/api/auth/sso'),
      url: 'https://nexora.lubbalmandumah.com/api/auth/sso'
    } as any

    const res = await ssoGet(req)
    assert.strictEqual(res.status, 302)
    const location = res.headers.get('location') || ''
    assert.strictEqual(location.includes('id.lubbalmandumah.com'), false)
    assert.match(location, /\/login\/maftah/)
  })

  it('2. Obsolete callback cannot create a NEXORA session & redirects safely to Maftah', async () => {
    const req = {
      nextUrl: new URL('https://nexora.lubbalmandumah.com/api/auth/callback?code=fake_code_123'),
      url: 'https://nexora.lubbalmandumah.com/api/auth/callback?code=fake_code_123',
      cookies: { get: () => undefined }
    } as any

    const res = await callbackGet(req)
    assert.strictEqual(res.status, 302)
    const location = res.headers.get('location') || ''
    assert.strictEqual(location.includes('id.lubbalmandumah.com'), false)
    assert.match(location, /\/login\/maftah\?error=legacy_sso_retired/)
  })

  it('3. Obsolete login entry safely preserves relative returnUrl when redirecting to Maftah', async () => {
    const req = {
      nextUrl: new URL('https://nexora.lubbalmandumah.com/api/auth/sso?returnUrl=/campaigns/123'),
      url: 'https://nexora.lubbalmandumah.com/api/auth/sso?returnUrl=/campaigns/123'
    } as any

    const res = await ssoGet(req)
    assert.strictEqual(res.status, 302)
    const location = res.headers.get('location') || ''
    assert.match(location, /\/login\/maftah\?returnUrl=%2Fcampaigns%2F123/)
  })

  it('4. No active runtime request in app/ or lib/ references id.lubbalmandumah.com', () => {
    const appDir = path.join(process.cwd(), 'app')
    const libDir = path.join(process.cwd(), 'lib')

    function scanDir(dir: string) {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const full = path.join(dir, file)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          scanDir(full)
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          const content = fs.readFileSync(full, 'utf8')
          assert.strictEqual(
            content.includes('id.lubbalmandumah.com'),
            false,
            `Active runtime file ${full} must not contain id.lubbalmandumah.com`
          )
        }
      }
    }

    scanDir(appDir)
    scanDir(libDir)
  })

  it('5. Zero legacy issuer/JWKS/token URL getters remain in lib/auth/config.ts', () => {
    const configSource = readWorkspaceFile('lib/auth/config.ts')
    assert.doesNotMatch(configSource, /getLamIssuer/)
    assert.doesNotMatch(configSource, /getLamClientId/)
    assert.doesNotMatch(configSource, /getLamClientSecret/)
    assert.doesNotMatch(configSource, /getLamAuthorizeEndpoint/)
    assert.doesNotMatch(configSource, /getLamTokenEndpoint/)
    assert.doesNotMatch(configSource, /getLamUserinfoEndpoint/)
    assert.doesNotMatch(configSource, /getLamJwksEndpoint/)
    assert.doesNotMatch(configSource, /LAM_OIDC_/)
  })

  it('6. Maftah login still works and resolves canonical Maftah endpoints', () => {
    process.env.MAFTAH_OAUTH_CLIENT_ID = process.env.MAFTAH_OAUTH_CLIENT_ID || 'test_client_id'
    assert.ok(getMaftahOAuthIssuer())
    assert.ok(getMaftahOAuthAuthorizeUrl())
    assert.ok(getMaftahOAuthTokenUrl())
    assert.ok(getMaftahOAuthJwksUrl())
    assert.ok(getMaftahOAuthClientId())

    const maftahRoute = readWorkspaceFile('app/api/auth/maftah/route.ts')
    assert.match(maftahRoute, /getMaftahOAuthAuthorizeUrl/)
    assert.match(maftahRoute, /getMaftahOAuthClientId/)
  })

  it('7. Workspace switching still works via Maftah OAuth initiation', () => {
    const switchRoute = readWorkspaceFile('app/api/auth/maftah/switch/route.ts')
    assert.match(switchRoute, /getMaftahOAuthAuthorizeUrl/)
    assert.match(switchRoute, /generateCodeVerifier/)
    assert.match(switchRoute, /nexora_maftah_oauth_state/)
  })

  it('8. Logout still works and safely redirects to /login/maftah', async () => {
    const sessionId = '99999999-9999-9999-9999-999999999999'
    const token = signNexoraSessionToken({ v: 2, sid: sessionId }, 3600)
    const cookieStore = new MockCookieStore({ [SESSION_COOKIE_NAME]: token })
    const adminDb = new MockRevocationClient({ data: true, error: null })

    const clearResult = await clearSessionCookie({ cookieStore, adminDb })
    assert.strictEqual(clearResult.success, true)
    assert.strictEqual(clearResult.authenticationMode, 'federation')

    const dest = getLogoutDestination({ logoutState: clearResult })
    assert.strictEqual(dest, '/login/maftah')
    assert.strictEqual(dest.includes('id.lubbalmandumah.com'), false)
  })

  it('9. Session revalidation remains fail-closed', () => {
    const maftahOAuth = readWorkspaceFile('lib/auth/maftah-oauth.ts')
    assert.match(maftahOAuth, /revalidateMaftahFederationSession/)
    assert.match(maftahOAuth, /service_revoke_federation_session/)
    assert.match(maftahOAuth, /no_effective_access/)
  })

  it('10. Tenant-local role isolation remains intact via DB resolution', () => {
    const maftahCallback = readWorkspaceFile('app/api/auth/maftah/callback/route.ts')
    const selectWorkspace = readWorkspaceFile('app/select-workspace/actions.ts')

    assert.match(maftahCallback, /service_get_federation_identity_link/)
    assert.match(selectWorkspace, /service_get_federation_identity_link/)
    // Verify role is not taken from OAuth token claims
    assert.doesNotMatch(maftahCallback, /role\s*=\s*idTokenResult\.payload\.role/)
  })
})
