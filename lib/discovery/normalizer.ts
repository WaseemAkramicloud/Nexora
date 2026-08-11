import crypto from 'crypto'

/**
 * Normalizes business name by removing legal entity suffixes and special punctuation.
 */
export function normalizeBusinessName(name: string): string {
  if (!name) return ''
  
  let clean = name.trim().toLowerCase()

  // Remove common French & international legal entity suffixes
  const legalSuffixes = [
    /\bs\.?a\.?s\.?\b/g,
    /\bs\.?a\.?r\.?l\.?\b/g,
    /\be\.?u\.?r\.?l\.?\b/g,
    /\bs\.?a\.?\b/g,
    /\binc\.?\b/g,
    /\bcorp\.?\b/g,
    /\bcorporation\b/g,
    /\bllc\.?\b/g,
    /\bltd\.?\b/g,
    /\bgmbh\b/g
  ]

  legalSuffixes.forEach(pattern => {
    clean = clean.replace(pattern, '')
  })

  // Remove special characters, keep letters, numbers and single spaces
  clean = clean.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim()

  return clean
}

/**
 * Extracts and normalizes clean domain name from URL or website string.
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    let clean = url.trim().toLowerCase()
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean
    }
    const parsed = new URL(clean)
    let hostname = parsed.hostname.replace(/^www\./, '')
    return hostname || null
  } catch (e) {
    let fallback = (url || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
    return fallback || null
  }
}

/**
 * Generate a deterministic deduplication hash for a business within a tenant workspace.
 */
export function createDedupHash(tenantId: string, name: string, domain?: string | null, city?: string | null): string {
  const normName = normalizeBusinessName(name)
  const normDomain = normalizeDomain(domain) || ''
  const normCity = (city || '').trim().toLowerCase()

  const rawKey = normDomain
    ? `${tenantId}::domain::${normDomain}`
    : `${tenantId}::name_city::${normName}::${normCity}`

  return crypto.createHash('sha256').update(rawKey).digest('hex')
}
