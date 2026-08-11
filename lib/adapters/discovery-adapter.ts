export interface DiscoveryFilter {
  industry?: string
  country?: string
  city?: string
  sizeRange?: string
  keywords?: string
  limit?: number
}

export interface DiscoveredCompanyResult {
  name: string
  domain: string
  industry: string
  sizeRange: string
  city: string
  country: string
  phone: string
  address: string
  confidenceScore: number
  source: string
}

export interface IDiscoveryAdapter {
  name: string
  searchBusinesses(filter: DiscoveryFilter): Promise<DiscoveredCompanyResult[]>
}

export class MockApolloDiscoveryAdapter implements IDiscoveryAdapter {
  name = 'Apollo / Intelligence Engine (Primary)'

  async searchBusinesses(filter: DiscoveryFilter): Promise<DiscoveredCompanyResult[]> {
    const industry = filter.industry || 'Technology'
    const country = filter.country || 'France'
    const city = filter.city || 'Paris'

    return [
      {
        name: `${industry} Dynamics SAS`,
        domain: `${industry.toLowerCase().replace(/[^a-z]/g, '')}-dynamics.io`,
        industry,
        sizeRange: filter.sizeRange || '51-200',
        city,
        country,
        phone: '+33 1 40 50 60 70',
        address: '12 Avenue des Champs-Élysées',
        confidenceScore: 0.94,
        source: 'Apollo Intelligence Engine'
      },
      {
        name: `Hexagon ${city} Solutions`,
        domain: `hexagon-${city.toLowerCase()}.com`,
        industry,
        sizeRange: '11-50',
        city,
        country,
        phone: '+33 1 89 22 11 00',
        address: '88 Rue de Rivoli',
        confidenceScore: 0.91,
        source: 'Apollo Intelligence Engine'
      },
      {
        name: 'Novagen Systems Europe',
        domain: 'novagen-europe.fr',
        industry,
        sizeRange: '201-500',
        city,
        country,
        phone: '+33 1 55 44 33 22',
        address: '24 Boulevard Haussmann',
        confidenceScore: 0.89,
        source: 'Apollo Intelligence Engine'
      }
    ]
  }
}
