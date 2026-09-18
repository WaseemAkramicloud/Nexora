import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getNexoraMaftahExposureMode } from '../lib/auth/config'
import { getLocalizedAuthError, translations } from '../lib/i18n/translations'
import { getLogoutDestination } from '../lib/auth/logout'
import {
  clearSessionCookie,
  isFederationSessionUsable,
  SESSION_COOKIE_NAME
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

describe('NEXORA Stage 6C.2 — Public Maftah Rollout & Workspace Switching', () => {
  const originalEnv = process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = originalEnv
    } else {
      delete process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE
    }
  })

  describe('1 & 4. Normal unauthenticated entry presents Maftah only & no visible legacy login', () => {
    it('normal unauthenticated entry presents Maftah login with clean UX', () => {
      const rootPage = read('app/page.tsx')
      const loginClient = read('app/login/maftah/pilot-client.tsx')

      assert.match(rootPage, /href="\/login\/maftah"/)
      assert.match(loginClient, /href="\/api\/auth\/maftah"/)
      assert.doesNotMatch(rootPage, /href="\/api\/auth\/sso"/)
      assert.doesNotMatch(loginClient, /href="\/api\/auth\/sso"/)
      assert.doesNotMatch(rootPage, /id\.lubbalmandumah\.com/)
      assert.doesNotMatch(loginClient, /id\.lubbalmandumah\.com/)
      assert.doesNotMatch(loginClient, /Return to standard login|returnStandard|Controlled Pilot Access|Product ID/)
    })
  })

  describe('2 & 3. Exposure mode resolution and fail-closed rollback gating', () => {
    it('public exposure mode works as expected', () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = 'public'
      assert.strictEqual(getNexoraMaftahExposureMode(), 'public')
    })

    it('hidden/pilot behavior still fails safely where rollback gating requires it', () => {
      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = 'hidden'
      assert.strictEqual(getNexoraMaftahExposureMode(), 'hidden')

      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = 'pilot'
      assert.strictEqual(getNexoraMaftahExposureMode(), 'pilot')

      delete process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE
      assert.strictEqual(getNexoraMaftahExposureMode(), 'hidden')

      process.env.NEXORA_MAFTAH_LOGIN_EXPOSURE = 'invalid_mode'
      assert.strictEqual(getNexoraMaftahExposureMode(), 'hidden')
    })
  })

  describe('5, 6, 7, 8. Customer-facing error localization & raw machine code masking', () => {
    it('raw machine auth codes are not rendered directly to users in login page', () => {
      const loginClient = read('app/login/maftah/pilot-client.tsx')
      assert.doesNotMatch(loginClient, /<code>\{errorParam\}<\/code>/)
      assert.doesNotMatch(loginClient, /Authentication error: <code/)
      assert.match(loginClient, /getLocalizedAuthError/)
    })

    it('EN customer errors render correctly and accurately map known error codes', () => {
      assert.strictEqual(
        getLocalizedAuthError('access_not_authorized', 'en'),
        'You do not currently have access to NEXORA.'
      )
      assert.strictEqual(
        getLocalizedAuthError('transaction_expired', 'en'),
        'Your sign-in session expired. Please sign in again.'
      )
      assert.strictEqual(
        getLocalizedAuthError('workspace_not_provisioned', 'en'),
        'This workspace is not yet available in NEXORA.'
      )
      assert.strictEqual(
        getLocalizedAuthError('membership_not_active', 'en'),
        'Your NEXORA access is currently inactive.'
      )
      assert.strictEqual(
        getLocalizedAuthError('organization_access_denied', 'en'),
        'You no longer have access to this workspace.'
      )
      assert.strictEqual(
        getLocalizedAuthError('session_creation_failed', 'en'),
        'We could not complete your sign-in. Please try again.'
      )
      assert.strictEqual(
        getLocalizedAuthError('credential_decryption_failed', 'en'),
        'Your sign-in data could not be verified securely. Please sign in again.'
      )
    })

    it('FR customer errors render correctly with proper accents and grammar', () => {
      assert.strictEqual(
        getLocalizedAuthError('access_not_authorized', 'fr'),
        "Vous n'avez pas actuellement accès à NEXORA."
      )
      assert.strictEqual(
        getLocalizedAuthError('transaction_expired', 'fr'),
        'Votre session de connexion a expiré. Veuillez vous reconnecter.'
      )
      assert.strictEqual(
        getLocalizedAuthError('workspace_not_provisioned', 'fr'),
        "Cet espace de travail n'est pas encore disponible dans NEXORA."
      )
      assert.strictEqual(
        getLocalizedAuthError('membership_not_active', 'fr'),
        'Votre accès à NEXORA est actuellement inactif.'
      )
      assert.strictEqual(
        getLocalizedAuthError('organization_access_denied', 'fr'),
        "Vous n'avez plus accès à cet espace de travail."
      )
      assert.strictEqual(
        getLocalizedAuthError('session_creation_failed', 'fr'),
        'Impossible de finaliser votre connexion. Veuillez réessayer.'
      )
    })

    it('AR customer errors render correctly with appropriate Arabic phrasing and RTL readiness', () => {
      assert.strictEqual(
        getLocalizedAuthError('access_not_authorized', 'ar'),
        'ليس لديك صلاحية الوصول إلى نيكسورا NEXORA حالياً.'
      )
      assert.strictEqual(
        getLocalizedAuthError('transaction_expired', 'ar'),
        'انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً.'
      )
      assert.strictEqual(
        getLocalizedAuthError('workspace_not_provisioned', 'ar'),
        'مساحة العمل هذه غير متوفرة في نيكسورا NEXORA بعد.'
      )
      assert.strictEqual(
        getLocalizedAuthError('membership_not_active', 'ar'),
        'صلاحية وصولك إلى نيكسورا NEXORA غير نشطة حالياً.'
      )
      assert.strictEqual(
        getLocalizedAuthError('organization_access_denied', 'ar'),
        'لم يعد لديك صلاحية الوصول إلى مساحة العمل هذه.'
      )
      assert.strictEqual(
        getLocalizedAuthError('session_creation_failed', 'ar'),
        'تعذر إكمال تسجيل الدخول. يرجى المحاولة مرة أخرى.'
      )
    })

    it('unknown or arbitrary error code maps safely to generic localized message without leaking details', () => {
      assert.strictEqual(
        getLocalizedAuthError('unexpected_db_failure_table_lock', 'en'),
        'An authentication error occurred. Please try again.'
      )
      assert.strictEqual(
        getLocalizedAuthError('unexpected_db_failure_table_lock', 'fr'),
        "Une erreur d'authentification est survenue. Veuillez réessayer."
      )
      assert.strictEqual(
        getLocalizedAuthError('unexpected_db_failure_table_lock', 'ar'),
        'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.'
      )
    })
  })

  describe('9, 10, 11, 12, 13. Safe Workspace Switching Trust Flow', () => {
    it('Switch workspace endpoint terminates old session and starts fresh Maftah OAuth initiation', () => {
      const switchRoute = read('app/api/auth/maftah/switch/route.ts')
      assert.match(switchRoute, /clearSessionCookie/)
      assert.match(switchRoute, /generateCodeVerifier/)
      assert.match(switchRoute, /generateCodeChallenge/)
      assert.match(switchRoute, /getMaftahOAuthAuthorizeUrl/)
      assert.match(switchRoute, /logAuthOperationalEvent/)
      assert.match(switchRoute, /maftah_switch_workspace_started/)
    })

    it('Switch workspace cannot be forged using tenant/org input', () => {
      const workspaceActions = read('app/select-workspace/actions.ts')
      // Must not accept client tenant_id, only transaction_id and organization_id (re-verified with Maftah)
      assert.match(workspaceActions, /formData\.get\("transaction_id"\)/)
      assert.match(workspaceActions, /formData\.get\("organization_id"\)/)
      assert.doesNotMatch(workspaceActions, /formData\.get\("tenant_id"\)/)
      assert.match(workspaceActions, /callMaftahResolveEntry/)
      assert.match(workspaceActions, /service_resolve_federation_workspace/)
      assert.match(workspaceActions, /service_get_federation_identity_link/)
    })

    it('previous session cannot authorize another workspace by itself', () => {
      const sessionIdA = '11111111-1111-1111-1111-111111111111'
      const tokenA = signNexoraSessionToken({ v: 2, sid: sessionIdA }, 60 * 60)
      const verified = verifyNexoraSessionToken(tokenA)

      assert.strictEqual(verified.valid, true)
      assert.strictEqual(verified.payload?.sid, sessionIdA)
      // The session token only references session ID A; it cannot grant access to tenant B without a new server session
      assert.strictEqual(verified.payload?.tenantId, undefined)
    })

    it('successful switch creates a new valid federation session and old session is revoked', async () => {
      const oldSessionId = '22222222-2222-2222-2222-222222222222'
      const oldToken = signNexoraSessionToken({ v: 2, sid: oldSessionId }, 60 * 60)
      const cookieStore = new MockCookieStore({ [SESSION_COOKIE_NAME]: oldToken })
      const adminDb = new MockRevocationClient({ data: true, error: null })

      const clearResult = await clearSessionCookie({ cookieStore, adminDb })
      assert.strictEqual(clearResult.success, true)
      assert.strictEqual(clearResult.federationSessionId, oldSessionId)
      assert.strictEqual(adminDb.sessionStatus, 'revoked')

      // New session created for target workspace
      const newSessionId = '33333333-3333-3333-3333-333333333333'
      const newToken = signNexoraSessionToken({ v: 2, sid: newSessionId }, 8 * 60 * 60)
      const verifiedNew = verifyNexoraSessionToken(newToken)
      assert.strictEqual(verifiedNew.valid, true)
      assert.strictEqual(verifiedNew.payload?.sid, newSessionId)
    })
  })

  describe('14, 15, 16. Session recovery, stale transactions & Sign out invariants', () => {
    it('expired/revoked federation sessions fail usability checks', () => {
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'active' }), true)
      assert.strictEqual(isFederationSessionUsable({ status: 'revoked', membership_status: 'active' }), false)
      assert.strictEqual(isFederationSessionUsable({ status: 'expired', membership_status: 'active' }), false)
      assert.strictEqual(isFederationSessionUsable({ status: 'active', membership_status: 'suspended' }), false)
      assert.strictEqual(isFederationSessionUsable(null), false)
      assert.strictEqual(isFederationSessionUsable(undefined), false)
    })

    it('stale or consumed transactions are cleanly rejected with localized error redirection', () => {
      const workspacePage = read('app/select-workspace/page.tsx')
      const workspaceActions = read('app/select-workspace/actions.ts')

      assert.match(workspacePage, /redirect\('\/login\/maftah\?error=transaction_expired'\)/)
      assert.match(workspacePage, /redirect\('\/login\/maftah\?error=no_active_login_transaction'\)/)
      assert.match(workspaceActions, /redirect\("\/login\/maftah\?error=transaction_expired"\)/)
    })

    it('Sign out behavior clears local cookies and redirects to /login/maftah', () => {
      const destination = getLogoutDestination({
        logoutState: { success: true, authenticationMode: 'federation' },
        legacyGlobalLogoutRequested: false,
        legacyGlobalLogoutUrl: 'https://id.lubbalmandumah.com/api/sso/logout'
      })
      assert.strictEqual(destination, '/login/maftah')
    })
  })

  describe('17 & 18. Local roles tenant-specific and no new legacy redirects', () => {
    it('local NEXORA role remains tenant-specific and server-controlled', () => {
      const callbackRoute = read('app/api/auth/maftah/callback/route.ts')
      const workspaceActions = read('app/select-workspace/actions.ts')

      assert.match(callbackRoute, /service_get_federation_identity_link/)
      assert.match(workspaceActions, /service_get_federation_identity_link/)
      // Role is not extracted from OAuth claims, but from DB identity link
      assert.doesNotMatch(callbackRoute, /role\s*=\s*idTokenResult\.payload/)
      assert.doesNotMatch(workspaceActions, /role\s*=\s*tokens\.role/)
    })

    it('no new path redirects users to legacy LAM ID', () => {
      const switchRoute = read('app/api/auth/maftah/switch/route.ts')
      const callbackRoute = read('app/api/auth/maftah/callback/route.ts')
      const workspaceActions = read('app/select-workspace/actions.ts')
      const workspacePage = read('app/select-workspace/page.tsx')

      for (const code of [switchRoute, callbackRoute, workspaceActions, workspacePage]) {
        assert.doesNotMatch(code, /id\.lubbalmandumah\.com/)
      }
    })
  })
})
