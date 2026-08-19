import {
  isProductionEnv,
  getNexoraBaseUrl,
  getNexoraCallbackUrl,
  getLamAuthorizeEndpoint,
  getLamTokenEndpoint,
  getLamUserinfoEndpoint,
  getLamJwksEndpoint,
  getLamIssuer,
  getLamClientId
} from '../lib/auth/config'

async function runProductionOidcUrlTests() {
  console.log('===========================================================')
  console.log('NEXORA PRODUCTION OIDC ENDPOINT RESOLUTION TEST SUITE')
  console.log('===========================================================')

  // Save current env
  const origNodeEnv = process.env.NODE_ENV
  const origBaseUrl = process.env.NEXORA_BASE_URL
  const origCallbackUrl = process.env.NEXORA_CALLBACK_URL
  const origAuthUrl = process.env.LAM_OIDC_AUTHORIZE_URL

  let passed = 0
  let failed = 0

  try {
    // Force NODE_ENV to production for testing fail-closed rules
    ;(process.env as any).NODE_ENV = 'production'
    process.env.NEXORA_BASE_URL = 'http://localhost:3001' // Attempt to inject localhost
    process.env.NEXORA_CALLBACK_URL = 'http://localhost:3001/api/auth/callback'
    process.env.LAM_OIDC_AUTHORIZE_URL = 'http://localhost:3000/api/sso/authorize'

    console.log('\n[TEST 1] Production Fail-Closed Localhost Override Rejection...')
    const authUrl = getLamAuthorizeEndpoint()
    const callbackUrl = getNexoraCallbackUrl('http://localhost:3001')
    const baseUrl = getNexoraBaseUrl('http://localhost:3001')
    const tokenUrl = getLamTokenEndpoint()
    const userinfoUrl = getLamUserinfoEndpoint()
    const jwksUrl = getLamJwksEndpoint()
    const issuer = getLamIssuer()
    const clientId = getLamClientId()

    console.log('   Resolved Authorize Endpoint:', authUrl)
    console.log('   Resolved Callback URL:      ', callbackUrl)
    console.log('   Resolved Base URL:          ', baseUrl)
    console.log('   Resolved Token Endpoint:    ', tokenUrl)
    console.log('   Resolved UserInfo Endpoint: ', userinfoUrl)
    console.log('   Resolved JWKS Endpoint:     ', jwksUrl)

    if (
      authUrl === 'https://id.lubbalmandumah.com/api/sso/authorize' &&
      callbackUrl === 'https://nexora.lubbalmandumah.com/api/auth/callback' &&
      baseUrl === 'https://nexora.lubbalmandumah.com' &&
      tokenUrl === 'https://id.lubbalmandumah.com/api/sso/token' &&
      userinfoUrl === 'https://id.lubbalmandumah.com/api/sso/userinfo' &&
      jwksUrl === 'https://id.lubbalmandumah.com/.well-known/jwks.json' &&
      issuer === 'https://id.lubbalmandumah.com' &&
      clientId === 'lam_app_nexora'
    ) {
      console.log('✅ TEST 1 PASSED: Production mode strictly rejected localhost and resolved 100% production endpoints!')
      passed++
    } else {
      console.error('❌ TEST 1 FAILED: Localhost endpoint was leaked in production mode!')
      failed++
    }

    console.log('\n[TEST 2] Verifying Zero Localhost Reference in Production SSO Init...')
    const { GET: ssoInitGET } = require('../app/api/auth/sso/route')
    const mockRequest = {
      nextUrl: new URL('https://nexora.lubbalmandumah.com/api/auth/sso?returnUrl=/dashboard')
    } as any

    const response = await ssoInitGET(mockRequest)
    const redirectTarget = response.headers.get('location') || ''
    console.log('   SSO Redirect Target:', redirectTarget)

    if (
      redirectTarget.startsWith('https://id.lubbalmandumah.com/api/sso/authorize') &&
      redirectTarget.includes('redirect_uri=https%3A%2F%2Fnexora.lubbalmandumah.com%2Fapi%2Fauth%2Fcallback') &&
      !redirectTarget.includes('localhost')
    ) {
      console.log('✅ TEST 2 PASSED: SSO Init generated canonical production authorization URL with zero localhost leakage!')
      passed++
    } else {
      console.error('❌ TEST 2 FAILED: SSO Init generated invalid or localhost URL!', redirectTarget)
      failed++
    }
  } finally {
    // Restore env
    ;(process.env as any).NODE_ENV = origNodeEnv
    if (origBaseUrl) process.env.NEXORA_BASE_URL = origBaseUrl
    else delete process.env.NEXORA_BASE_URL
    if (origCallbackUrl) process.env.NEXORA_CALLBACK_URL = origCallbackUrl
    else delete process.env.NEXORA_CALLBACK_URL
    if (origAuthUrl) process.env.LAM_OIDC_AUTHORIZE_URL = origAuthUrl
    else delete process.env.LAM_OIDC_AUTHORIZE_URL
  }

  console.log('\n===========================================================')
  console.log(`PRODUCTION OIDC TEST SUMMARY: ${passed} Passed, ${failed} Failed`)
  console.log('===========================================================')

  if (failed > 0) process.exit(1)
}

runProductionOidcUrlTests().catch(err => {
  console.error('Test execution error:', err)
  process.exit(1)
})
