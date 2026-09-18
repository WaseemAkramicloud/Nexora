import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('NEXORA Stage 6C.1 closure', () => {
  it('presents only Maftah on the customer login page', () => {
    const login = read('app/login/maftah/pilot-client.tsx')
    const translations = read('lib/i18n/translations.ts')

    assert.match(login, /href="\/api\/auth\/maftah"/)
    assert.match(login, /pt\.securedBy/)
    assert.doesNotMatch(login, /Return to standard login|returnStandard|Controlled Pilot Access|Product ID/)
    assert.doesNotMatch(login, /href="\/"/)
    assert.doesNotMatch(login, /api\/auth\/sso|id\.lubbalmandumah\.com/)
    assert.doesNotMatch(translations, /Controlled Pilot Access|Accès Pilote Contrôlé|وصول تجريبي منضبط|Return to standard login|Retour à la connexion standard|العودة لتسجيل الدخول القياسي/)
  })

  it('keeps legacy auth code unlinked from normal user-facing entrypoints', () => {
    const rootPage = read('app/page.tsx')
    const unauthorizedPage = read('app/auth/unauthorized/page.tsx')

    for (const source of [rootPage, unauthorizedPage]) {
      assert.match(source, /href="\/login\/maftah"/)
      assert.doesNotMatch(source, /href="\/api\/auth\/sso"/)
      assert.doesNotMatch(source, /id\.lubbalmandumah\.com/)
    }
  })

  it('removes incident-only console diagnostics and retains operational telemetry', () => {
    const callback = read('app/api/auth/maftah/callback/route.ts')
    const oauth = read('lib/auth/maftah-oauth.ts')
    const legacyCallback = read('app/api/auth/callback/route.ts')
    const legacyInitiation = read('app/api/auth/sso/route.ts')
    const observability = read('lib/auth/observability.ts')

    assert.doesNotMatch(callback, /NEXORA_MAFTAH_DIAG/)
    assert.doesNotMatch(oauth, /NEXORA_MAFTAH_DIAG/)
    assert.doesNotMatch(legacyCallback, /OIDC CALLBACK TRACE|OIDC TOKEN VERIFICATION TRACE|console\.(log|error)/)
    assert.doesNotMatch(legacyInitiation, /OIDC SSO INIT TRACE|console\.(log|error)/)
    assert.match(callback, /logAuthOperationalEvent/)
    assert.match(legacyCallback, /legacy_login_failed/)
    assert.match(observability, /service_log_auth_operational_event/)
    assert.match(observability, /AUTH_OPERATIONAL_EVENT/)
  })

  it('keeps multi-organization workspace selection and Maftah-only failures intact', () => {
    const callback = read('app/api/auth/maftah/callback/route.ts')
    const workspaceActions = read('app/select-workspace/actions.ts')
    const finalization = read('lib/auth/federation-session-finalization.ts')

    assert.match(callback, /organization_selection_required/)
    assert.match(callback, /service_create_login_transaction/)
    assert.match(callback, /\/select-workspace/)
    assert.match(workspaceActions, /transactionId/)
    assert.match(finalization, /service_consume_login_transaction/)
    assert.doesNotMatch(callback, /id\.lubbalmandumah\.com/)
  })

  it('verifies the current federation objects and service-role-only RPC boundary', () => {
    const baseVerification = read('supabase/verification/20260903040000_verify_nexora_federation_adapter.sql')
    const engineVerification = read('supabase/verification/20260903050000_verify_nexora_refresh_and_revalidation_engine.sql')
    const verification = `${baseVerification}\n${engineVerification}`

    for (const table of [
      'external_identities',
      'external_identity_memberships',
      'federation_workspace_links',
      'federation_sessions',
      'federation_session_credentials',
      'federation_login_transactions'
    ]) {
      assert.match(verification, new RegExp(table))
    }

    for (const rpc of [
      'service_create_login_transaction',
      'service_get_login_transaction',
      'service_consume_login_transaction',
      'service_begin_federation_refresh',
      'service_complete_federation_refresh',
      'service_abort_federation_refresh',
      'service_begin_maftah_revalidation',
      'service_record_maftah_revalidation',
      'service_abort_maftah_revalidation',
      'service_cleanup_expired_sessions',
      'service_get_federation_session'
    ]) {
      assert.match(verification, new RegExp(rpc))
    }

    assert.match(verification, /has_function_privilege\('service_role'/)
    assert.match(verification, /NOT has_function_privilege\('anon'/)
    assert.match(verification, /NOT has_function_privilege\('authenticated'/)
    assert.match(engineVerification, /DELETE FROM nexora_internal\.federation_session_credentials/)
  })

  it('uses current rollback signatures and no obsolete identity-link table', () => {
    const rollback = read('supabase/rollback/20260903040000_rollback_nexora_federation_adapter.sql')

    assert.doesNotMatch(rollback, /external_identity_links/)
    assert.match(rollback, /service_get_federation_identity_link\(TEXT, TEXT, UUID\)/)
    assert.match(rollback, /service_store_federation_credentials\(UUID, TEXT, TEXT, TEXT\)/)
    assert.match(rollback, /service_provision_federation_link\(UUID, UUID, TEXT, UUID, TEXT\)/)
  })
})
