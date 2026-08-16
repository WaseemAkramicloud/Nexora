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
    const { action, lamCustomerId, email, role, status } = payload

    if (!lamCustomerId || !email) {
      return NextResponse.json({ error: 'Missing required parameters: lamCustomerId and email' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (action === 'grant' || !action) {
      const { data, error } = await supabase
        .from('platform_administrators')
        .upsert(
          {
            lam_customer_id: lamCustomerId,
            email,
            role: role || 'platform_superadmin',
            status: status || 'active',
            granted_at: new Date().toISOString()
          },
          { onConflict: 'lam_customer_id' }
        )
        .select('*')
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        admin: data,
        message: 'Platform administrator authorization granted'
      })
    }

    if (action === 'revoke') {
      const { data, error } = await supabase
        .from('platform_administrators')
        .update({ status: 'revoked' })
        .eq('lam_customer_id', lamCustomerId)
        .select('*')
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        admin: data,
        message: 'Platform administrator authorization revoked'
      })
    }

    if (action === 'delete') {
      // Exactly scoped deletion by primary lam_customer_id
      const { data, error } = await supabase
        .from('platform_administrators')
        .delete()
        .eq('lam_customer_id', lamCustomerId)
        .select('*')

      if (error) throw error

      return NextResponse.json({
        success: true,
        deletedCount: data?.length || 0,
        message: `Platform administrator record for '${lamCustomerId}' deleted successfully`
      })
    }

    return NextResponse.json({ error: `Unsupported platform-admin action '${action}'` }, { status: 400 })
  } catch (err: any) {
    console.error('Platform admin inter-service error:', err)
    return NextResponse.json({ error: err.message || 'Inter-service platform admin sync failed' }, { status: 500 })
  }
}
