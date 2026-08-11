import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { classifyResponseIntent } from '@/lib/inbox/response-classifier'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category') || ''

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('inbox_messages')
      .select('*, business:businesses(name, domain), contact:contacts(first_name, last_name, title)')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    if (category && category !== 'All') {
      query = query.eq('response_category', category)
    }

    const { data: messages, error } = await query
    if (error) throw error

    return NextResponse.json({ messages: messages || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch inbox messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messageId, category, text, subject, fromEmail, fromName, businessId } = body
    const supabase = getSupabaseAdmin()

    // 1. Human Category Override
    if (messageId && category) {
      const { data: updated, error } = await supabase
        .from('inbox_messages')
        .update({
          response_category: category,
          classified_by: 'human_corrected'
        })
        .eq('tenant_id', session.tenantId)
        .eq('id', messageId)
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ message: updated })
    }

    // 2. Inbound Reply Classification & Record
    if (text && fromEmail) {
      const classification = classifyResponseIntent(text, subject || '')
      const { data: created, error } = await supabase
        .from('inbox_messages')
        .insert({
          tenant_id: session.tenantId,
          business_id: businessId || null,
          from_email: fromEmail,
          from_name: fromName || '',
          subject: subject || 'Re: B2B Outreach',
          body_text: text,
          response_category: classification.category,
          ai_classification_confidence: classification.confidenceScore,
          classified_by: 'ai_assisted'
        })
        .select('*')
        .single()

      if (error) throw error
      return NextResponse.json({ message: created, classification }, { status: 201 })
    }

    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Inbox action failed' }, { status: 500 })
  }
}
