import { FEDERATION_SESSION_MAX_AGE_SECONDS } from './maftah-oauth'

interface RpcError {
  message?: string
}

interface RpcResponse {
  data: unknown
  error: RpcError | null
}

export interface FederationSessionRpcClient {
  rpc(functionName: string, args?: Record<string, unknown>): PromiseLike<RpcResponse>
}

export interface EncryptedFederationCredentials {
  ciphertext: string
  iv: string
  tag: string
}

export type FederationSessionFinalizationResult =
  | { success: true }
  | {
      success: false
      error: 'credential_storage_failed' | 'transaction_consumption_failed'
      cleanupSucceeded: boolean
    }

export function buildFederationSessionExpiresAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + FEDERATION_SESSION_MAX_AGE_SECONDS * 1000).toISOString()
}

async function revokeIncompleteFederationSession(
  adminDb: FederationSessionRpcClient,
  sessionId: string
): Promise<boolean> {
  try {
    const { data, error } = await adminDb.rpc('service_revoke_federation_session', {
      p_session_id: sessionId
    })
    return !error && data === true
  } catch {
    return false
  }
}

/**
 * Persist the credential vault entry and, for workspace selection, consume the
 * one-time login transaction before the caller is allowed to issue a cookie.
 * Any failure revokes the newly created server session and destroys credentials.
 */
export async function finalizeFederationSession(
  adminDb: FederationSessionRpcClient,
  input: {
    sessionId: string
    encryptedCredentials: EncryptedFederationCredentials | (() => EncryptedFederationCredentials)
    transactionId?: string
  }
): Promise<FederationSessionFinalizationResult> {
  let encryptedCredentials: EncryptedFederationCredentials
  let credentialsStored = false

  try {
    encryptedCredentials = typeof input.encryptedCredentials === 'function'
      ? input.encryptedCredentials()
      : input.encryptedCredentials

    const { data, error } = await adminDb.rpc('service_store_federation_credentials', {
      p_session_id: input.sessionId,
      p_encrypted_credentials: encryptedCredentials.ciphertext,
      p_iv: encryptedCredentials.iv,
      p_tag: encryptedCredentials.tag
    })
    credentialsStored = !error && data === true
  } catch {
    credentialsStored = false
  }

  if (!credentialsStored) {
    return {
      success: false,
      error: 'credential_storage_failed',
      cleanupSucceeded: await revokeIncompleteFederationSession(adminDb, input.sessionId)
    }
  }

  if (input.transactionId) {
    let transactionConsumed = false

    try {
      const { data, error } = await adminDb.rpc('service_consume_login_transaction', {
        p_transaction_id: input.transactionId
      })
      transactionConsumed = !error && data === true
    } catch {
      transactionConsumed = false
    }

    if (!transactionConsumed) {
      return {
        success: false,
        error: 'transaction_consumption_failed',
        cleanupSucceeded: await revokeIncompleteFederationSession(adminDb, input.sessionId)
      }
    }
  }

  return { success: true }
}
