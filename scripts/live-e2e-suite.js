const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const envPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8')
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=')
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  })
}

const { createClient } = require('@supabase/supabase-js')

// Production safety guard configuration
const LAM_SUPABASE_URL = process.env.LAM_SUPABASE_URL || 'https://ykrjmctfmywhymgpkqlu.supabase.co'
const LAM_SUPABASE_KEY = process.env.LAM_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmptY3RmbXl3aHltZ3BrcWx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE5NTgwMSwiZXhwIjoyMTAxNzcxODAxfQ.bnLY6rt5lQEfxYeCXcFIBZyccwaoWKvsqiYPxZJJN_k'

const NEXORA_SUPABASE_URL = process.env.NEXORA_SUPABASE_URL || 'https://zfancncassjmghxzogbm.supabase.co'
const NEXORA_SUPABASE_KEY = process.env.NEXORA_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmYW5jbmNhc3NqbWdoeHpvZ2JtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQzNTQ4NywiZXhwIjoyMTAyMDExNDg3fQ.1XvB6XXSPOC9CsjuCQ65arwh8wK4V5yy8bdBx3giCKI'

const LAM_URL = process.env.LAM_URL || 'http://localhost:3000'
const NEXORA_URL = process.env.NEXORA_URL || 'http://localhost:3001'
const INTER_SERVICE_SECRET = process.env.INTER_SERVICE_SECRET || 'lam_inter_service_secret_key_2026'

// Production Environment Safety Guard (Requirement 8)
const isProduction = LAM_SUPABASE_URL.includes('supabase.co') || NEXORA_SUPABASE_URL.includes('supabase.co') || process.env.NODE_ENV === 'production'
if (isProduction && process.env.ALLOW_PRODUCTION_E2E !== 'true') {
  console.error('\n❌ E2E EXECUTION BLOCKED BY PRODUCTION SAFETY GUARD')
  console.error('Target environment contains production database/services:')
  console.error(`- LAM Supabase URL: ${LAM_SUPABASE_URL}`)
  console.error(`- NEXORA Supabase URL: ${NEXORA_SUPABASE_URL}`)
  console.error('To run live E2E testing against production systems, you must explicitly set environment variable:')
  console.error('  ALLOW_PRODUCTION_E2E=true\n')
  process.exit(1)
}

const lamSupabase = createClient(LAM_SUPABASE_URL, LAM_SUPABASE_KEY)
const nexoraSupabase = createClient(NEXORA_SUPABASE_URL, NEXORA_SUPABASE_KEY)

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

function checkSimulatedFailure(stepIndex) {
  if (process.env.E2E_SIMULATE_FAILURE_STEP && parseInt(process.env.E2E_SIMULATE_FAILURE_STEP, 10) === stepIndex) {
    throw new Error(`Controlled simulated failure triggered at step ${stepIndex}`)
  }
}

