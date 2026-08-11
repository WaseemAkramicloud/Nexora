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
    const { data: senders, error } = await supabase
      .from('sender_connections')
      .select('*')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ senders: senders || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch senders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role === 'viewer') {
      return NextResponse.json({ error: 'Viewers cannot create sender connections' }, { status: 403 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: sender, error } = await supabase
      .from('sender_connections')
      .insert({
        tenant_id: session.tenantId,
        name: body.name || 'Outreach Sender Profile',
        from_email: body.from_email || 'outreach@nexora.lam.com',
        from_name: body.from_name || 'Alexandre Vance',
        provider: body.provider || 'resend',
        daily_limit: body.daily_limit || 200,
        status: 'active'
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ sender }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create sender connection' }, { status: 500 })
  }
}
