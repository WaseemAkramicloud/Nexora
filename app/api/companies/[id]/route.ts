import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getBusinessFullProfile } from '@/lib/db/nexora-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'


export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await getBusinessFullProfile(session.tenantId, params.id)
    return NextResponse.json({ profile })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Business profile not found' }, { status: 404 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot update company profile' }, { status: 403 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: updated, error } = await supabase
      .from('businesses')
      .update({
        name: body.name,
        domain: body.domain,
        industry: body.industry,
        size_range: body.size_range,
        phone: body.phone,
        address: body.address,
        city: body.city,
        country: body.country,
        score: body.score,
        owner_id: body.owner_id || null,
        tags: body.tags || [],
        enrichment_status: body.enrichment_status || 'Discovered',
        whatsapp_authorized: Boolean(body.whatsapp_authorized)
      })
      .eq('tenant_id', session.tenantId)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ profile: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update company' }, { status: 500 })
  }
}
