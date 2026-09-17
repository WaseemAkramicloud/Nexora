import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  clearSessionCookie,
  isFederationSessionUsable,
  SESSION_COOKIE_NAME
} from '../lib/auth/session'
import { getLogoutDestination } from '../lib/auth/logout'
import { signNexoraSessionToken } from '../lib/auth/jwt'

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

describe('NEXORA Stage 6C.1 product-session logout', () => {
  it('revokes a Maftah federation session, removes credentials, and clears local cookies', async () => {
    const sessionId = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
    const token = signNexoraSessionToken({ v: 2, sid: sessionId }, 60 * 60)
    const cookieStore = new MockCookieStore({ [SESSION_COOKIE_NAME]: token, nexora_maftah_tx: 'tx-cookie' })
    const adminDb = new MockRevocationClient({ data: true, error: null })

    const result = await clearSessionCookie({ cookieStore, adminDb })

    assert.deepEqual(result, {
      success: true,
      authenticationMode: 'federation',
      federationSessionId: sessionId
    })
    assert.equal(adminDb.sessionStatus, 'revoked')
    assert.equal(adminDb.credentialsPresent, false)
    assert.deepEqual(adminDb.calls, [{
      functionName: 'service_revoke_federation_session',
      args: { p_session_id: sessionId }
    }])
    assert.equal(cookieStore.get(SESSION_COOKIE_NAME)?.value, '')
    assert.equal(cookieStore.get('nexora_maftah_tx')?.value, '')
    assert.equal(cookieStore.writes.every((write) => write.options.maxAge === 0), true)
  })

  it('fails closed when server-side federation revocation fails while still clearing browser cookies', async () => {
    const sessionId = '6ba7b810-9dad-41d1-80b4-00c04fd430c8'
    const token = signNexoraSessionToken({ v: 2, sid: sessionId }, 60 * 60)
    const cookieStore = new MockCookieStore({ [SESSION_COOKIE_NAME]: token })
    const adminDb = new MockRevocationClient({ data: null, error: { message: 'database unavailable' } })

    const result = await clearSessionCookie({ cookieStore, adminDb })

    assert.deepEqual(result, {
      success: false,
      authenticationMode: 'federation',
      federationSessionId: sessionId,
      error: 'federation_session_revocation_failed'
    })
    assert.equal(adminDb.sessionStatus, 'active')
    assert.equal(cookieStore.get(SESSION_COOKIE_NAME)?.value, '')
  })

  it('rejects the old federation session after revocation', () => {
    assert.equal(isFederationSessionUsable({ status: 'active', membership_status: 'active' }), true)
    assert.equal(isFederationSessionUsable({ status: 'revoked', membership_status: 'active' }), false)
    assert.equal(isFederationSessionUsable({ status: 'active', membership_status: 'suspended' }), false)
  })

  it('redirects ordinary Maftah logout to /login/maftah without central identity logout', () => {
    const destination = getLogoutDestination({
      logoutState: { success: true, authenticationMode: 'federation' },
      legacyGlobalLogoutRequested: false,
      legacyGlobalLogoutUrl: 'https://id.lubbalmandumah.com/api/sso/logout'
    })

    assert.equal(destination, '/login/maftah')
    assert.equal(destination.includes('id.lubbalmandumah.com'), false)
  })

  it('never sends a Maftah session to legacy LAM ID, even when legacy query flags are supplied', () => {
    const destination = getLogoutDestination({
      logoutState: { success: true, authenticationMode: 'federation' },
      legacyGlobalLogoutRequested: true,
      legacyGlobalLogoutUrl: 'https://id.lubbalmandumah.com/api/sso/logout'
    })

    assert.equal(destination, '/login/maftah')
  })

  it('returns a controlled Maftah login error when server revocation fails', () => {
    const destination = getLogoutDestination({
      logoutState: { success: false, authenticationMode: 'federation' },
      legacyGlobalLogoutRequested: false,
      legacyGlobalLogoutUrl: 'https://id.lubbalmandumah.com/api/sso/logout'
    })

    assert.equal(destination, '/login/maftah?error=session_revocation_failed')
  })

  it('preserves legacy global logout only for an authenticated legacy session', () => {
    const legacyGlobalLogoutUrl = 'https://id.lubbalmandumah.com/api/sso/logout'
    const destination = getLogoutDestination({
      logoutState: { success: true, authenticationMode: 'legacy' },
      legacyGlobalLogoutRequested: true,
      legacyGlobalLogoutUrl
    })

    assert.equal(destination, legacyGlobalLogoutUrl)
  })

  it('the authenticated account control signs out locally and contains no legacy SSO navigation', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/AccountSessionControl.tsx'),
      'utf8'
    )

    assert.match(source, /action="\/api\/auth\/logout"/)
    assert.match(source, /method="post"/)
    assert.match(source, /<LogOut/)
    assert.doesNotMatch(source, /\/api\/auth\/sso/)
    assert.doesNotMatch(source, /id\.lubbalmandumah\.com/)
    assert.doesNotMatch(source, /LAM SSO/)
  })
})
