import { LogOut, ShieldCheck, ArrowLeftRight } from 'lucide-react'

interface AccountSessionControlProps {
  firstName?: string | null
  lastName?: string | null
  role: string
  roleLabel: string
  signOutLabel: string
  switchWorkspaceLabel?: string
  workspaceName?: string | null
}

export function AccountSessionControl({
  firstName,
  lastName,
  role,
  roleLabel,
  signOutLabel,
  switchWorkspaceLabel = 'Switch workspace',
  workspaceName
}: AccountSessionControlProps) {
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'NEXORA user'

  return (
    <div className="flex items-center gap-3 pl-3 border-l border-white/10" aria-label="Account and session">
      <div className="text-right hidden sm:block">
        <div className="text-xs font-semibold text-white flex items-center justify-end gap-1.5">
          <span>{displayName}</span>
          {workspaceName && (
            <span
              className="text-[10px] font-medium text-slate-300 bg-white/10 px-1.5 py-0.5 rounded border border-white/10 max-w-[130px] truncate"
              title={workspaceName}
            >
              {workspaceName}
            </span>
          )}
        </div>
        <div className="text-[10px] text-indigo-400 flex items-center justify-end gap-1 mt-0.5">
          <ShieldCheck className="w-3 h-3" />
          <span data-role={role}>{roleLabel}</span>
        </div>
      </div>

      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-indigo-500/30">
        {firstName?.[0] || 'U'}
      </div>

      <form action="/api/auth/maftah/switch" method="post">
        <button
          type="submit"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5"
          title={switchWorkspaceLabel}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{switchWorkspaceLabel}</span>
        </button>
      </form>

      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5"
          title={signOutLabel}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{signOutLabel}</span>
        </button>
      </form>
    </div>
  )
}

