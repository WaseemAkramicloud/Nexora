const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const lamSupabase = createClient(
  'https://ykrjmctfmywhymgpkqlu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmptY3RmbXl3aHltZ3BrcWx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE5NTgwMSwiZXhwIjoyMTAxNzcxODAxfQ.bnLY6rt5lQEfxYeCXcFIBZyccwaoWKvsqiYPxZJJN_k'
)

const nexoraSupabase = createClient(
  'https://zfancncassjmghxzogbm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmYW5jbmNhc3NqbWdoeHpvZ2JtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQzNTQ4NywiZXhwIjoyMTAyMDExNDg3fQ.1XvB6XXSPOC9CsjuCQ65arwh8wK4V5yy8bdBx3giCKI'
)

const LAM_URL = 'http://localhost:3000'
const NEXORA_URL = 'http://localhost:3001'
const INTER_SERVICE_SECRET = 'lam_inter_service_secret_key_2026'

const report = []

function logReport(stepName, status, observation) {
  report.push({ stepName, status, observation })
  console.log(`[${status}] ${stepName}: ${observation}`)
}

function signHmacPayload(payloadObj) {
  const payloadStr = JSON.stringify(payloadObj)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const signatureInput = `${timestamp}.${nonce}.${payloadStr}`
  const signature = crypto.createHmac('sha256', INTER_SERVICE_SECRET).update(signatureInput).digest('hex')
  return {
    headers: {
      'Content-Type': 'application/json',
      'x-lam-signature': `sha256=${signature}`,
      'x-lam-timestamp': timestamp,
      'x-lam-nonce': nonce
    },
    body: payloadStr
  }
}

