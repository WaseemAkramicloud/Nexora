import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  decryptCredential,
  callMaftahResolveEntry
} from '@/lib/auth/maftah-oauth'
import { selectWorkspaceAction } from './actions'

export const metadata = {
  title: 'Select Workspace — NEXORA',
  description: 'Choose your organization to access NEXORA'
}

export default async function SelectWorkspacePage() {
  const cookieStore = cookies()
  const txId = cookieStore.get('nexora_maftah_tx')?.value

  if (!txId) {
    redirect('/login/maftah?error=no_active_login_transaction')
  }

  const adminDb = getSupabaseAdmin()
  const { data: tx, error } = await adminDb.rpc('service_get_login_transaction', {
    p_transaction_id: txId
  })

  if (error || !tx || tx.status !== 'pending') {
    redirect('/login/maftah?error=transaction_expired')
  }

  let accessToken: string
  try {
    const aad = `${tx.subject}:nexora_maftah_login_transaction`
    const tokens = decryptCredential<{ access_token: string }>(
      tx.encrypted_credentials,
      tx.iv,
      tx.tag,
      aad
    )
    accessToken = tokens.access_token
  } catch {
    redirect('/login/maftah?error=credential_decryption_failed')
  }

  const resolveRes = await callMaftahResolveEntry(accessToken)
  if (!resolveRes.success || !resolveRes.data?.eligible_organizations) {
    redirect('/login/maftah?error=failed_to_load_organizations')
  }

  const orgs = resolveRes.data.eligible_organizations

  return (
    <main className="min-h-screen w-full bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
            N
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Select Workspace</h1>
          <p className="text-xs text-slate-400 mt-1">Choose an organization to continue into NEXORA</p>
        </div>

        <form action={selectWorkspaceAction} className="space-y-3">
          <input type="hidden" name="transaction_id" value={txId} />

          {orgs.map((org) => (
            <button
              key={org.id}
              type="submit"
              name="organization_id"
              value={org.id}
              className="w-full p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-indigo-500 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div>
                <div className="font-semibold text-white text-sm group-hover:text-indigo-400 transition-colors">
                  {org.name}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{org.slug}</div>
              </div>
              <div className="w-6 h-6 rounded-lg bg-slate-600 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700 text-center">
          <a href="/login/maftah" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            ← Cancel and return to sign in
          </a>
        </div>
      </div>
    </main>
  )
}
