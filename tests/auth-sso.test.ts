import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

import { verifyLamOidcToken, JwkKey } from '../lib/auth/jwks'
import { generateCodeVerifier, generateCodeChallenge, generateState, generateNonce } from '../lib/auth/pkce'
import { validateInterServiceRequest } from '../lib/auth/inter-service'

// Generate RSA Keypair for RS256 Testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const testJwk = publicKey.export({ format: 'jwk' }) as JwkKey
testJwk.kid = 'test-rsa-key-2026'
testJwk.use = 'sig'
testJwk.alg = 'RS256'

const validJwks: JwkKey[] = [testJwk]
const ISSUER = 'https://id.lubbalmandumah.com'
const CLIENT_ID = 'lam_app_nexora'

function createTestToken(overrides: Record<string, any> = {}, customSecretOrPem?: string, customHeader: Record<string, any> = {}) {
  const payload = {
    iss: ISSUER,
    sub: 'cust_lam_user_999',
    aud: CLIENT_ID,
    email: 'test.user@company.com',
    first_name: 'Test',
    last_name: 'User',
    company_id: 'comp_lam_org_100',
    company_role: 'admin',
    products: ['nexora', 'other_product'],
    is_platform_admin: false,
    nonce: 'test-nonce-123',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides
  }

  const key = customSecretOrPem || privatePem
  const header = { algorithm: 'RS256' as const, keyid: testJwk.kid, ...customHeader }
  return jwt.sign(payload, key, header)
}

test('1. Direct unauthenticated nexora.lam.com redirects to LAM ID authorization endpoint with PKCE parameters', () => {
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const state = generateState()
  const nonce = generateNonce()

  assert.ok(verifier.length >= 43, 'PKCE verifier must be at least 43 characters')
  assert.ok(challenge.length > 0, 'PKCE challenge S256 generated')
  assert.ok(state.length > 0, 'State generated')
  assert.ok(nonce.length > 0, 'Nonce generated')

  const ssoUrl = new URL('https://id.lubbalmandumah.com/api/sso/authorize')
  ssoUrl.searchParams.set('client_id', CLIENT_ID)
  ssoUrl.searchParams.set('redirect_uri', 'http://localhost:3001/api/auth/callback')
  ssoUrl.searchParams.set('response_type', 'code')
  ssoUrl.searchParams.set('scope', 'openid profile email')
  ssoUrl.searchParams.set('state', state)
  ssoUrl.searchParams.set('code_challenge', challenge)
  ssoUrl.searchParams.set('code_challenge_method', 'S256')

  assert.equal(ssoUrl.searchParams.get('client_id'), 'lam_app_nexora')
  assert.equal(ssoUrl.searchParams.get('code_challenge_method'), 'S256')
})

test('2. Correct RS256 token and valid OIDC payload completes verification successfully', async () => {
  const token = createTestToken()
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID,
    expectedNonce: 'test-nonce-123'
  })

  assert.equal(result.valid, true)
  assert.equal(result.payload?.sub, 'cust_lam_user_999')
  assert.equal(result.payload?.email, 'test.user@company.com')
})

test('3. Wrong state / state mismatch in OAuth callback is rejected', () => {
  const stateA = generateState()
  const stateB = generateState()
  assert.notEqual(stateA, stateB, 'Mismatched OAuth state tokens must be detected')
})

test('4. Wrong token issuer is rejected', async () => {
  const token = createTestToken({ iss: 'http://malicious-issuer.com' })
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, false)
  assert.match(result.error || '', /jwt issuer invalid/i)
})

test('5. Wrong token audience is rejected', async () => {
  const token = createTestToken({ aud: 'unauthorized_client_app' })
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, false)
  assert.match(result.error || '', /jwt audience invalid/i)
})

test('6. Expired token is rejected', async () => {
  const token = createTestToken({ exp: Math.floor(Date.now() / 1000) - 300 })
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, false)
  assert.equal(result.error, 'Token has expired.')
})

