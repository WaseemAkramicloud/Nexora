export interface EnrichmentRequest {
  domain: string
  companyName: string
  contactName?: string
  contactTitle?: string
}

export interface EnrichedContactResult {
  firstName: string
  lastName: string
  title: string
  email: string
  phone: string
  linkedinUrl: string
  confidenceScore: number
}

export interface IEnrichmentAdapter {
  name: string
  enrichCompanyContacts(request: EnrichmentRequest): Promise<EnrichedContactResult[]>
}

export class MockHunterEnrichmentAdapter implements IEnrichmentAdapter {
  name = 'Hunter & Lusha Enrichment Engine'

  async enrichCompanyContacts(request: EnrichmentRequest): Promise<EnrichedContactResult[]> {
    const domain = request.domain || 'company.com'
    const prefix = domain.split('.')[0] || 'company'

    return [
      {
        firstName: 'Marc',
        lastName: 'Lefebvre',
        title: 'Chief Executive Officer',
        email: `m.lefebvre@${domain}`,
        phone: '+33 6 44 55 66 77',
        linkedinUrl: `https://linkedin.com/in/marc-lefebvre-${prefix}`,
        confidenceScore: 0.96
      },
      {
        firstName: 'Sophie',
        lastName: 'Bernard',
        title: 'Head of Growth & Procurement',
        email: `sophie.b@${domain}`,
        phone: '+33 6 11 22 33 44',
        linkedinUrl: `https://linkedin.com/in/sophie-bernard-${prefix}`,
        confidenceScore: 0.92
      }
    ]
  }
}
