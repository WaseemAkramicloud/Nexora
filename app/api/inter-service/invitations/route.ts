import { NextRequest, NextResponse } from 'next/server'
import { validateInterServiceRequest } from '@/lib/auth/inter-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-lam-signature')
    const timestamp = request.headers.get('x-lam-timestamp')
    const nonce = request.headers.get('x-lam-nonce')

    // 1. Authenticate Inter-Service Request
    const authResult = validateInterServiceRequest(rawBody, { signature, timestamp, nonce })
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized inter-service request' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const { action, tenantId, email, status, lamCustomerId, firstName, lastName, role } = payload

    if (!tenantId || !email) {
      return NextResponse.json({ error: 'Missing required parameters: tenantId and email' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (action === 'invitation_accepted' || action === 'activate_member') {
      // 1. Update pending invitation record status
      await supabase
        .from('team_invitations')
        .update({ status: 'accepted' })
        .eq('tenant_id', tenantId)
        .eq('email', email)

      // 2. Create active membership in NEXORA
      if (lamCustomerId) {
        const { data: membership, error: memErr } = await supabase
          .from('memberships')
          .upsert(
            {
              tenant_id: tenantId,
              lam_customer_id: lamCustomerId,
              email,
              first_name: firstName || 'Team',
              last_name: lastName || 'Member',
              role: role || 'sales_user',
              status: 'active'
            },
            { onConflict: 'tenant_id, lam_customer_id' }
          )
          .select('*')
          .single()

        if (memErr) throw memErr

        return NextResponse.json({
          success: true,
          membership,
          message: 'Invitation accepted and NEXORA membership activated'
        })
      }
    }

    if (action === 'update_status') {
      const { data, error } = await supabase
        .from('team_invitations')
        .update({ status: status || 'pending_lam_grant' })
        .eq('tenant_id', tenantId)
        .eq('email', email)

      if (error) throw error

      return NextResponse.json({
        success: true,
        message: `Invitation status updated to '${status}'`
      })
    }

    return NextResponse.json({ success: true, message: 'Inter-service invitation event acknowledged' })
  } catch (err: any) {
    console.error('Inter-service invitation error:', err)
    return NextResponse.json({ error: err.message || 'Inter-service invitation handling failed' }, { status: 500 })
  }
}
