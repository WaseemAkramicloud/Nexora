import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, contactId, businessId } = body // action: 'export' | 'anonymize'
    const supabase = getSupabaseAdmin()

    if (action === 'export') {
      const { data: contact } = await supabase
        .from('contacts')
        .select('*, business:businesses(*)')
        .eq('tenant_id', session.tenantId)
        .eq('id', contactId)
        .single()

      await supabase.from('data_retention_jobs').insert({
        tenant_id: session.tenantId,
        action: 'export_gdpr',
        target_type: 'contact',
        target_id: contactId,
        status: 'completed'
      })

      return NextResponse.json({ exportData: contact })
    }

    if (action === 'anonymize') {
      // Execute complete erasure / anonymization
      const { data: updated } = await supabase
        .from('contacts')
        .update({
          first_name: 'Anonymized',
          last_name: 'Contact',
          title: 'Erased per GDPR',
          email: `gdpr_erased_${Date.now()}@anonymized.local`,
          phone: null,
          verification_status: 'Suppressed'
        })
        .eq('tenant_id', session.tenantId)
        .eq('id', contactId)
        .select('*')
        .single()

      await supabase.from('data_retention_jobs').insert({
        tenant_id: session.tenantId,
        action: 'anonymize_delete',
        target_type: 'contact',
        target_id: contactId,
        status: 'completed'
      })

      return NextResponse.json({ success: true, anonymized: updated })
    }

    return NextResponse.json({ error: 'Invalid compliance action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'GDPR processing failed' }, { status: 500 })
  }
}