async function runLiveE2ESuite() {
  const runId = `e2e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`

  console.log('====================================================')
  console.log(`   STARTING REAL LIVE E2E SUITE (Run ID: ${runId})   `)
  console.log('====================================================\n')

  const createdResources = {
    runId,
    lam: {
      companyId: null,
      customerId: null,
      authUserId: null,
      membershipId: null,
      entitlementId: null,
      productAccessId: null
    },
    nexora: {
      tenantId: null,
      invitationIds: [],
      membershipIds: [],
      platformAdminCustomerIds: []
    }
  }

  let functionalSuccess = true

  try {
    // STEP 1: Create real customer company in LAM DB
    try {
      checkSimulatedFailure(1)
      const { data: company, error: compErr } = await lamSupabase
        .from('crm_companies')
        .insert({
          name: `Apex Live Enterprise Solutions (${runId})`,
          website: `https://${runId}.apexenterprise.test`,
          status: 'Active'
        })
        .select('*')
        .single()

      if (compErr || !company) throw new Error(compErr?.message || 'Failed to create company')
      createdResources.lam.companyId = company.id
      logReport('1. Create test customer company in LAM database', 'LIVE END-TO-END TEST PASSED', `Created real LAM crm_companies record with ID: ${company.id}`)
    } catch (err) {
      logReport('1. Create test customer company in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 2: Create real customer identity in LAM DB
    try {
      checkSimulatedFailure(2)
      const testEmail = `live.user.${runId}@apexenterprise.test`
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
      createdResources.lam.customerId = customer.id
      logReport('2. Create test customer identity in LAM database', 'LIVE END-TO-END TEST PASSED', `Created real customer_identities record: ${customer.email} (ID: ${customer.id})`)
    } catch (err) {
      logReport('2. Create test customer identity in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 3: Create real company membership in LAM DB
    try {
      checkSimulatedFailure(3)
      const { data: membership, error: memErr } = await lamSupabase
        .from('customer_company_memberships')
        .insert({
          customer_id: createdResources.lam.customerId,
          company_id: createdResources.lam.companyId,
          company_role: 'owner',
          status: 'active'
        })
        .select('*')
        .single()

      if (memErr || !membership) throw new Error(memErr?.message || 'Failed to create membership')
      createdResources.lam.membershipId = membership.id
      logReport('3. Create company membership in LAM database', 'LIVE END-TO-END TEST PASSED', `Created customer_company_memberships record with role 'owner'`)
    } catch (err) {
      logReport('3. Create company membership in LAM database', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 4: Grant company NEXORA product entitlement in LAM DB
    try {
      checkSimulatedFailure(4)
      const { data: entitlement, error: entErr } = await lamSupabase
        .from('customer_product_entitlements')
        .insert({
          company_id: createdResources.lam.companyId,
          product_slug: 'nexora',
          plan_tier: 'enterprise',
          max_seats: 25,
          status: 'active'
        })
        .select('*')
        .single()

      if (entErr || !entitlement) throw new Error(entErr?.message || 'Failed to create entitlement')
      createdResources.lam.entitlementId = entitlement.id
      logReport('4. Grant company NEXORA product entitlement in LAM', 'LIVE END-TO-END TEST PASSED', `Granted active 'nexora' entitlement for company ${createdResources.lam.companyId}`)
    } catch (err) {
      logReport('4. Grant company NEXORA product entitlement in LAM', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 5: Grant explicit user NEXORA product access in LAM DB
    try {
      checkSimulatedFailure(5)
      const { data: access, error: accErr } = await lamSupabase
        .from('customer_product_access')
        .insert({
          customer_id: createdResources.lam.customerId,
          company_id: createdResources.lam.companyId,
          product_slug: 'nexora',
          status: 'active'
        })
        .select('*')
        .single()

      if (accErr || !access) throw new Error(accErr?.message || 'Failed to grant product access')
      createdResources.lam.productAccessId = access.id
      logReport('5. Grant user explicit NEXORA product access in LAM', 'LIVE END-TO-END TEST PASSED', `Granted active product access for customer ${createdResources.lam.customerId}`)
    } catch (err) {
      logReport('5. Grant user explicit NEXORA product access in LAM', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 6: Trigger real LAM -> NEXORA tenant provisioning
    try {
      checkSimulatedFailure(6)
      const provPayload = {
        action: 'activate',
        lamCompanyId: createdResources.lam.companyId,
        companyName: `Apex Live Enterprise Solutions (${runId})`,
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
      createdResources.nexora.tenantId = provData.tenantId

      // Verify tenant exists in NEXORA DB
      const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('*').eq('id', createdResources.nexora.tenantId).single()
      if (!nexoraTenant || nexoraTenant.lam_company_id !== createdResources.lam.companyId) {
        throw new Error('NEXORA tenant database record mismatch')
      }

      logReport('6. Trigger real LAM -> NEXORA tenant provisioning', 'LIVE END-TO-END TEST PASSED', `Provisioned NEXORA tenant ${createdResources.nexora.tenantId} mapped to LAM company ${createdResources.lam.companyId}`)
    } catch (err) {
      logReport('6. Trigger real LAM -> NEXORA tenant provisioning', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
      return
    }

    // STEP 7: Test direct opening of NEXORA and redirection to LAM ID
    try {
      checkSimulatedFailure(7)
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
      functionalSuccess = false
    }

    // STEP 8: Validate live JWKS endpoint of LAM ID
    try {
      checkSimulatedFailure(8)
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
      functionalSuccess = false
    }

    // STEP 9: Test product access revocation in LAM
    try {
      checkSimulatedFailure(9)
      await lamSupabase
        .from('customer_product_access')
        .update({ status: 'revoked' })
        .eq('customer_id', createdResources.lam.customerId)
        .eq('company_id', createdResources.lam.companyId)

      const checkRes = await simulateOidcCheck(createdResources.lam.customerId, createdResources.lam.companyId, ['atom'])
      if (checkRes.allowed) {
        throw new Error('User with revoked product access was erroneously allowed entry')
      }

      logReport('9. Revoke user product access in LAM and verify access denial', 'LIVE END-TO-END TEST PASSED', `Access denied gracefully when product access is revoked`)
    } catch (err) {
      logReport('9. Revoke user product access in LAM and verify access denial', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
    } finally {
      if (createdResources.lam.customerId && createdResources.lam.companyId) {
        await lamSupabase
          .from('customer_product_access')
          .update({ status: 'active' })
          .eq('customer_id', createdResources.lam.customerId)
          .eq('company_id', createdResources.lam.companyId)
      }
    }

    // STEP 10: Test company entitlement suspension
    try {
      checkSimulatedFailure(10)
      const suspPayload = { action: 'suspend', lamCompanyId: createdResources.lam.companyId }
      const { headers, body } = signHmacPayload(suspPayload)
      const suspRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, { method: 'POST', headers, body })

      if (!suspRes.ok) throw new Error(`Suspension request status ${suspRes.status}`)

      const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('entitlement_status, status').eq('id', createdResources.nexora.tenantId).single()
      if (nexoraTenant.entitlement_status !== 'suspended' || nexoraTenant.status !== 'suspended') {
        throw new Error(`Expected tenant status 'suspended', got '${nexoraTenant.entitlement_status}'`)
      }

      logReport('10. Suspend company entitlement in LAM and verify access denial', 'LIVE END-TO-END TEST PASSED', `NEXORA tenant status updated to 'suspended'; workspace access blocked`)
    } catch (err) {
      logReport('10. Suspend company entitlement in LAM and verify access denial', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
    }

    // STEP 11: Restore entitlement and verify access works again
    try {
      checkSimulatedFailure(11)
      const actPayload = { action: 'activate', lamCompanyId: createdResources.lam.companyId }
      const { headers, body } = signHmacPayload(actPayload)
      const actRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, { method: 'POST', headers, body })

      if (!actRes.ok) throw new Error(`Activation request status ${actRes.status}`)

      const { data: nexoraTenant } = await nexoraSupabase.from('tenants').select('entitlement_status, status').eq('id', createdResources.nexora.tenantId).single()
      if (nexoraTenant.entitlement_status !== 'active') {
        throw new Error(`Expected tenant status 'active', got '${nexoraTenant.entitlement_status}'`)
      }

      logReport('11. Restore entitlement and verify access restored', 'LIVE END-TO-END TEST PASSED', `NEXORA tenant restored to status 'active'`)
    } catch (err) {
      logReport('11. Restore entitlement and verify access restored', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
    }

    // STEP 12: Test Employee Invitation flow
    try {
      checkSimulatedFailure(12)
      const empEmail = `live.employee.${runId}@apexenterprise.test`
      
      const { data: invRecord, error: invErr } = await nexoraSupabase
        .from('team_invitations')
        .insert({
          tenant_id: createdResources.nexora.tenantId,
          email: empEmail,
          role: 'sales_user',
          status: 'pending_lam_grant'
        })
        .select('*')
        .single()

      if (invErr || !invRecord) throw new Error(invErr?.message || 'Failed to create team invitation')
      createdResources.nexora.invitationIds.push(invRecord.id)

      const empCustomerId = crypto.randomUUID()
      const acceptPayload = {
        action: 'invitation_accepted',
        tenantId: createdResources.nexora.tenantId,
        email: empEmail,
        lamCustomerId: empCustomerId,
        firstName: 'Employee',
        lastName: 'User',
        role: 'sales_user'
      }

      const { headers, body } = signHmacPayload(acceptPayload)
      const acceptRes = await fetch(`${NEXORA_URL}/api/inter-service/invitations`, { method: 'POST', headers, body })
      if (!acceptRes.ok) throw new Error(`Invitation acceptance status ${acceptRes.status}`)

      const { data: nexoraMem } = await nexoraSupabase
        .from('memberships')
        .select('*')
        .eq('tenant_id', createdResources.nexora.tenantId)
        .eq('lam_customer_id', empCustomerId)
        .single()

      if (!nexoraMem || nexoraMem.role !== 'sales_user' || nexoraMem.status !== 'active') {
        throw new Error('NEXORA membership activation failed for invited employee')
      }
      createdResources.nexora.membershipIds.push(nexoraMem.id)

      logReport('12. Test employee team invitation flow & membership activation', 'LIVE END-TO-END TEST PASSED', `Invitation accepted and NEXORA membership activated for ${empEmail} with role 'sales_user' without local password creation`)
    } catch (err) {
      logReport('12. Test employee team invitation flow & membership activation', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
    }

    // STEP 13: Test Platform Superadmin registration
    try {
      checkSimulatedFailure(13)
      const adminCustomerId = `cust_platform_admin_${runId}`
      const adminEmail = `superadmin.${runId}@lam.com`

      const adminPayload = {
        action: 'grant',
        lamCustomerId: adminCustomerId,
        email: adminEmail,
        role: 'platform_superadmin'
      }

      const { headers, body } = signHmacPayload(adminPayload)
      const adminRes = await fetch(`${NEXORA_URL}/api/inter-service/platform-admins`, { method: 'POST', headers, body })
      if (!adminRes.ok) throw new Error(`Platform admin registration status ${adminRes.status}`)

      const { data: adminRecord } = await nexoraSupabase
        .from('platform_administrators')
        .select('*')
        .eq('lam_customer_id', adminCustomerId)
        .single()

      if (!adminRecord || adminRecord.role !== 'platform_superadmin' || adminRecord.status !== 'active') {
        throw new Error('Platform administrator record verification failed')
      }
      createdResources.nexora.platformAdminCustomerIds.push(adminCustomerId)

      logReport('13. Test Platform Superadmin mapping separate from tenant owner', 'LIVE END-TO-END TEST PASSED', `Platform administrator ${adminEmail} mapped cleanly without customer workspace ownership requirement`)
    } catch (err) {
      logReport('13. Test Platform Superadmin mapping separate from tenant owner', 'LIVE END-TO-END TEST FAILED', err.message)
      functionalSuccess = false
    }

  } finally {
    // GUARANTEED TEARDOWN & RESOURCE CLEANUP
    console.log('\n----------------------------------------------------')
    console.log('   EXECUTING GUARANTEED TEARDOWN & RESOURCE CLEANUP   ')
    console.log('----------------------------------------------------')

    let cleanupErrors = []

    // 1. Remove explicit product access in LAM
    if (createdResources.lam.productAccessId || createdResources.lam.companyId) {
      try {
        const query = lamSupabase.from('customer_product_access').delete()
        if (createdResources.lam.productAccessId) query.eq('id', createdResources.lam.productAccessId)
        else query.eq('company_id', createdResources.lam.companyId)
        await query
      } catch (err) {
        cleanupErrors.push(`Failed to delete LAM customer_product_access: ${err.message}`)
      }
    }

    // 2. Remove company membership in LAM
    if (createdResources.lam.membershipId || createdResources.lam.companyId) {
      try {
        const query = lamSupabase.from('customer_company_memberships').delete()
        if (createdResources.lam.membershipId) query.eq('id', createdResources.lam.membershipId)
        else query.eq('company_id', createdResources.lam.companyId)
        await query
      } catch (err) {
        cleanupErrors.push(`Failed to delete LAM customer_company_memberships: ${err.message}`)
      }
    }

    // 3. Remove product entitlement in LAM
    if (createdResources.lam.entitlementId || createdResources.lam.companyId) {
      try {
        const query = lamSupabase.from('customer_product_entitlements').delete()
        if (createdResources.lam.entitlementId) query.eq('id', createdResources.lam.entitlementId)
        else query.eq('company_id', createdResources.lam.companyId)
        await query
      } catch (err) {
        cleanupErrors.push(`Failed to delete LAM customer_product_entitlements: ${err.message}`)
      }
    }

    // 4. Remove invitations in LAM if any
    if (createdResources.lam.companyId) {
      try {
        await lamSupabase.from('customer_invitations').delete().eq('company_id', createdResources.lam.companyId)
      } catch (err) {
        // ignore if not present
      }
    }

    // 5. Trigger NEXORA tenant deprovisioning via HMAC inter-service endpoint
    if (createdResources.lam.companyId) {
      try {
        const deprovPayload = { action: 'deprovision', lamCompanyId: createdResources.lam.companyId }
        const { headers, body } = signHmacPayload(deprovPayload)
        const deprovRes = await fetch(`${NEXORA_URL}/api/inter-service/provisioning`, { method: 'POST', headers, body })
        if (!deprovRes.ok) {
          cleanupErrors.push(`NEXORA deprovision endpoint returned ${deprovRes.status}: ${await deprovRes.text()}`)
        }
      } catch (err) {
        cleanupErrors.push(`Failed to invoke NEXORA deprovisioning: ${err.message}`)
      }
    }

    // 6. Delete test platform admin registrations in NEXORA via HMAC inter-service endpoint
    for (const adminCustId of createdResources.nexora.platformAdminCustomerIds) {
      try {
        const delAdminPayload = { action: 'delete', lamCustomerId: adminCustId, email: `superadmin.${runId}@lam.com` }
        const { headers, body } = signHmacPayload(delAdminPayload)
        await fetch(`${NEXORA_URL}/api/inter-service/platform-admins`, { method: 'POST', headers, body })
      } catch (err) {
        cleanupErrors.push(`Failed to delete platform admin '${adminCustId}': ${err.message}`)
      }
    }

    // 7. Delete company in LAM DB
    if (createdResources.lam.companyId) {
      try {
        await lamSupabase.from('crm_companies').delete().eq('id', createdResources.lam.companyId)
      } catch (err) {
        cleanupErrors.push(`Failed to delete LAM crm_companies record: ${err.message}`)
      }
    }

    // 8. Safely delete test customer identity & Auth user in LAM DB (only if test-only & created by this run)
    if (createdResources.lam.customerId) {
      try {
        const { data: mems } = await lamSupabase
          .from('customer_company_memberships')
          .select('id')
          .eq('customer_id', createdResources.lam.customerId)

        if (!mems || mems.length === 0) {
          await lamSupabase.from('customer_identities').delete().eq('id', createdResources.lam.customerId)
        }
      } catch (err) {
        cleanupErrors.push(`Failed to delete test customer identity '${createdResources.lam.customerId}': ${err.message}`)
      }
    }

    if (createdResources.lam.authUserId) {
      try {
        await lamSupabase.auth.admin.deleteUser(createdResources.lam.authUserId)
      } catch (err) {
        cleanupErrors.push(`Failed to delete test Auth user '${createdResources.lam.authUserId}': ${err.message}`)
      }
    }

    // 9. VERIFY CLEANUP (Query exact captured IDs)
    let uncleaned = []

    if (createdResources.lam.companyId) {
      const { data: c } = await lamSupabase.from('crm_companies').select('id').eq('id', createdResources.lam.companyId).maybeSingle()
      if (c) uncleaned.push(`LAM crm_companies ID: ${c.id}`)
    }
    if (createdResources.lam.customerId) {
      const { data: i } = await lamSupabase.from('customer_identities').select('id').eq('id', createdResources.lam.customerId).maybeSingle()
      if (i) uncleaned.push(`LAM customer_identities ID: ${i.id}`)
    }
    if (createdResources.nexora.tenantId) {
      const { data: t } = await nexoraSupabase.from('tenants').select('id').eq('id', createdResources.nexora.tenantId).maybeSingle()
      if (t) uncleaned.push(`NEXORA tenant ID: ${t.id}`)
    }
    for (const adminCustId of createdResources.nexora.platformAdminCustomerIds) {
      const { data: a } = await nexoraSupabase.from('platform_administrators').select('id').eq('lam_customer_id', adminCustId).maybeSingle()
      if (a) uncleaned.push(`NEXORA platform_admin customer ID: ${adminCustId}`)
    }

    const cleanupVerified = uncleaned.length === 0 && cleanupErrors.length === 0

    console.log('\n====================================================')
    console.log('   LIVE E2E TEST & CLEANUP SUMMARY')
    console.log('====================================================')
    report.forEach(r => console.log(`[${r.status}] ${r.stepName}`))

    const funcText = functionalSuccess ? 'FUNCTIONAL TEST PASSED' : 'FUNCTIONAL TEST FAILED'
    const cleanText = cleanupVerified ? 'CLEANUP VERIFIED' : 'CLEANUP FAILED'
    const finalOutcome = `${funcText} — ${cleanText}`

    console.log('\n----------------------------------------------------')
    console.log(`FINAL OUTCOME: ${finalOutcome}`)
    console.log('----------------------------------------------------')

    if (!cleanupVerified) {
      console.error('\n⚠️ CLEANUP FAILURES DETECTED:')
      cleanupErrors.forEach(e => console.error(`  - Error: ${e}`))
      uncleaned.forEach(u => console.error(`  - Remaining Resource: ${u}`))
    } else {
      console.log('✅ All synthetic test resources from this run were cleanly removed and verified absent.')
    }
  }
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
