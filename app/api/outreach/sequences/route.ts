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
    const { data: sequences, error } = await supabase
      .from('email_sequences')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ sequences: sequences || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch sequences' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot create email sequences' }, { status: 403 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: created, error } = await supabase
      .from('email_sequences')
      .insert({
        tenant_id: session.tenantId,
        campaign_id: body.campaignId || null,
        name: body.name || 'Outreach Sequence Step 1-3',
        status: 'active',
        steps: body.steps || [
          { stepNumber: 1, delayDays: 0, subjectTemplate: 'Streamlining B2B operations for {{company_name}}', bodyTemplate: 'Hi {{first_name}},\n\nI noticed {{company_name}} is expanding...' },
          { stepNumber: 2, delayDays: 3, subjectTemplate: 'Quick follow-up regarding {{company_name}}', bodyTemplate: 'Hi {{first_name}},\n\nFollowing up on my previous note...' }
        ]
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ sequence: created }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create sequence' }, { status: 500 })
  }
}
