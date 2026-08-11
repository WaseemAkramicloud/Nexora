/**
 * Helper to distinguish generic department mailboxes from named executive contacts.
 */
export function classifyContact(email?: string | null, title?: string | null, firstName?: string | null): 'named' | 'generic_business' {
  if (!email) {
    if (firstName && firstName.trim().length > 1) return 'named'
    return 'generic_business'
  }

  const prefix = email.trim().toLowerCase().split('@')[0]

  const genericPrefixes = [
    'info',
    'contact',
    'sales',
    'support',
    'help',
    'hello',
    'office',
    'billing',
    'jobs',
    'careers',
    'admin',
    'general',
    'inquiries',
    'service',
    'team'
  ]

  if (genericPrefixes.includes(prefix)) {
    return 'generic_business'
  }

  return 'named'
}