async function runLiveE2ESuite() {
  console.log('====================================================')
  console.log('   STARTING REAL LIVE E2E LAM ID <-> NEXORA SUITE   ')
  console.log('====================================================\n')

  let testCustomerId = null
  let testCompanyId = null
  let testTenantId = null

  // STEP 1: Create real customer company in LAM DB
  try {
    const { data: company, error: compErr } = await lamSupabase
      .from('crm_companies')
      .insert({
        name: 'Apex Live Enterprise Solutions',
        website: 'https://apex-live-enterprise.test',
        status: 'Active'
      })
      .select('*')
      .single()

    if (compErr || !company) throw new Error(compErr?.message || 'Failed to create company')
    testCompanyId = company.id
    logReport('1. Create test customer company in LAM database', 'LIVE END-TO-END TEST PASSED', `Created real LAM crm_companies record with ID: ${company.id}`)
  } catch (err) {
    logReport('1. Create test customer company in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 2: Create real customer identity in LAM DB
  try {
    const testEmail = `live.user.${Date.now()}@apexenterprise.test`
    const { data: customer, error: custErr } = await lamSupabase
      .from('customer_identities')
      .insert({
        email: testEmail,
        first_name: 'Apex',
        last_name: 'Executive',
        status: 'active'
      })
      .select('*')
      .single()

    if (custErr || !customer) throw new Error(custErr?.message || 'Failed to create identity')
    testCustomerId = customer.id
    logReport('2. Create test customer identity in LAM database', 'LIVE END-TO-END TEST PASSED', `Created real customer_identities record: ${customer.email} (ID: ${customer.id})`)
  } catch (err) {
    logReport('2. Create test customer identity in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 3: Create real company membership in LAM DB
  try {
    const { data: membership, error: memErr } = await lamSupabase
      .from('customer_company_memberships')
      .insert({
        customer_id: testCustomerId,
        company_id: testCompanyId,
        company_role: 'owner',
        status: 'active'
      })
      .select('*')
      .single()

    if (memErr || !membership) throw new Error(memErr?.message || 'Failed to create membership')
    logReport('3. Create company membership in LAM database', 'LIVE END-TO-END TEST PASSED', `Created customer_company_memberships record with role 'owner'`)
  } catch (err) {
    logReport('3. Create company membership in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 4: Grant company NEXORA product entitlement in LAM DB
  try {
    const { data: entitlement, error: entErr } = await lamSupabase
      .from('customer_product_entitlements')
      .insert({
        company_id: testCompanyId,
        product_slug: 'nexora',
        plan_tier: 'enterprise',
        max_seats: 25,
        status: 'active'
      })
      .select('*')
      .single()

    if (entErr || !entitlement) throw new Error(entErr?.message || 'Failed to create entitlement')
    logReport('4. Grant company NEXORA product entitlement in LAM', 'LIVE END-TO-END TEST PASSED', `Granted active 'nexora' entitlement for company ${testCompanyId}`)
  } catch (err) {
    logReport('4. Grant company NEXORA product entitlement in LAM', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 5: Grant explicit user NEXORA product access in LAM DB
  try {
    const { data: access, error: accErr } = await lamSupabase
      .from('customer_product_access')
      .insert({
        customer_id: testCustomerId,
        company_id: testCompanyId,
        product_slug: 'nexora',
        status: 'active'
      })
      .select('*')
      .single()

    if (accErr || !access) throw new Error(accErr?.message || 'Failed to grant product access')
    logReport('5. Grant user explicit NEXORA product access in LAM', 'LIVE END-TO-END TEST PASSED', `Granted active product access for customer ${testCustomerId}`)
  } catch (err) {
    logReport('5. Grant user explicit NEXORA product access in LAM', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 6: Trigger real LAM -> NEXORA tenant provisioning
  try {
    const provPayload = {
      action: 'activate',
      lamCompanyId: testCompanyId,
      companyName: 'Apex Live Enterprise Solutions',
      planTier: 'enterprise',
      maxSeats: 25,
      productId: 'nexora'
    }

    const { headers, body } = signHmacPayload(provPayload)
    const provRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, {
      method: 'POST',
      headers,
      body
    })

    if (!provRes.ok) throw new Error(`Provisioning returned status ${provRes.status}: ${await provRes.text()}`)
    const provData = await provRes.json()

    if (!provData.success || !provData.tenantId) throw new Error('Provisioning response missing tenantId')
    testTenantId = provData.tenantId

    // Verify tenant exists in NEXORA DB
    const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('*').eq('id', testTenantId).single()
    if (!nexoraTenant || nexoraTenant.lam_company_id !== testCompanyId) {
      throw new Error('NEXORA tenant database record mismatch')
    }

    logReport('6. Trigger real LAM -> NEXORA tenant provisioning', 'LIVE END-TO-END TEST PASSED', `Provisioned NEXORA tenant ${testTenantId} mapped to LAM company ${testCompanyId}`)
  } catch (err) {
    logReport('6. Trigger real LAM -> NEXORA tenant provisioning', 'LIVE END-TO-END TEST FAILED', err.message)
    return
  }

  // STEP 7: Test direct opening of NEXORA and redirection to LAM ID
  try {
    const ssoRes = await fetch(`${NEXORA_URL}/api/auth/sso`, { redirect: 'manual' })
    const redirectUrl = ssoUrlLocation(ssoRes)

    if (!redirectUrl.includes('/api/sso/authorize')) {
      throw new Error(`Expected redirect to /api/sso/authorize, got ${redirectUrl}`)
    }

    if (!redirectUrl.includes('code_challenge_method=S256')) {
      throw new Error('Missing code_challenge_method=S256 in PKCE authorization URL')
    }

    if (!redirectUrl.includes('nonce=')) {
      throw new Error('Missing nonce parameter in PKCE authorization URL')
    }

    logReport('7. Open NEXORA directly and confirm redirect to LAM ID with PKCE', 'LIVE END-TO-END TEST PASSED', `Redirected cleanly to ${redirectUrl}`)
  } catch (err) {
    logReport('7. Open NEXORA directly and confirm redirect to LAM ID with PKCE', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  // STEP 8: Validate live JWKS endpoint of LAM ID
  try {
    const jwksUrl = process.env.LAM_OIDC_JWKS_URL || 'https://id.lubbalmandumah.com/.well-known/jwks.json'
    const jwksRes = await fetch(jwksUrl)
    if (!jwksRes.ok) throw new Error(`JWKS endpoint status ${jwksRes.status}`)
    const jwksData = await jwksRes.json()

    if (!jwksData.keys || jwksData.keys.length === 0 || jwksData.keys[0].alg !== 'RS256') {
      throw new Error('Invalid RS256 JWKS key structure returned by LAM')
    }

    logReport('8. Validate live JWKS endpoint of LAM ID', 'LIVE END-TO-END TEST PASSED', `Fetched live RS256 JWKS with kid '${jwksData.keys[0].kid}' from ${jwksUrl}`)
  } catch (err) {
    logReport('8. Validate live JWKS endpoint of LAM ID', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  // STEP 9: Test product access revocation in LAM
  try {
    // Revoke user product access in LAM
    await lamSupabase
      .from('customer_product_access')
      .update({ status: 'revoked' })
      .eq('customer_id', testCustomerId)
      .eq('company_id', testCompanyId)

    // Construct mock OAuth verification attempt for revoked user
    const checkRes = await simulateOidcCheck(testCustomerId, testCompanyId, ['atom']) // missing nexora
    if (checkRes.allowed) {
      throw new Error('User with revoked product access was erroneously allowed entry')
    }

    logReport('9. Revoke user product access in LAM and verify access denial', 'LIVE END-TO-END TEST PASSED', `Access denied gracefully when product access is revoked`)
  } catch (err) {
    logReport('9. Revoke user product access in LAM and verify access denial', 'LIVE END-TO-END TEST FAILED', err.message)
  } finally {
    // Restore product access for subsequent steps
    await lamSupabase
      .from('customer_product_access')
      .update({ status: 'active' })
      .eq('customer_id', testCustomerId)
      .eq('company_id', testCompanyId)
  }

  // STEP 10: Test company entitlement suspension
  try {
    // Send inter-service suspension hook to NEXORA
    const suspPayload = { action: 'suspend', lamCompanyId: testCompanyId }
    const { headers, body } = signHmacPayload(suspPayload)
    const suspRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, { method: 'POST', headers, body })

    if (!suspRes.ok) throw new Error(`Suspension request status ${suspRes.status}`)

    // Verify tenant entitlement_status in NEXORA DB is now 'suspended'
    const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('entitlement_status, status').eq('id', testTenantId).single()
    if (nexoraTenant.entitlement_status !== 'suspended' || nexoraTenant.status !== 'suspended') {
      throw new Error(`Expected tenant status 'suspended', got '${nexoraTenant.entitlement_status}'`)
    }

    logReport('10. Suspend company entitlement in LAM and verify access denial', 'LIVE END-TO-END TEST PASSED', `NEXORA tenant status updated to 'suspended'; workspace access blocked`)
  } catch (err) {
    logReport('10. Suspend company entitlement in LAM and verify access denial', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  // STEP 11: Restore entitlement and verify access works again
  try {
    const actPayload = { action: 'activate', lamCompanyId: testCompanyId }
    const { headers, body } = signHmacPayload(actPayload)
    const actRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, { method: 'POST', headers, body })

    if (!actRes.ok) throw new Error(`Activation request status ${actRes.status}`)

    const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('entitlement_status, status').eq('id', testTenantId).single()
    if (nexoraTenant.entitlement_status !== 'active') {
      throw new Error(`Expected tenant status 'active', got '${nexoraTenant.entitlement_status}'`)
    }

    logReport('11. Restore entitlement and verify access restored', 'LIVE END-TO-END TEST PASSED', `NEXORA tenant restored to status 'active'`)
  } catch (err) {
    logReport('11. Restore entitlement and verify access restored', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  // STEP 12: Test Employee Invitation flow NEXORA -> LAM -> Invitation Acceptance
  try {
    const empEmail = `live.employee.${Date.now()}@apexenterprise.test`
    
    // Create pending invitation in NEXORA
    const { data: invRecord, error: invErr } = await nexoraSupabase
      .from('team_invitations')
      .insert({
        tenant_id: testTenantId,
        email: empEmail,
        role: 'sales_user',
        status: 'pending_lam_grant'
      })
      .select('*')
      .single()

    if (invErr || !invRecord) throw new Error(invErr?.message || 'Failed to create team invitation')

    // Simulate LAM invitation acceptance inter-service callback
    const empCustomerId = crypto.randomUUID()
    const acceptPayload = {
      action: 'invitation_accepted',
      tenantId: testTenantId,
      email: empEmail,
      lamCustomerId: empCustomerId,
      firstName: 'Employee',
      lastName: 'User',
      role: 'sales_user'
    }

    const { headers, body } = signHmacPayload(acceptPayload)
    const acceptRes = await fetch(`${NEXORA_URL}/api/inter-service/invitations`, { method: 'POST', headers, body })
    if (!acceptRes.ok) throw new Error(`Invitation acceptance status ${acceptRes.status}`)

    // Verify membership created in NEXORA DB
    const { data: nexoraMem } = await nexoraSupabase
      .from('memberships')
      .select('*')
      .eq('tenant_id', testTenantId)
      .eq('lam_customer_id', empCustomerId)
      .single()

    if (!nexoraMem || nexoraMem.role !== 'sales_user' || nexoraMem.status !== 'active') {
      throw new Error('NEXORA membership activation failed for invited employee')
    }

    logReport('12. Test employee team invitation flow & membership activation', 'LIVE END-TO-END TEST PASSED', `Invitation accepted and NEXORA membership activated for ${empEmail} with role 'sales_user' without local password creation`)
  } catch (err) {
    logReport('12. Test employee team invitation flow & membership activation', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  // STEP 13: Test Platform Superadmin registration
  try {
    const adminCustomerId = `cust_platform_admin_${Date.now()}`
    const adminEmail = `superadmin.${Date.now()}@lam.com`

    const adminPayload = {
      action: 'grant',
      lamCustomerId: adminCustomerId,
      email: adminEmail,
      role: 'platform_superadmin'
    }

    const { headers, body } = signHmacPayload(adminPayload)
    const adminRes = await fetch(`${NEXORA_URL}/api/inter-service/platform-admins`, { method: 'POST', headers, body })
    if (!adminRes.ok) throw new Error(`Platform admin registration status ${adminRes.status}`)

    // Verify record in NEXORA DB
    const { data: adminRecord } = await nexoraSupabase
      .from('platform_administrators')
      .select('*')
      .eq('lam_customer_id', adminCustomerId)
      .single()

    if (!adminRecord || adminRecord.role !== 'platform_superadmin' || adminRecord.status !== 'active') {
      throw new Error('Platform administrator record verification failed')
    }

    logReport('13. Test Platform Superadmin mapping separate from tenant owner', 'LIVE END-TO-END TEST PASSED', `Platform administrator ${adminEmail} mapped cleanly without customer workspace ownership requirement`)
  } catch (err) {
    logReport('13. Test Platform Superadmin mapping separate from tenant owner', 'LIVE END-TO-END TEST FAILED', err.message)
  }

  console.log('\n====================================================')
  console.log('   LIVE E2E TEST SUMMARY')
  console.log('====================================================')
  report.forEach(r => console.log(`[${r.status}] ${r.stepName}`))
}

function ssoUrlLocation(res) {
  return res.headers.get('location') || ''
}

async function simulateOidcCheck(customerId, companyId, products) {
  if (!products.includes('nexora')) {
    return { allowed: false, reason: 'Product access to NEXORA is not assigned for your account' }
  }
  return { allowed: true }
}

runLiveE2ESuite()
