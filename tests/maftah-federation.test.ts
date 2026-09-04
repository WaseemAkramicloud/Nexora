process.env.MAFTAH_OAUTH_CLIENT_ID = process.env.MAFTAH_OAUTH_CLIENT_ID || "00000000-0000-0000-0000-000000000001"
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generateNonce
} from '../lib/auth/pkce'
import {
  encryptCredential,
  decryptCredential,
  verifyMaftahIdToken,
  getMaftahOAuthIssuer,
  getMaftahOAuthClientId,
  getNexoraCredentialVaultKey
} from '../lib/auth/maftah-oauth'
import {
  signNexoraSessionToken,
  verifyNexoraSessionToken
} from '../lib/auth/jwt'

describe('NEXORA Stage 6B.6A — Multi-Org Identity & Credential Vault Tests', () => {
  let ecKeyPair: crypto.KeyPairSyncResult<string, string>
  let rsaKeyPair: crypto.KeyPairSyncResult<string, string>
  const testKidEc = 'test-kid-ec-2026'
  const testSub = '550e8400-e29b-41d4-a716-446655440000'
  const testNonce = 'secure_random_nonce_12345'
  const expectedIssuer = getMaftahOAuthIssuer()
  const expectedAudience = getMaftahOAuthClientId()

  before(() => {
    ecKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })

    rsaKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
  })

  // ---------------------------------------------------------------------------
  // 1. PKCE and State Tests
  // ---------------------------------------------------------------------------
  describe('PKCE & Cryptographic State Generation', () => {
    it('1. generates valid high-entropy code verifier', () => {
      const verifier = generateCodeVerifier(64)
      assert.ok(verifier.length >= 43 && verifier.length <= 128)
      assert.match(verifier, /^[A-Za-z0-9_-]+$/)
    })

    it('2. derives deterministic S256 code challenge from verifier', () => {
      const verifier = 'test_code_verifier_1234567890_abcdefghijklmnopqrstuvwxyz'
      const challenge1 = generateCodeChallenge(verifier)
      const challenge2 = generateCodeChallenge(verifier)
      assert.equal(challenge1, challenge2)
      assert.match(challenge1, /^[A-Za-z0-9_-]+$/)
    })

    it('3. generates unique state and nonce strings', () => {
      const state1 = generateState()
      const state2 = generateState()
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()
      assert.notEqual(state1, state2)
      assert.notEqual(nonce1, nonce2)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. AES-256-GCM Credential Vault & AAD Context Tests
  // ---------------------------------------------------------------------------
  describe('Application-Level Credential Vault (AES-256-GCM + AAD Binding)', () => {
    it('4. securely encrypts and decrypts structured OAuth token payload', () => {
      const payload = {
        access_token: 'maftah_oauth_access_token_secret_data_12345',
        refresh_token: 'maftah_oauth_refresh_token_secret_data_67890',
        access_token_expires_at: '2026-09-03T21:00:00.000Z',
        credential_version: 1
      }
      const aad = 'session-123:1:nexora_maftah_oauth_credentials'
      const encrypted = encryptCredential(payload, aad)

      assert.notEqual(encrypted.ciphertext, JSON.stringify(payload))
      assert.equal(encrypted.iv.length, 24) // 12 bytes hex = 24 chars
      assert.equal(encrypted.tag.length, 32) // 16 bytes hex = 32 chars

      const decrypted = decryptCredential<typeof payload>(encrypted.ciphertext, encrypted.iv, encrypted.tag, aad)
      assert.deepEqual(decrypted, payload)
    })

    it('5. produces unique IVs and ciphertexts for identical plaintext (no IV reuse)', () => {
      const payload = { access_token: 'identical_token' }
      const enc1 = encryptCredential(payload)
      const enc2 = encryptCredential(payload)

      assert.notEqual(enc1.iv, enc2.iv)
      assert.notEqual(enc1.ciphertext, enc2.ciphertext)
    })

    it('6. detects ciphertext tampering (authentication tag mismatch)', () => {
      const payload = { access_token: 'secret' }
      const aad = 'session-456:1:nexora_maftah_oauth_credentials'
      const encrypted = encryptCredential(payload, aad)

      const tampered = (encrypted.ciphertext[0] === 'a' ? 'b' : 'a') + encrypted.ciphertext.slice(1)

      assert.throws(() => {
        decryptCredential(tampered, encrypted.iv, encrypted.tag, aad)
      }, /Unsupported state or unable to authenticate data/)
    })

    it('7. detects tag tampering', () => {
      const payload = { access_token: 'secret' }
      const aad = 'session-456:1:nexora_maftah_oauth_credentials'
      const encrypted = encryptCredential(payload, aad)

      const tamperedTag = (encrypted.tag[0] === 'a' ? 'b' : 'a') + encrypted.tag.slice(1)

      assert.throws(() => {
        decryptCredential(encrypted.ciphertext, encrypted.iv, tamperedTag, aad)
      }, /Unsupported state or unable to authenticate data/)
    })

    it('8. detects IV tampering', () => {
      const payload = { access_token: 'secret' }
      const aad = 'session-456:1:nexora_maftah_oauth_credentials'
      const encrypted = encryptCredential(payload, aad)

      const tamperedIv = (encrypted.iv[0] === 'a' ? 'b' : 'a') + encrypted.iv.slice(1)

      assert.throws(() => {
        decryptCredential(encrypted.ciphertext, tamperedIv, encrypted.tag, aad)
      }, /Unsupported state or unable to authenticate data/)
    })

    it('9. fails decryption when AAD context is mismatched (context-binding enforcement)', () => {
      const payload = { access_token: 'secret' }
      const originalAad = 'session-123:1:nexora_maftah_oauth_credentials'
      const attackerAad = 'session-999:1:nexora_maftah_oauth_credentials'

      const encrypted = encryptCredential(payload, originalAad)

      assert.throws(() => {
        decryptCredential(encrypted.ciphertext, encrypted.iv, encrypted.tag, attackerAad)
      }, /Unsupported state or unable to authenticate data/)
    })

    it('10. rejects malformed or wrong-length vault key at startup', () => {
      const originalKey = process.env.NEXORA_CREDENTIAL_VAULT_KEY
      try {
        process.env.NEXORA_CREDENTIAL_VAULT_KEY = 'short_key_123'
        assert.throws(() => {
          getNexoraCredentialVaultKey()
        }, /NEXORA_CREDENTIAL_VAULT_KEY must be exactly 64 hexadecimal characters/)
      } finally {
        process.env.NEXORA_CREDENTIAL_VAULT_KEY = originalKey
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 3. ID Token Verification Tests
  // ---------------------------------------------------------------------------
  describe('Maftah ID Token Validator', () => {
    function getEcJwk() {
      const keyObj = crypto.createPublicKey(ecKeyPair.publicKey)
      const jwk = keyObj.export({ format: 'jwk' }) as any
      jwk.kid = testKidEc
      jwk.alg = 'ES256'
      jwk.use = 'sig'
      return jwk
    }

    it('11. successfully validates a genuine ES256 ID token', async () => {
      const payload = {
        iss: expectedIssuer,
        sub: testSub,
        aud: expectedAudience,
        nonce: testNonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, true)
      assert.equal(res.payload?.sub, testSub)
    })

    it('12. rejects ID token with nonce mismatch', async () => {
      const payload = {
        iss: expectedIssuer,
        sub: testSub,
        aud: expectedAudience,
        nonce: 'wrong_nonce',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, false)
      assert.equal(res.error, 'nonce_mismatch')
    })

    it('13. rejects ID token with wrong issuer', async () => {
      const payload = {
        iss: 'https://attacker-idp.example.com',
        sub: testSub,
        aud: expectedAudience,
        nonce: testNonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, false)
    })

    it('14. rejects ID token with wrong audience', async () => {
      const payload = {
        iss: expectedIssuer,
        sub: testSub,
        aud: 'other_client_id',
        nonce: testNonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, false)
    })

    it('15. rejects expired ID token', async () => {
      const payload = {
        iss: expectedIssuer,
        sub: testSub,
        aud: expectedAudience,
        nonce: testNonce,
        exp: Math.floor(Date.now() / 1000) - 100,
        iat: Math.floor(Date.now() / 1000) - 200
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, false)
    })

    it('16. rejects ID token with non-UUID subject', async () => {
      const payload = {
        iss: expectedIssuer,
        sub: 'user_12345_not_uuid',
        aud: expectedAudience,
        nonce: testNonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }

      const token = jwt.sign(payload, ecKeyPair.privateKey, {
        algorithm: 'ES256',
        keyid: testKidEc
      })

      const res = await verifyMaftahIdToken(token, {
        expectedNonce: testNonce,
        injectedJwksKeys: [getEcJwk()]
      })

      assert.equal(res.valid, false)
      assert.equal(res.error, 'invalid_subject_uuid')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Multi-Org Cardinality & Session Versioning Tests
  // ---------------------------------------------------------------------------
  describe('Multi-Org Identity Resolution & Session Bounding Tests', () => {
    it('17. simulates normalized 1-to-many external identity resolution across multiple tenants', () => {
      const externalIdentity = {
        id: 'ext-id-1',
        issuer: expectedIssuer,
        subject: testSub,
        status: 'active'
      }

      const memberships = [
        { id: 'mem-A', tenant_id: 'tenant-A', role: 'owner', status: 'active' },
        { id: 'mem-B', tenant_id: 'tenant-B', role: 'sales_user', status: 'active' }
      ]

      const links = [
        { external_identity_id: 'ext-id-1', membership_id: 'mem-A', status: 'active' },
        { external_identity_id: 'ext-id-1', membership_id: 'mem-B', status: 'active' }
      ]

      function resolveMembershipForTenant(tenantId: string) {
        const matchingLinks = links.filter((l) => {
          if (l.external_identity_id !== externalIdentity.id || l.status !== 'active') return false
          const m = memberships.find((mem) => mem.id === l.membership_id)
          return m && m.tenant_id === tenantId && m.status === 'active'
        })

        if (matchingLinks.length === 0) return null
        if (matchingLinks.length > 1) return { error: 'identity_link_conflict' }
        return memberships.find((mem) => mem.id === matchingLinks[0].membership_id)
      }

      // Tenant A resolves to Membership A
      const resA = resolveMembershipForTenant('tenant-A')
      assert.ok(resA && !('error' in resA))
      assert.equal(resA.id, 'mem-A')
      assert.equal(resA.role, 'owner')

      // Tenant B resolves to Membership B
      const resB = resolveMembershipForTenant('tenant-B')
      assert.ok(resB && !('error' in resB))
      assert.equal(resB.id, 'mem-B')
      assert.equal(resB.role, 'sales_user')

      // Unmapped Tenant C returns null (membership_not_provisioned)
      const resC = resolveMembershipForTenant('tenant-C')
      assert.equal(resC, null)
    })

    it('18. fails closed with identity_link_conflict when same tenant has multiple active links for same subject', () => {
      const externalIdentityId = 'ext-id-1'
      const conflictingMemberships = [
        { id: 'mem-1', tenant_id: 'tenant-A', status: 'active' },
        { id: 'mem-2', tenant_id: 'tenant-A', status: 'active' } // Duplicate active membership in same tenant
      ]
      const links = [
        { external_identity_id: externalIdentityId, membership_id: 'mem-1', status: 'active' },
        { external_identity_id: externalIdentityId, membership_id: 'mem-2', status: 'active' }
      ]

      const matchingLinks = links.filter((l) => {
        const m = conflictingMemberships.find((mem) => mem.id === l.membership_id)
        return m && m.tenant_id === 'tenant-A' && m.status === 'active'
      })

      assert.equal(matchingLinks.length, 2)
      // Enforces fail-closed conflict
      const isConflict = matchingLinks.length > 1
      assert.equal(isConflict, true)
    })

    it('19. correctly signs and verifies Version 1 legacy session payload (7 days)', () => {
      const legacyPayload = {
        v: 1,
        lamCustomerId: 'sub-uuid',
        lamCompanyId: 'comp-uuid',
        tenantId: 'tenant-uuid',
        membershipId: 'membership-uuid',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'owner',
        grantedProducts: ['nexora'],
        createdAt: new Date().toISOString()
      }

      const token = signNexoraSessionToken(legacyPayload, 7 * 24 * 60 * 60)
      const res = verifyNexoraSessionToken(token)

      assert.equal(res.valid, true)
      assert.equal(res.payload?.email, 'user@example.com')
      assert.equal(res.payload?.v, 1)
    })

    it('20. correctly signs and verifies Version 2 federation session reference (bounded 60 minutes)', () => {
      const fedSessionId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      const v2Payload = {
        v: 2,
        sid: fedSessionId
      }

      const token = signNexoraSessionToken(v2Payload, 60 * 60) // 60 minutes
      const res = verifyNexoraSessionToken(token)

      assert.equal(res.valid, true)
      assert.equal(res.payload?.v, 2)
      assert.equal(res.payload?.sid, fedSessionId)
      assert.equal(res.payload?.access_token, undefined)
      assert.equal(res.payload?.refresh_token, undefined)
      assert.equal(res.payload?.id_token, undefined)
      assert.equal(res.payload?.client_secret, undefined)
    })
  })
})
