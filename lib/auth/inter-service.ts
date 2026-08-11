import crypto from 'crypto'

const usedNonces = new Map<string, number>()
const NONCE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Clean up expired nonces periodically to prevent memory leaks.
 */
function cleanupExpiredNonces() {
  const now = Date.now()
  usedNonces.forEach((timestamp, nonce) => {
    if (now - timestamp > NONCE_TTL_MS) {
      usedNonces.delete(nonce)
    }
  })
}

/**
 * Retrieve configured LAM Inter-Service Secret.
 */
export function getInterServiceSecret(): string {
  const secret = process.env.LAM_INTER_SERVICE_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL SECURITY ERROR: LAM Inter-Service secret is unconfigured in production.')
    }
    return 'dev_lam_inter_service_secret_key_2026'
  }
  return secret
}

export interface InterServiceValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate HMAC signature, timestamp freshness, and nonce replay prevention for incoming LAM requests.
 */
export function validateInterServiceRequest(
  rawBody: string,
  headers: {
    signature?: string | null
    timestamp?: string | null
    nonce?: string | null
  },
  customSecret?: string
): InterServiceValidationResult {
  try {
    const signature = headers.signature
    const timestampStr = headers.timestamp
    const nonce = headers.nonce

    if (!signature) {
      return { valid: false, error: 'Missing x-lam-signature header.' }
    }
    if (!timestampStr) {
      return { valid: false, error: 'Missing x-lam-timestamp header.' }
    }
    if (!nonce) {
      return { valid: false, error: 'Missing x-lam-nonce header.' }
    }

    // 1. Verify Timestamp Freshness (within 5 minutes)
    const requestTimeSec = parseInt(timestampStr, 10)
    if (isNaN(requestTimeSec)) {
      return { valid: false, error: 'Invalid timestamp header format.' }
    }

    const currentTimeSec = Math.floor(Date.now() / 1000)
    const timeDelta = Math.abs(currentTimeSec - requestTimeSec)

    if (timeDelta > 300) { // 5 minutes
      return { valid: false, error: `Request timestamp is stale or skewed by ${timeDelta}s.` }
    }

    // 2. Anti-Replay Nonce Check
    cleanupExpiredNonces()
    if (usedNonces.has(nonce)) {
      return { valid: false, error: `Replayed nonce detected: '${nonce}' has already been processed.` }
    }

    // 3. Compute Expected HMAC SHA-256 Signature
    const secret = customSecret || getInterServiceSecret()
    const signatureInput = `${timestampStr}.${nonce}.${rawBody}`
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('hex')

    const cleanSignature = signature.replace(/^sha256=/i, '').trim()

    // Constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(cleanSignature, 'hex')
    const expectedBuffer = Buffer.from(expectedHmac, 'hex')

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Invalid HMAC signature.' }
    }

    // Mark nonce as used
    usedNonces.set(nonce, Date.now())

    return { valid: true }
  } catch (err: any) {
    return { valid: false, error: err.message || 'Inter-service validation failed.' }
  }
}
