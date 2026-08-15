import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getCurrentSession } from '@/lib/auth/session'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getInterServiceSecret } from '@/lib/auth/inter-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.role !== 'owner' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Only Owners and Admins can request member invitations' }, { status: 403 })
    }

    const body = await request.json()
    const { email, role = 'sales_user' } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()
    const supabase = getSupabaseAdmin()

    // 1. Check if user is already an active member in this tenant
    const { data: existingMember } = await supabase
      .from('memberships')
      .select('id')
      .eq('tenant_id', session.tenantId)
      .eq('email', cleanEmail)
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json({ error: `User '${cleanEmail}' is already a member of this workspace.` }, { status: 400 })
    }

    // 2. Create pending team invitation in NEXORA DB
    const { data: invitation, error: invErr } = await supabase
      .from('team_invitations')
      .insert({
        tenant_id: session.tenantId,
        email: cleanEmail,
        role,
        status: 'pending_lam_grant',
        requested_by: session.membershipId
      })
      .select('*')
      .single()

    if (invErr) throw invErr

    // 3. Send Inter-Service Signed Invitation Request to LAM ID
    const lamIssuer = process.env.LAM_OIDC_ISSUER || 'https://id.lubbalmandumah.com'
    const lamInvitationEndpoint = `${lamIssuer}/api/inter-service/invitations`
    const secret = getInterServiceSecret()

    const payload = JSON.stringify({
      action: 'create_invitation',
      lamCompanyId: session.lamCompanyId,
      tenantId: session.tenantId,
      email: cleanEmail,
      role,
      requestedByEmail: session.email,
      product: 'nexora'
    })

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    const signatureInput = `${timestamp}.${nonce}.${payload}`
    const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest('hex')

    let lamResultStatus = 'pending_lam_grant'
    try {
      const lamRes = await fetch(lamInvitationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-lam-signature': `sha256=${signature}`,
          'x-lam-timestamp': timestamp,
          'x-lam-nonce': nonce
        },
        body: payload
      })

      if (lamRes.ok) {
        lamResultStatus = 'sent_by_lam'
        await supabase
          .from('team_invitations')
          .update({ status: lamResultStatus })
          .eq('id', invitation.id)
      }
    } catch (e) {
      // If LAM server is unreachable in test, keep invitation pending safely
    }

    return NextResponse.json(
      {
        success: true,
        invitation: { ...invitation, status: lamResultStatus },
        message: 'Team invitation requested. LAM ID handles central identity verification and email delivery.'
      },
      { status: 201 }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invitation request failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: invitations, error } = await supabase
      .from('team_invitations')
      .select('*, requested_by_user:memberships!requested_by(*)')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ invitations: invitations || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch team invitations' }, { status: 500 })
  }
}
