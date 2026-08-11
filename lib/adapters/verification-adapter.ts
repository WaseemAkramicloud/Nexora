export interface VerificationResult {
  target: string // email or phone
  type: 'email' | 'phone'
  isValid: boolean
  deliverabilityStatus: 'deliverable' | 'undeliverable' | 'risky' | 'unknown'
  mxRecordsFound?: boolean
  carrierName?: string
  score: number
}

export interface IVerificationAdapter {
  name: string
  verifyEmail(email: string): Promise<VerificationResult>
  verifyPhone(phone: string): Promise<VerificationResult>
}

export class MockZeroBounceVerificationAdapter implements IVerificationAdapter {
  name = 'ZeroBounce Email & Phone Verification'

  async verifyEmail(email: string): Promise<VerificationResult> {
    const isRisky = email.includes('admin') || email.includes('info')
    return {
      target: email,
      type: 'email',
      isValid: true,
      deliverabilityStatus: isRisky ? 'risky' : 'deliverable',
      mxRecordsFound: true,
      score: isRisky ? 0.72 : 0.98
    }
  }

  async verifyPhone(phone: string): Promise<VerificationResult> {
    return {
      target: phone,
      type: 'phone',
      isValid: true,
      deliverabilityStatus: 'deliverable',
      carrierName: 'Orange France Enterprise',
      score: 0.95
    }
  }
}
