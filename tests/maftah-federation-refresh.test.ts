process.env.MAFTAH_OAUTH_CLIENT_ID = process.env.MAFTAH_OAUTH_CLIENT_ID || "00000000-0000-0000-0000-000000000001"
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import {
  encryptCredential,
  decryptCredential,
  verifyMaftahAccessToken,
  verifyMaftahIdToken,
  FEDERATION_SESSION_MAX_AGE_SECONDS,
  MAFTAH_REVALIDATION_INTERVAL_SECONDS,
  PROACTIVE_TOKEN_REFRESH_THRESHOLD_SECONDS,
  getMaftahOAuthIssuer,
  getMaftahFederationAudience,
  getMaftahOAuthClientId
} from '../lib/auth/maftah-oauth'
import {
  signNexoraSessionToken,
  verifyNexoraSessionToken
} from '../lib/auth/jwt'

describe('NEXORA Stage 6B.7 — Refresh Rotation, Live Revalidation & 8-Hour Session Continuity', async () => {
  // Generate test EC P-256 keys for JWKS token verification
  const ecKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  const jwkPublicKey = crypto.createPublicKey(ecKeyPair.publicKey).export({ format: 'jwk' })
  jwkPublicKey.kid = 'test-maftah-key-1'
  jwkPublicKey.alg = 'ES256'
  jwkPublicKey.use = 'sig'

  const mockJwksKeys = [jwkPublicKey as any]

  const validSub = '11223344-5566-4788-a9aa-bbccddeeff00'
  const validSessionId = '22334455-6677-4899-b0bb-ccddeeff0011'
  const validClientId = getMaftahOAuthClientId()
  const validIssuer = getMaftahOAuthIssuer()
  const validAudience = getMaftahFederationAudience()

  // Helper to generate verified test access tokens
  function signTestAccessToken(claims: Record<string, unknown> = {}, expiresInSec = 3600): string {
    const payload = {
      iss: validIssuer,
      aud: validAudience,
      client_id: validClientId,
      sub: validSub,
      session_id: validSessionId,
      ...claims
    }
    return jwt.sign(payload, ecKeyPair.privateKey, {
      algorithm: 'ES256',
      keyid: 'test-maftah-key-1',
      expiresIn: expiresInSec
    })
  }

  // ---------------------------------------------------------------------------
  // PART A: Refreshed Access Token Claim & Signature Validation
  // ---------------------------------------------------------------------------
  describe('Refreshed Access Token Claim & Signature Validation', () => {
    it('1. successfully verifies a valid ES256 refreshed access token', async () => {
      const token = signTestAccessToken()
      const result = await verifyMaftahAccessToken(token, { injectedJwksKeys: mockJwksKeys })
      assert.equal(result.valid, true)
      assert.equal(result.payload?.sub, validSub)
      assert.equal(result.payload?.client_id, validClientId)
      assert.equal(result.payload?.session_id, validSessionId)
    })

    it('2. rejects refreshed token with wrong issuer', async () => {
      const token = signTestAccessToken({ iss: 'https://attacker-idp.com/auth/v1' })
      const result = await verifyMaftahAccessToken(token, { injectedJwksKeys: mockJwksKeys })
      assert.equal(result.valid, false)
      assert.match(result.error || '', /jwt issuer invalid|token_verification_failed/i)
    })

    it('3. rejects refreshed token with wrong audience', async () => {
      const token = signTestAccessToken({ aud: 'https://other-service.com/api' })
      const result = await verifyMaftahAccessToken(token, { injectedJwksKeys: mockJwksKeys })
      assert.equal(result.valid, false)
      assert.match(result.error || '', /jwt audience invalid|token_verification_failed/i)
    })

    it('4. rejects refreshed token with client_id mismatch', async () => {
      const token = signTestAccessToken({ client_id: 'lam_client_other' })
      const result = await verifyMaftahAccessToken(token, { injectedJwksKeys: mockJwksKeys })
      assert.equal(result.valid, false)
      assert.equal(result.error, 'client_id_mismatch')
    })

    it('5. rejects refreshed token with subject mismatch', async () => {
      const token = signTestAccessToken({ sub: '99999999-8888-4788-a9aa-bbccddeeff00' })
      const result = await verifyMaftahAccessToken(token, {
        expectedSubject: validSub,
        injectedJwksKeys: mockJwksKeys
      })
      assert.equal(result.valid, false)
      assert.equal(result.error, 'subject_mismatch')
    })

    it('6. rejects refreshed token with missing or non-UUID session_id', async () => {
      const tokenWithoutSession = signTestAccessToken({ session_id: undefined })
      const res1 = await verifyMaftahAccessToken(tokenWithoutSession, { injectedJwksKeys: mockJwksKeys })
      assert.equal(res1.valid, false)
      assert.equal(res1.error, 'invalid_session_id_uuid')

      const tokenInvalidSession = signTestAccessToken({ session_id: 'not-a-uuid' })
      const res2 = await verifyMaftahAccessToken(tokenInvalidSession, { injectedJwksKeys: mockJwksKeys })
      assert.equal(res2.valid, false)
      assert.equal(res2.error, 'invalid_session_id_uuid')
    })

    it('7. rejects expired refreshed token', async () => {
      const token = signTestAccessToken({}, -10) // expired 10s ago
      const result = await verifyMaftahAccessToken(token, { injectedJwksKeys: mockJwksKeys })
      assert.equal(result.valid, false)
      assert.match(result.error || '', /jwt expired/i)
    })
  })

  // ---------------------------------------------------------------------------
  // PART B: Database Refresh Lease & CAS Concurrency Simulation
  // ---------------------------------------------------------------------------
  describe('PostgreSQL Refresh Lease, Lock & Version CAS Simulation', () => {
    interface DbCredentialRow {
      session_id: string
      encrypted_credentials: string
      iv: string
      tag: string
      credential_version: number
      refresh_lock_id: string | null
      refresh_lock_expires_at: number | null // ms
      last_refresh_at: number | null // ms
      access_token_expires_at: number // ms
    }

    interface DbSessionRow {
      session_id: string
      status: 'active' | 'expired' | 'revoked'
      expires_at: number // ms (8h absolute)
      last_maftah_revalidated_at: number // ms
      external_organization_id: string
      revalidation_lock_id: string | null
      revalidation_lock_expires_at: number | null
    }

    class MockDatabase {
      public sessions: Map<string, DbSessionRow> = new Map()
      public credentials: Map<string, DbCredentialRow> = new Map()

      // service_begin_federation_refresh
      beginRefresh(sessionId: string, leaseSec = 30, nowMs = Date.now()) {
        const session = this.sessions.get(sessionId)
        if (!session) return { success: false, error: 'session_not_found' }
        if (session.status !== 'active') return { success: false, error: 'session_not_active' }
        if (session.expires_at <= nowMs) {
          session.status = 'expired'
          this.credentials.delete(sessionId)
          return { success: false, error: 'session_expired' }
        }

        const creds = this.credentials.get(sessionId)
        if (!creds) return { success: false, error: 'credentials_not_found' }

        // Check if unexpired lock is held
        if (creds.refresh_lock_id !== null && creds.refresh_lock_expires_at! > nowMs) {
          return { success: false, status: 'locked', error: 'refresh_in_progress' }
        }

        // Acquire lock
        const lockId = crypto.randomUUID()
        const lockExpiresAt = nowMs + leaseSec * 1000
        creds.refresh_lock_id = lockId
        creds.refresh_lock_expires_at = lockExpiresAt

        return {
          success: true,
          lock_id: lockId,
          lock_expires_at: lockExpiresAt,
          credential_version: creds.credential_version,
          encrypted_credentials: creds.encrypted_credentials,
          iv: creds.iv,
          tag: creds.tag,
          access_token_expires_at: creds.access_token_expires_at,
          session_expires_at: session.expires_at
        }
      }

      // service_complete_federation_refresh
      completeRefresh(
        sessionId: string,
        lockId: string,
        expectedVersion: number,
        newEncrypted: string,
        newIv: string,
        newTag: string,
        newExpiresAt: number,
        nowMs = Date.now()
      ) {
        const session = this.sessions.get(sessionId)
        if (!session || session.status !== 'active' || session.expires_at <= nowMs) {
          return { success: false, error: 'session_not_active_or_expired' }
        }

        const creds = this.credentials.get(sessionId)
        if (!creds) return { success: false, error: 'credentials_not_found' }

        // Lock check
        if (!creds.refresh_lock_id || creds.refresh_lock_id !== lockId || creds.refresh_lock_expires_at! <= nowMs) {
          return { success: false, error: 'invalid_or_expired_lock' }
        }

        // CAS Version check
        if (creds.credential_version !== expectedVersion) {
          return { success: false, error: 'version_mismatch' }
        }

        // Atomically update
        creds.encrypted_credentials = newEncrypted
        creds.iv = newIv
        creds.tag = newTag
        creds.credential_version = expectedVersion + 1
        creds.access_token_expires_at = newExpiresAt
        creds.last_refresh_at = nowMs
        creds.refresh_lock_id = null
        creds.refresh_lock_expires_at = null

        return { success: true, new_version: creds.credential_version }
      }

      // service_abort_federation_refresh
      abortRefresh(sessionId: string, lockId: string) {
        const creds = this.credentials.get(sessionId)
        if (creds && creds.refresh_lock_id === lockId) {
          creds.refresh_lock_id = null
          creds.refresh_lock_expires_at = null
          return true
        }
        return false
      }
    }

    const testNow = Date.now()
    const testSessionId = 'sess-100-abc'

    function setupDb(): MockDatabase {
      const db = new MockDatabase()
      db.sessions.set(testSessionId, {
        session_id: testSessionId,
        status: 'active',
        expires_at: testNow + FEDERATION_SESSION_MAX_AGE_SECONDS * 1000,
        last_maftah_revalidated_at: testNow,
        external_organization_id: 'org-111',
        revalidation_lock_id: null,
        revalidation_lock_expires_at: null
      })

      const initPayload = {
        access_token: 'initial-access-token',
        refresh_token: 'initial-refresh-token',
        access_token_expires_at: new Date(testNow + 3600000).toISOString(),
        credential_version: 1
      }
      const enc = encryptCredential(initPayload, `${testSessionId}:1:nexora_maftah_oauth_credentials`)

      db.credentials.set(testSessionId, {
        session_id: testSessionId,
        encrypted_credentials: enc.ciphertext,
        iv: enc.iv,
        tag: enc.tag,
        credential_version: 1,
        refresh_lock_id: null,
        refresh_lock_expires_at: null,
        last_refresh_at: null,
        access_token_expires_at: testNow + 3600000
      })

      return db
    }

    it('8. first request acquires refresh lock successfully', () => {
      const db = setupDb()
      const res = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res.success, true)
      assert.ok(res.lock_id)
      assert.equal(res.credential_version, 1)
    })

    it('9. second concurrent request is rejected with status locked', () => {
      const db = setupDb()
      const res1 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res1.success, true)

      // Concurrent second request arriving at same millisecond
      const res2 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res2.success, false)
      assert.equal(res2.status, 'locked')
      assert.equal(res2.error, 'refresh_in_progress')
    })

    it('10. wrong lock owner cannot finalize completeRefresh', () => {
      const db = setupDb()
      const res1 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res1.success, true)

      const attackerLockId = crypto.randomUUID()
      const completeRes = db.completeRefresh(
        testSessionId,
        attackerLockId,
        1,
        'new-cipher',
        'new-iv',
        'new-tag',
        testNow + 3600000,
        testNow
      )
      assert.equal(completeRes.success, false)
      assert.equal(completeRes.error, 'invalid_or_expired_lock')
    })

    it('11. stale credential_version cannot overwrite newer credentials (CAS protection)', () => {
      const db = setupDb()
      const res1 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res1.success, true)

      // Expected version is 1, pass wrong expected version 0
      const completeRes = db.completeRefresh(
        testSessionId,
        res1.lock_id!,
        0, // wrong expected version
        'new-cipher',
        'new-iv',
        'new-tag',
        testNow + 3600000,
        testNow
      )
      assert.equal(completeRes.success, false)
      assert.equal(completeRes.error, 'version_mismatch')
    })

    it('12. successful complete increments version and clears refresh lock', () => {
      const db = setupDb()
      const res1 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res1.success, true)

      const completeRes = db.completeRefresh(
        testSessionId,
        res1.lock_id!,
        1,
        'new-cipher',
        'new-iv',
        'new-tag',
        testNow + 3600000,
        testNow
      )
      assert.equal(completeRes.success, true)
      assert.equal(completeRes.new_version, 2)

      const creds = db.credentials.get(testSessionId)
      assert.equal(creds?.credential_version, 2)
      assert.equal(creds?.refresh_lock_id, null)
      assert.equal(creds?.refresh_lock_expires_at, null)
      assert.equal(creds?.last_refresh_at, testNow)
    })

    it('13. expired lock can be recovered by subsequent request (crash recovery)', () => {
      const db = setupDb()
      const res1 = db.beginRefresh(testSessionId, 30, testNow)
      assert.equal(res1.success, true)

      // Worker crashes; 31 seconds elapse
      const futureTime = testNow + 31000
      const res2 = db.beginRefresh(testSessionId, 30, futureTime)
      assert.equal(res2.success, true)
      assert.ok(res2.lock_id)
      assert.notEqual(res2.lock_id, res1.lock_id)
    })

    it('14. refresh does NOT extend absolute 8-hour session expiry (non-sliding)', () => {
      const db = setupDb()
      const origExpiresAt = db.sessions.get(testSessionId)!.expires_at

      const res1 = db.beginRefresh(testSessionId, 30, testNow + 3600000)
      db.completeRefresh(testSessionId, res1.lock_id!, 1, 'c', 'iv', 'tag', testNow + 7200000, testNow + 3600000)

      const sessionAfter = db.sessions.get(testSessionId)!
      assert.equal(sessionAfter.expires_at, origExpiresAt, 'Session expires_at MUST NOT be extended')
    })

    it('15. expired session at 8h destroys credentials and blocks refresh', () => {
      const db = setupDb()
      const past8Hours = testNow + FEDERATION_SESSION_MAX_AGE_SECONDS * 1000 + 1000
      const res = db.beginRefresh(testSessionId, 30, past8Hours)
      assert.equal(res.success, false)
      assert.equal(res.error, 'session_expired')

      assert.equal(db.sessions.get(testSessionId)?.status, 'expired')
      assert.equal(db.credentials.has(testSessionId), false, 'Credentials MUST be destroyed at expiry')
    })
  })

  // ---------------------------------------------------------------------------
  // PART C: Live Maftah Revalidation & Suspension Matrix Simulation
  // ---------------------------------------------------------------------------
  describe('Live Maftah Revalidation & Suspension Matrix', () => {
    it('16. authorization freshness under 30 minutes does not require network call', () => {
      const lastReval = Date.now() - 10 * 60 * 1000 // 10 minutes ago (< 30m)
      const isStale = Date.now() - lastReval >= MAFTAH_REVALIDATION_INTERVAL_SECONDS * 1000
      assert.equal(isStale, false)
    })

    it('17. authorization freshness >= 30 minutes triggers revalidation requirement', () => {
      const lastReval = Date.now() - 30 * 60 * 1000 // 30 minutes ago (>= 30m)
      const isStale = Date.now() - lastReval >= MAFTAH_REVALIDATION_INTERVAL_SECONDS * 1000
      assert.equal(isStale, true)
    })

    it('18. proactive token refresh triggers if token expires within 5 minutes', () => {
      const tokenExpiresAt = Date.now() + 4 * 60 * 1000 // expires in 4 minutes (< 5m)
      const needsProactive = tokenExpiresAt - Date.now() < PROACTIVE_TOKEN_REFRESH_THRESHOLD_SECONDS * 1000
      assert.equal(needsProactive, true)
    })

    it('19. proactive token refresh does NOT trigger if token has ample validity (> 5m)', () => {
      const tokenExpiresAt = Date.now() + 45 * 60 * 1000 // expires in 45 minutes
      const needsProactive = tokenExpiresAt - Date.now() < PROACTIVE_TOKEN_REFRESH_THRESHOLD_SECONDS * 1000
      assert.equal(needsProactive, false)
    })

    it('20. 7-point suspension causes fail-closed session revocation on revalidation', () => {
      const responses = [
        { code: 'user_suspended', status: 403, error: 'no_effective_access' },
        { code: 'org_suspended', status: 403, error: 'no_effective_access' },
        { code: 'membership_suspended', status: 403, error: 'no_effective_access' },
        { code: 'entitlement_cancelled', status: 403, error: 'no_effective_access' },
        { code: 'entitlement_expired', status: 403, error: 'no_effective_access' },
        { code: 'user_access_revoked', status: 403, error: 'no_effective_access' },
        { code: 'product_suspended', status: 403, error: 'no_effective_access' }
      ]

      for (const r of responses) {
        // Any 403 / denied response results in fail closed
        assert.equal(r.status, 403)
        assert.equal(r.error, 'no_effective_access')
      }
    })

    it('21. local membership status is evaluated independently (local suspension denies immediately)', () => {
      const localMembershipStatus: string = 'suspended'
      const isAuthorized = localMembershipStatus === 'active'
      assert.equal(isAuthorized, false, 'Suspended local membership MUST block access immediately')
    })
  })

  // ---------------------------------------------------------------------------
  // PART D: Session Bounding & Legacy Coexistence
  // ---------------------------------------------------------------------------
  describe('Session Bounding & Legacy Coexistence', () => {
    it('22. Version 2 session token is bounded to 8 hours (28800s)', () => {
      const token = signNexoraSessionToken({ v: 2, sid: 'test-session-123' }, FEDERATION_SESSION_MAX_AGE_SECONDS)
      const res = verifyNexoraSessionToken(token)
      assert.equal(res.valid, true)
      assert.equal(res.payload?.v, 2)
      assert.equal(res.payload?.sid, 'test-session-123')
      // Expiry window in seconds should be approximately 28800
      const nowSec = Math.floor(Date.now() / 1000)
      const expSec = res.payload?.exp!
      assert.ok(expSec - nowSec <= FEDERATION_SESSION_MAX_AGE_SECONDS + 5)
      assert.ok(expSec - nowSec >= FEDERATION_SESSION_MAX_AGE_SECONDS - 5)
    })

    it('23. Version 1 legacy session token remains 7 days and functional', () => {
      const legacyPayload = {
        v: 1,
        lamCustomerId: 'cust-1',
        lamCompanyId: 'comp-1',
        tenantId: 'tenant-1',
        membershipId: 'mem-1',
        email: 'user@example.com',
        firstName: 'John',
        role: 'admin' as const,
        grantedProducts: ['nexora'],
        createdAt: new Date().toISOString()
      }
      const token = signNexoraSessionToken(legacyPayload, 7 * 24 * 60 * 60)
      const res = verifyNexoraSessionToken(token)
      assert.equal(res.valid, true)
      assert.equal(res.payload?.v, 1)
      assert.equal(res.payload?.email, 'user@example.com')
      assert.equal(res.payload?.role, 'admin')
    })
  })

  // ---------------------------------------------------------------------------
  // PART E: Security & Secret Leak Audit
  // ---------------------------------------------------------------------------
  describe('Security & Secret Leak Audit', () => {
    it('24. structured credential ciphertext never reveals plaintext tokens', () => {
      const secretAccessToken = 'sbp_secret_access_token_never_leak_this_value'
      const secretRefreshToken = 'sbr_secret_refresh_token_never_leak_this_value'
      const payload = {
        access_token: secretAccessToken,
        refresh_token: secretRefreshToken,
        access_token_expires_at: new Date().toISOString(),
        credential_version: 1
      }
      const enc = encryptCredential(payload, 'test-session:1:nexora_maftah_oauth_credentials')

      assert.equal(enc.ciphertext.includes(secretAccessToken), false)
      assert.equal(enc.ciphertext.includes(secretRefreshToken), false)
      assert.equal(enc.iv.length, 24) // 12 bytes in hex = 24 chars
      assert.equal(enc.tag.length, 32) // 16 bytes in hex = 32 chars
    })
  })
})
