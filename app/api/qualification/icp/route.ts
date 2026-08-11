import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: icpList, error } = await supabase
      .from('icp_criteria')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ icpCriteria: icpList || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch ICP criteria' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot create ICP criteria' }, { status: 403 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: created, error } = await supabase
      .from('icp_criteria')
      .insert({
        tenant_id: session.tenantId,
        campaign_id: body.campaign_id || null,
        name: body.name || 'Default SaaS ICP Profile',
        target_industries: body.target_industries || ['Technology & Software'],
        target_company_sizes: body.target_company_sizes || ['11-50', '51-200'],
        target_geographies: body.target_geographies || ['France', 'Europe'],
        required_signals: body.required_signals || ['Active B2B Hiring'],
        disqualifiers: body.disqualifiers || ['B2C Only', 'Sub-5 Employees']
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ icpCriteria: created }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create ICP criteria' }, { status: 500 })
  }
}
