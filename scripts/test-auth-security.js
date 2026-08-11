const { verifyNexoraSessionToken, signNexoraSessionToken } = require('../lib/auth/jwt')

async function runSecurityAuditTests() {
  console.log('===========================================================')
  console.log('NEXORA AUTHENTICATION SECURITY & FAIL-CLOSED TEST SUITE')
  console.log('===========================================================')

  let passed = 0
  let failed = 0

  // TEST 1: Unsigned / Fake Token Verification Rejection
  console.log('\n[TEST 1] Testing Unsigned Token Rejection...')
  const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlX3VzZXIifQ.fake_signature'
  const res1 = verifyNexoraSessionToken(fakeToken)

  if (!res1.valid && res1.error) {
    console.log('✅ TEST 1 PASSED: Unsigned token was cleanly rejected (Error:', res1.error + ')')
    passed++
  } else {
    console.error('❌ TEST 1 FAILED: Unsigned token was accepted!')
    failed++
  }

  // TEST 2: Tampered Token Verification Rejection
  console.log('\n[TEST 2] Testing Tampered Token Rejection...')
  const validPayload = { lamCustomerId: 'cust_real_123', email: 'real@company.com', lamCompanyId: 'comp_123', tenantId: 'tenant_123', membershipId: 'mem_123', firstName: 'Real', role: 'owner', grantedProducts: ['nexora'], createdAt: new Date().toISOString() }
  const validToken = signNexoraSessionToken(validPayload, 3600)
  const tamperedToken = validToken.substring(0, validToken.length - 6) + 'XXXXXX'

  const res2 = verifyNexoraSessionToken(tamperedToken)
  if (!res2.valid) {
    console.log('✅ TEST 2 PASSED: Tampered token signature was cleanly rejected.')
    passed++
  } else {
    console.error('❌ TEST 2 FAILED: Tampered token was accepted!')
    failed++
  }

  // TEST 3: Environment Production Bypass Guard Verification
  console.log('\n[TEST 3] Testing Production Dev Bypass Rejection...')
  const originalEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  process.env.ENABLE_DEV_AUTH = 'false'

  // Import dev login route handler directly
  const devLoginRoute = require('../app/api/auth/dev-login/route')
  const mockReq = { headers: new Map() }
  const res3 = await devLoginRoute.POST(mockReq)
  const data3 = await res3.json()

  if (res3.status === 403 && data3.error) {
    console.log('✅ TEST 3 PASSED: Dev login route strictly returned 403 Forbidden in production mode.')
    passed++
  } else {
    console.error('❌ TEST 3 FAILED: Dev login route succeeded in production mode!')
    failed++
  }

  process.env.NODE_ENV = originalEnv

  console.log('\n===========================================================')
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`)
  console.log('===========================================================')

  if (failed > 0) process.exit(1)
}

runSecurityAuditTests().catch(err => {
  console.error('Security test runner error:', err)
  process.exit(1)
})
