export type ResponseCategory =
  | 'Interested'
  | 'Not Interested'
  | 'Referral'
  | 'Out of Office'
  | 'Unsubscribe'
  | 'Unclear'
  | 'Manual Review'

export interface ClassificationResult {
  category: ResponseCategory
  confidenceScore: number
  explanation: string
}

/**
 * AI-assisted sentiment and intent classifier mapping incoming prospect emails into standard response categories.
 */
export function classifyResponseIntent(text: string, subject: string = ''): ClassificationResult {
  if (!text) {
    return {
      category: 'Unclear',
      confidenceScore: 0.5,
      explanation: 'Empty response body provided'
    }
  }

  const combined = (subject + ' ' + text).toLowerCase().trim()

  // 1. Out of Office Detection
  if (
    combined.includes('out of office') ||
    combined.includes('auto-reply') ||
    combined.includes('automatic reply') ||
    combined.includes('on vacation') ||
    combined.includes('leave until')
  ) {
    return {
      category: 'Out of Office',
      confidenceScore: 0.98,
      explanation: 'Automated out-of-office notification detected'
    }
  }

  // 2. Unsubscribe / Opt-out Detection
  if (
    combined.includes('unsubscribe') ||
    combined.includes('remove me') ||
    combined.includes('stop emailing') ||
    combined.includes('take me off') ||
    combined.includes('do not contact')
  ) {
    return {
      category: 'Unsubscribe',
      confidenceScore: 0.95,
      explanation: 'Opt-out / unsubscribe intent detected'
    }
  }

  // 3. Referral / Redirect Detection
  if (
    combined.includes('speak to') ||
    combined.includes('reach out to') ||
    combined.includes('contact my colleague') ||
    combined.includes('forwarded to') ||
    combined.includes('copied in')
  ) {
    return {
      category: 'Referral',
      confidenceScore: 0.90,
      explanation: 'Prospect referred another decision maker colleague'
    }
  }

  // 4. Interested / Qualified Pipeline Opportunity Detection
  if (
    combined.includes('demo') ||
    combined.includes('schedule') ||
    combined.includes('call') ||
    combined.includes('proposal') ||
    combined.includes('pricing') ||
    combined.includes('interested') ||
    combined.includes('sounds good') ||
    combined.includes('send more info')
  ) {
    return {
      category: 'Interested',
      confidenceScore: 0.94,
      explanation: 'High interest signal for demo or commercial proposal'
    }
  }

  // 5. Not Interested Detection
  if (
    combined.includes('not interested') ||
    combined.includes('no thanks') ||
    combined.includes('pass on this') ||
    combined.includes('not looking') ||
    combined.includes('don\'t need')
  ) {
    return {
      category: 'Not Interested',
      confidenceScore: 0.92,
      explanation: 'Explicit lack of commercial fit or interest'
    }
  }

  return {
    category: 'Unclear',
    confidenceScore: 0.65,
    explanation: 'Ambiguous reply text requiring human review'
  }
}
