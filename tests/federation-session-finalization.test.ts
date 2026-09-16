import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFederationSessionExpiresAt,
  finalizeFederationSession,
  FederationSessionRpcClient
} from '../lib/auth/federation-session-finalization'
import { FEDERATION_SESSION_MAX_AGE_SECONDS } from '../lib/auth/maftah-oauth'

type RpcBehavior = {
  data: unknown
  error: { message?: string } | null
}

class MockFederationRpcClient implements FederationSessionRpcClient {
  readonly calls: Array<{ functionName: string; args?: Record<string, unknown> }> = []
  sessionStatus: 'active' | 'revoked' = 'active'
  credentialsPersisted = false
  transactionConsumed = false

  constructor(private readonly behavior: Record<string, RpcBehavior>) {}

  async rpc(functionName: string, args?: Record<string, unknown>): Promise<RpcBehavior> {
    this.calls.push({ functionName, args })
    const response = this.behavior[functionName] || { data: null, error: { message: 'unexpected_rpc' } }

    if (!response.error && response.data === true) {
      if (functionName === 'service_store_federation_credentials') this.credentialsPersisted = true
      if (functionName === 'service_consume_login_transaction') this.transactionConsumed = true
      if (functionName === 'service_revoke_federation_session') {
        this.sessionStatus = 'revoked'
        this.credentialsPersisted = false
      }
    }

    return response
  }
}

const encryptedCredentials = {
  ciphertext: 'encrypted-ciphertext-only',
  iv: '00112233445566778899aabb',
  tag: '00112233445566778899aabbccddeeff'
}

describe('NEXORA federation session finalization fail-closed contract', () => {
  it('credential storage failure revokes the new session and cannot complete login', async () => {
    const db = new MockFederationRpcClient({
      service_store_federation_credentials: { data: null, error: { message: 'storage_failed' } },
      service_revoke_federation_session: { data: true, error: null }
    })

    const result = await finalizeFederationSession(db, {
      sessionId: 'session-1',
      transactionId: 'transaction-1',
      encryptedCredentials
    })

    assert.deepEqual(result, {
      success: false,
      error: 'credential_storage_failed',
      cleanupSucceeded: true
    })
    assert.equal(db.sessionStatus, 'revoked')
    assert.equal(db.credentialsPersisted, false)
    assert.equal(db.transactionConsumed, false)
    assert.deepEqual(db.calls.map((call) => call.functionName), [
      'service_store_federation_credentials',
      'service_revoke_federation_session'
    ])
  })

  it('credential encryption failure revokes the new session before any storage call', async () => {
    const db = new MockFederationRpcClient({
      service_revoke_federation_session: { data: true, error: null }
    })

    const result = await finalizeFederationSession(db, {
      sessionId: 'session-encryption-failure',
      transactionId: 'transaction-encryption-failure',
      encryptedCredentials: () => {
        throw new Error('sensitive encryption failure detail')
      }
    })

    assert.deepEqual(result, {
      success: false,
      error: 'credential_storage_failed',
      cleanupSucceeded: true
    })
    assert.equal(db.sessionStatus, 'revoked')
    assert.deepEqual(db.calls.map((call) => call.functionName), [
      'service_revoke_federation_session'
    ])
  })

  it('transaction consumption failure revokes the session and destroys stored credentials', async () => {
    const db = new MockFederationRpcClient({
      service_store_federation_credentials: { data: true, error: null },
      service_consume_login_transaction: { data: false, error: null },
      service_revoke_federation_session: { data: true, error: null }
    })

    const result = await finalizeFederationSession(db, {
      sessionId: 'session-2',
      transactionId: 'transaction-2',
      encryptedCredentials
    })

    assert.deepEqual(result, {
      success: false,
      error: 'transaction_consumption_failed',
      cleanupSucceeded: true
    })
    assert.equal(db.sessionStatus, 'revoked')
    assert.equal(db.credentialsPersisted, false)
    assert.equal(db.transactionConsumed, false)
    assert.deepEqual(db.calls.map((call) => call.functionName), [
      'service_store_federation_credentials',
      'service_consume_login_transaction',
      'service_revoke_federation_session'
    ])
  })

  it('successful workspace selection stores credentials and consumes the transaction exactly once', async () => {
    const db = new MockFederationRpcClient({
      service_store_federation_credentials: { data: true, error: null },
      service_consume_login_transaction: { data: true, error: null }
    })

    const result = await finalizeFederationSession(db, {
      sessionId: 'session-3',
      transactionId: 'transaction-3',
      encryptedCredentials
    })

    assert.deepEqual(result, { success: true })
    assert.equal(db.sessionStatus, 'active')
    assert.equal(db.credentialsPersisted, true)
    assert.equal(db.transactionConsumed, true)
    assert.equal(db.calls.filter((call) => call.functionName === 'service_store_federation_credentials').length, 1)
    assert.equal(db.calls.filter((call) => call.functionName === 'service_consume_login_transaction').length, 1)
    assert.equal(db.calls.filter((call) => call.functionName === 'service_revoke_federation_session').length, 0)
  })

  it('successful direct authorization persists credentials without consuming a nonexistent transaction', async () => {
    const db = new MockFederationRpcClient({
      service_store_federation_credentials: { data: true, error: null }
    })

    const result = await finalizeFederationSession(db, {
      sessionId: 'session-4',
      encryptedCredentials
    })

    assert.deepEqual(result, { success: true })
    assert.equal(db.credentialsPersisted, true)
    assert.equal(db.calls.some((call) => call.functionName === 'service_consume_login_transaction'), false)
  })

  it('builds the successful federation session expiry at exactly eight hours', () => {
    const now = Date.UTC(2026, 8, 17, 12, 0, 0)
    const expiresAt = new Date(buildFederationSessionExpiresAt(now)).getTime()
    assert.equal(expiresAt - now, FEDERATION_SESSION_MAX_AGE_SECONDS * 1000)
  })

  it('does not write credential or token values to logs', async () => {
    const accessToken = 'access-token-must-never-be-logged'
    const refreshToken = 'refresh-token-must-never-be-logged'
    const messages: string[] = []
    const originalLog = console.log
    const originalWarn = console.warn
    console.log = (...args: unknown[]) => messages.push(args.join(' '))
    console.warn = (...args: unknown[]) => messages.push(args.join(' '))

    try {
      const db = new MockFederationRpcClient({
        service_store_federation_credentials: { data: true, error: null },
        service_consume_login_transaction: { data: true, error: null }
      })
      const result = await finalizeFederationSession(db, {
        sessionId: 'session-5',
        transactionId: 'transaction-5',
        encryptedCredentials
      })

      assert.deepEqual(result, { success: true })
      const logged = messages.join('\n')
      assert.equal(logged.includes(accessToken), false)
      assert.equal(logged.includes(refreshToken), false)
      assert.equal(logged.includes(encryptedCredentials.ciphertext), false)
    } finally {
      console.log = originalLog
      console.warn = originalWarn
    }
  })
})