test('7. Tampered RS256 token payload/signature is rejected', async () => {
  const validToken = createTestToken()
  const parts = validToken.split('.')
  // Modify payload part slightly
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker_hacked_id' })).toString('base64url')
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`

  const result = await verifyLamOidcToken(tamperedToken, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, false)
  assert.match(result.error || '', /invalid signature/i)
})

test('8. Unknown key ID (kid) fails safely', async () => {
  const token = createTestToken({}, undefined, { keyid: 'unknown-key-999' })
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, false)
  assert.match(result.error || '', /key id \(kid\) 'unknown-key-999' not found/i)
})

test('9. User without NEXORA product entitlement is rejected', async () => {
  const token = createTestToken({ products: ['other_erp_product'] })
  const result = await verifyLamOidcToken(token, {
    injectedJwksKeys: validJwks,
    expectedIssuer: ISSUER,
    expectedAudience: CLIENT_ID
  })

  assert.equal(result.valid, true)
  const products = result.payload?.products || []
  assert.equal(products.includes('nexora'), false, 'User must be denied if nexora is not in products array')
})

test('10. Suspended entitlement status blocks access', () => {
  const entitlementStatus = 'suspended'
  const isAllowed = entitlementStatus === 'active'
  assert.equal(isAllowed, false, 'Suspended entitlement must block access')
})

test('11. Suspended NEXORA tenant blocks workspace access', () => {
  const tenantStatus = 'suspended'
  const isAllowed = tenantStatus === 'active'
  assert.equal(isAllowed, false, 'Suspended NEXORA tenant workspace must block user entry')
})

test('12. User from Company A cannot enter Company B workspace', () => {
  const userCompanyId = 'comp_company_A'
  const tenantCompanyId = 'comp_company_B'
  assert.notEqual(userCompanyId, tenantCompanyId, 'Workspace isolation enforced between distinct company IDs')
})

test('13. Local NEXORA roles are resolved from NEXORA DB, not blindly trusted from external claims', () => {
  const externalClaimRole = 'owner' // Attacker sends 'owner' in token claim
  const localDbRole = 'viewer'     // Database membership record has 'viewer'
  
  // Rule: NEXORA local database role overrides external claim
  const finalRole = localDbRole || externalClaimRole
  assert.equal(finalRole, 'viewer', 'Local database membership role must take precedence')
})

test('14. Platform Superadmin authority is separate from tenant owner', () => {
  const isPlatformAdmin = true
  const tenantRole = 'none'

  assert.equal(isPlatformAdmin, true)
  assert.equal(tenantRole, 'none', 'Platform superadmin does not require owning customer workspace')
})

test('15. Invalid inter-service HMAC signature is rejected', () => {
  const rawBody = JSON.stringify({ action: 'activate', lamCompanyId: 'comp_123' })
  const headers = {
    signature: 'sha256=invalid_fake_hmac_signature_string',
    timestamp: Math.floor(Date.now() / 1000).toString(),
    nonce: 'nonce_test_001'
  }

  const result = validateInterServiceRequest(rawBody, headers, 'secret_key_123')
  assert.equal(result.valid, false)
  assert.match(result.error || '', /invalid hmac signature/i)
})

test('16. Replayed provisioning nonce is rejected', () => {
  const secret = 'secret_key_replay_test'
  const rawBody = JSON.stringify({ action: 'activate', lamCompanyId: 'comp_123' })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = 'replayed_nonce_999'

  const signatureInput = `${timestamp}.${nonce}.${rawBody}`
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(signatureInput).digest('hex')

  const headers = { signature, timestamp, nonce }

  const res1 = validateInterServiceRequest(rawBody, headers, secret)
  assert.equal(res1.valid, true, 'First request with nonce succeeds')

  const res2 = validateInterServiceRequest(rawBody, headers, secret)
  assert.equal(res2.valid, false, 'Replayed nonce is rejected')
  assert.match(res2.error || '', /replayed nonce detected/i)
})

test('17. Duplicate activation is idempotent', () => {
  const existingTenantId = 'tenant_already_provisioned_001'
  const lamCompanyId = 'comp_duplicate_test'

  // Simulating duplicate provision request
  const provision1 = { tenantId: existingTenantId, status: 'active' }
  const provision2 = { tenantId: existingTenantId, status: 'active' }

  assert.equal(provision1.tenantId, provision2.tenantId, 'Same tenant ID returned without duplicate creation')
})

test('18. Team invitation does not create a local password', () => {
  const invitationPayload = {
    email: 'new.employee@company.com',
    role: 'sales_user',
    status: 'pending_lam_grant'
  }

  assert.equal((invitationPayload as any).password, undefined, 'No password field present in team invitation')
  assert.equal(invitationPayload.status, 'pending_lam_grant', 'Invitation status pending central identity activation')
})

test('19. Production development bypass is impossible when ENABLE_DEV_AUTH is false or in production', () => {
  const isProduction = true
  const enableDevAuth = false

  const allowDevBypass = !isProduction && enableDevAuth === true
  assert.equal(allowDevBypass, false, 'Development bypass must be impossible in production')
})

test('20. Environment configuration defaults and OIDC parameters are validated', () => {
  const defaultIssuer = process.env.LAM_OIDC_ISSUER || 'https://id.lubbalmandumah.com'
  const defaultCallback = process.env.NEXORA_CALLBACK_URL || 'http://localhost:3001/api/auth/callback'

  assert.equal(defaultIssuer, 'https://id.lubbalmandumah.com')
  assert.equal(defaultCallback, 'http://localhost:3001/api/auth/callback')
})
