"use client"

import React from "react"
import { Shield, KeyRound, ArrowRight, ArrowLeft } from "lucide-react"
import { useTranslation } from "@/lib/i18n/context"
import { useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"

export function PilotLoginClient() {
  const { t, locale, setLocale, dir } = useTranslation()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get("error")
  const pt = t.pilotLogin || {
    title: "LAM Maftah Pilot Authentication",
    subtitle: "Access your assigned NEXORA workspace using your centralized LAM Maftah identity.",
    badge: "Controlled Pilot Access (Stage 6C.1)",
    continueBtn: "Continue with LAM Maftah",
    returnStandard: "Return to standard login",
    infoNote: "Authentication will be securely verified via LAM Maftah OAuth 2.0 PKCE."
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 relative" dir={dir}>
      {/* Language Selector Header */}
      <div className="absolute top-6 right-6 flex items-center gap-1.5 bg-white border border-slate-200 rounded-full p-1 text-xs shadow-sm z-20">
        <button
          onClick={() => setLocale("en")}
          className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === "en" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          EN
        </button>
        <button
          onClick={() => setLocale("fr")}
          className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === "fr" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          FR
        </button>
        <button
          onClick={() => setLocale("ar")}
          className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === "ar" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          AR (عربي)
        </button>
      </div>

      {/* Pilot Login Card */}
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-6 shadow-sm relative z-10">
        {/* Brand Icon */}
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
          <Shield className="w-7 h-7 text-indigo-600" />
        </div>

        {errorParam && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Authentication error: <code className="font-mono text-[11px]">{errorParam}</code></span>
          </div>
        )}

        {/* Stage 6C.1 Pilot Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          {pt.badge}
        </div>

        {/* Header Titles */}
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            {pt.title}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            {pt.subtitle}
          </p>
        </div>

        {/* Informative Note */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between text-slate-800 font-medium pb-2 border-b border-slate-200">
            <span>Authentication Engine</span>
            <span className="text-indigo-600 font-semibold">LAM Maftah OAuth</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Protocol</span>
            <span className="text-slate-700">PKCE (S256) / OIDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Session Boundary</span>
            <span className="text-slate-700">8h Absolute (Non-Sliding)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-1">
          <a
            href="/api/auth/maftah"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>{pt.continueBtn}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>

          <a
            href="/"
            className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 text-xs font-medium rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pt.returnStandard}</span>
          </a>
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-4">
          LAM Maftah Federation Pilot • Product ID: <code className="text-indigo-600 font-medium">nexora</code>
        </div>
      </div>
    </div>
  )
}
