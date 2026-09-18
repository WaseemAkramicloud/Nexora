import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getLocalizedAuthError } from '../lib/i18n/translations'
import { getLogoutDestination } from '../lib/auth/logout'
import {
  isFederationSessionUsable,
  SESSION_COOKIE_NAME,
  clearSessionCookie
} from '../lib/auth/session'
import { signNexoraSessionToken, verifyNexoraSessionToken } from '../lib/auth/jwt'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

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
  sessionStatus: 'active' | 'revoked' = 'active'
  credentialsPresent = true

  constructor(private readonly response: { data: unknown; error: { message?: string } | null }) {}

  async rpc(functionName: string, args?: Record<string, unknown>) {
    this.calls.push({ functionName, args })
    if (functionName === 'service_revoke_federation_session' && !this.response.error && this.response.data === true) {
      this.sessionStatus = 'revoked'
      this.credentialsPresent = false
    }
    return this.response
  }
}

describe('NEXORA Stage 6C.3 — Maftah Default & Legacy Fallback Hardening', () => {
  describe('1. Maftah Default Login & Route Convergence', () => {
    it('every normal authentication entrypoint directs users to Maftah', () => {
      const rootPage = read('app/page.tsx')
      const unauthorizedPage = read('app/auth/unauthorized/page.tsx')
      const workspacePage = read('app/select-workspace/page.tsx')

      assert.match(rootPage, /href="\/login\/maftah"/)
      assert.match(unauthorizedPage, /href="\/login\/maftah"/)
      assert.match(workspacePage, /href="\/login\/maftah"/)
    })

    it('no normal customer route exposes legacy LAM ID entrypoints', () => {
      const rootPage = read('app/page.tsx')
      const loginClient = read('app/login/maftah/pilot-client.tsx')
      const unauthorizedPage = read('app/auth/unauthorized/page.tsx')

      for (const source of [rootPage, loginClient, unauthorizedPage]) {
        assert.doesNotMatch(source, /href="\/api\/auth\/sso"/)
        assert.doesNotMatch(source, /id\.lubbalmandumah\.com/)
      }
    })
  })

  describe('2. Legacy Rollback Isolation', () => {
    it('legacy routes are explicitly tagged as rollback-only paths', () => {
      const legacySso = read('app/api/auth/sso/route.ts')
      const legacyCallback = read('app/api/auth/callback/route.ts')
      const logoutHelper = read('lib/auth/logout.ts')

      assert.match(legacySso, /legacy rollback-only path/i)
      assert.match(legacyCallback, /legacy rollback-only path/i)
      assert.match(logoutHelper, /legacy rollback-only path/i)
    })

    it('normal Maftah logout never sends users to legacy LAM ID', () => {
      const destination = getLogoutDestination({
        logoutState: { success: true, authenticationMode: 'federation' },
        legacyGlobalLogoutRequested: false,
        legacyGlobalLogoutUrl: 'https://id.lubbalmandumah.com/api/sso/logout'
      })
      assert.strictEqual(destination, '/login/maftah')
    })
  })

  describe('3. Account Control & Workspace Identification', () => {
    it('authenticated account control displays user name, role, current workspace, and switch workspace action', () => {
      const controlSource = read('components/AccountSessionControl.tsx')

      assert.match(controlSource, /displayName/)
      assert.match(controlSource, /roleLabel/)
      assert.match(controlSource, /workspaceName/)
      assert.match(controlSource, /switchWorkspaceLabel/)
      assert.match(controlSource, /action="\/api\/auth\/maftah\/switch"/)
      assert.match(controlSource, /action="\/api\/auth\/logout"/)
      assert.doesNotMatch(controlSource, /\/api\/auth\/sso/)
      assert.doesNotMatch(controlSource, /id\.lubbalmandumah\.com/)
    })

    it('workspace switching uses fresh Maftah OAuth authorization and revokes old session', async () => {
      const oldSessionId = '44444444-4444-4444-4444-444444444444'
      const oldToken = signNexoraSessionToken({ v: 2, sid: oldSessionId }, 60 * 60)
      const cookieStore = new MockCookieStore({ [SESSION_COOKIE_NAME]: oldToken })
      const adminDb = new MockRevocationClient({ data: true, error: null })

      const clearResult = await clearSessionCookie({ cookieStore, adminDb })
      assert.strictEqual(clearResult.success, true)
      assert.strictEqual(clearResult.federationSessionId, oldSessionId)
      assert.strictEqual(adminDb.sessionStatus, 'revoked')

      const switchRoute = read('app/api/auth/maftah/switch/route.ts')
      assert.match(switchRoute, /clearSessionCookie/)
      assert.match(switchRoute, /getMaftahOAuthAuthorizeUrl/)
      assert.match(switchRoute, /maftah_switch_workspace_started/)
    })
  })

  describe('4. Session Recovery & Fail-Closed Invariants', () => {
    it('evaluates federation session usability fail-closed across all revocation states', () => {
      // Active and healthy
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'active' }), true)

      // Expired session
      assert.strictEqual(isFederationSessionUsable({ status: 'expired', membership_status: 'active' }), false)

      // Revoked federation session
      assert.strictEqual(isFederationSessionUsable({ status: 'revoked', membership_status: 'active' }), false)

      // Suspended local membership
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'suspended' }), false)

      // Revoked local membership
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'revoked' }), false)

      // Inactive local membership
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'inactive' }), false)

      // Null or invalid session object
      assert.strictEqual(isFederationSessionUsable(null), false)
      assert.strictEqual(isFederationSessionUsable(undefined), false)
      assert.strictEqual(isFederationSessionUsable({}), false)
    })

    it('customer-facing error codes remain fully localized without leaking machine details', () => {
      const errorCodes = [
        'access_not_authorized',
        'transaction_expired',
        'workspace_not_provisioned',
        'membership_not_active',
        'organization_access_denied',
        'session_creation_failed',
        'session_revocation_failed',
        'credential_decryption_failed',
        'oauth_session_invalid'
      ]

      for (const code of errorCodes) {
        const enMsg = getLocalizedAuthError(code, 'en')
        const frMsg = getLocalizedAuthError(code, 'fr')
        const arMsg = getLocalizedAuthError(code, 'ar')

        assert.ok(enMsg && enMsg.length > 0)
        assert.ok(frMsg && frMsg.length > 0)
        assert.ok(arMsg && arMsg.length > 0)

        // Must not expose raw code
        assert.strictEqual(enMsg.includes(code), false)
        assert.strictEqual(frMsg.includes(code), false)
        assert.strictEqual(arMsg.includes(code), false)
      }
    })
  })
})
