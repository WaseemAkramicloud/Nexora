import { NextRequest, NextResponse } from 'next/server'
import { activateTenantEntitlement } from '@/lib/lam/lam-contract'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const secret = process.env.LAM_HOOK_SECRET || 'lam_secret_hook_key_2026'

    if (authHeader !== `Bearer ${secret}` && !request.headers.get('x-lam-signature')) {
      return NextResponse.json({ error: 'Unauthorized LAM Contract Request' }, { status: 401 })
    }

    const body = await request.json()
    const tenant = await activateTenantEntitlement(body)

    return NextResponse.json({ success: true, status: 'activated', tenant })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Activation failed' }, { status: 500 })
  }
}
