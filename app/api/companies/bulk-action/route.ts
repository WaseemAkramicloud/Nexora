import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { bulkActionBusinesses } from '@/lib/db/nexora-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'


export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, businessIds = [], extra = {} } = body

    if (!action || !businessIds || businessIds.length === 0) {
      return NextResponse.json({ error: 'Missing action or target business IDs' }, { status: 400 })
    }

    if (action === 'export') {
      const supabase = getSupabaseAdmin()
      const { data: list } = await supabase
        .from('businesses')
        .select('*, contacts(*)')
        .eq('tenant_id', session.tenantId)
        .in('id', businessIds)

      // Controlled CSV generation
      const headers = ['ID', 'Name', 'Domain', 'Industry', 'City', 'Country', 'Phone', 'Status', 'Score', 'WhatsApp Consent']
      const rows = (list || []).map(b => [
        b.id,
        `"${(b.name || '').replace(/"/g, '""')}"`,
        b.domain || '',
        `"${b.industry || ''}"`,
        `"${b.city || ''}"`,
        `"${b.country || ''}"`,
        `"${b.phone || ''}"`,
        b.enrichment_status || 'Discovered',
        b.score || 50,
        b.whatsapp_authorized ? 'Yes' : 'No'
      ])

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="nexora_leads_export_${Date.now()}.csv"`
        }
      })
    }

    // Role check for bulk actions
    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot perform bulk actions' }, { status: 403 })
    }

    const result = await bulkActionBusinesses(session.tenantId, businessIds, action, extra)
    return NextResponse.json({ success: true, count: result.count })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Bulk action failed' }, { status: 500 })
  }
}
