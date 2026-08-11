import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { verifyEmail } from '@/lib/enrichment/email-verifier'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 })
    }

    const result = await verifyEmail(email)
    return NextResponse.json({ result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Email verification failed' }, { status: 500 })
  }
}
