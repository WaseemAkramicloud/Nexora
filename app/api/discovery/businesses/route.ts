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

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const industry = searchParams.get('industry') || ''
    const limit = Number(searchParams.get('limit')) || 50

    const supabase = getSupabaseAdmin()
    let dbQuery = supabase
      .from('businesses')
      .select('*, contacts(*), business_sources(*)')
      .eq('tenant_id', session.tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (query) {
      dbQuery = dbQuery.or(`name.ilike.%${query}%,city.ilike.%${query}%,domain.ilike.%${query}%`)
    }

    if (industry && industry !== 'All') {
      dbQuery = dbQuery.eq('industry', industry)
    }

    const { data: businesses, error } = await dbQuery

    if (error) throw error

    return NextResponse.json({ businesses: businesses || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch businesses' }, { status: 500 })
  }
}
