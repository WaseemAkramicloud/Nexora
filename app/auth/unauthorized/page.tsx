'use client'

import React from 'react'
import { ShieldAlert, ArrowLeft, KeyRound, ExternalLink, Lock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/context'

export default function UnauthorizedPage({
  searchParams
}: {
  searchParams?: { reason?: string; type?: string }
}) {
  const { t, locale, setLocale, dir } = useTranslation()
  const reason = searchParams?.reason || t.auth.unauthorizedDesc
  const errType = searchParams?.type || ''

  const isSecurityError = errType === 'security' || /nonce|state|pkce|token|signature|verifier|verification|expired/i.test(reason)

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white flex flex-col justify-center items-center p-6 relative overflow-hidden" dir={dir}>
      {/* Dynamic Ambient Background Glow */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] ${isSecurityError ? 'bg-amber-600/15' : 'bg-red-600/15'} rounded-full blur-[120px] pointer-events-none`} />
      
      {/* Language Selector Header */}
      <div className="absolute top-6 right-6 flex items-center gap-2 bg-[#121824] border border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-300">
        <button onClick={() => setLocale('en')} className={`px-2 py-0.5 rounded ${locale === 'en' ? 'bg-indigo-600 text-white font-semibold' : 'hover:text-white'}`}>EN</button>
        <button onClick={() => setLocale('fr')} className={`px-2 py-0.5 rounded ${locale === 'fr' ? 'bg-indigo-600 text-white font-semibold' : 'hover:text-white'}`}>FR</button>
        <button onClick={() => setLocale('ar')} className={`px-2 py-0.5 rounded ${locale === 'ar' ? 'bg-indigo-600 text-white font-semibold' : 'hover:text-white'}`}>AR (عربي)</button>
      </div>

      <div className={`max-w-md w-full bg-[#121824]/80 backdrop-blur-xl border ${isSecurityError ? 'border-amber-500/30' : 'border-red-500/20'} rounded-2xl p-8 shadow-2xl relative z-10 text-center`}>
        <div className={`w-16 h-16 ${isSecurityError ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-red-500/10 border-red-500/30 text-red-400'} border rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
          {isSecurityError ? <Lock className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {isSecurityError ? 'Authentication Security Failure' : t.auth.unauthorizedTitle}
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          {reason}
        </p>

        <div className="bg-[#0A0D14] border border-white/5 rounded-xl p-4 text-left mb-6 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between text-slate-300 font-medium pb-2 border-b border-white/5">
            <span>Product Identity</span>
            <span className="text-indigo-400">NEXORA Enterprise</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Authentication Engine</span>
            <span>LAM ID / OIDC SSO</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Verification Status</span>
            {isSecurityError ? (
              <span className="text-amber-400 font-semibold uppercase">Security Check Failed</span>
            ) : (
              <span className="text-red-400 font-semibold uppercase">Access Entitlement Revoked</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <a
            href="/api/auth/sso"
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-600/25 text-sm"
          >
            <KeyRound className="w-4 h-4" />
            {t.auth.loginWithLam}
          </a>

          <a
            href="https://portal.lam.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 font-medium py-3 px-4 rounded-xl transition-all border border-white/10 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            LAM Customer Portal
          </a>
        </div>
      </div>
    </div>
  )
}
