import { NextRequest, NextResponse } from 'next/server'
import { signNexoraSessionToken } from '@/lib/auth/jwt'

export const dynamic = 'force-dynamic'

/**
 * Dedicated Development Authentication Bypass Endpoint.
 * STRICTLY SERVER-SIDE GUARDED: Rejected in production or when ENABLE_DEV_AUTH is not explicitly true.
 */
export async function POST(request: NextRequest) {
  // STRICT SERVER-SIDE ENVIRONMENT GUARD
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_AUTH !== 'true') {
    return NextResponse.json({ error: 'Development authentication bypass is strictly disabled in this environment.' }, { status: 403 })
  }

  try {
    const sessionData = {
      lamCustomerId: 'cust_dev_test_user_001',
      lamCompanyId: 'comp_dev_test_company_001',
      tenantId: 'tenant_dev_test_workspace',
      membershipId: 'mem_dev_owner_001',
      email: 'dev.tester@nexora.test',
      firstName: '[DEV ONLY] Alexandre',
      lastName: 'Dubois',
      role: 'owner' as const,
      isPlatformAdmin: false,
      grantedProducts: ['nexora'],
      createdAt: new Date().toISOString()
    }

    const sessionToken = signNexoraSessionToken(sessionData, 86400)

    const response = NextResponse.json({ success: true, session: sessionData })
    response.cookies.set('nexora_session', sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 86400
    })

    return response
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Dev login failed' }, { status: 500 })
  }
}
