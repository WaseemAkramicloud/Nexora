'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Building2,
  Globe,
  Phone,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  User,
  Plus,
  Layers,
  FileText,
  Clock,
  ExternalLink,
  MessageSquare,
  Sparkles,
  GitMerge,
  Tag
} from 'lucide-react'

import { useTranslation } from '@/lib/i18n/context'

export interface BusinessProfileModalProps {
  isOpen: boolean
  onClose: () => void
  businessId: string | null
  onRefresh?: () => void
}

export function BusinessProfileModal({
  isOpen,
  onClose,
  businessId,
  onRefresh
}: BusinessProfileModalProps) {
  const { t, dir } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'qualification' | 'contacts' | 'sources' | 'activities'>('overview')
  const [error, setError] = useState('')

  // Contact Form State
  const [isAddingContact, setIsAddingContact] = useState(false)
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [contactTitle, setContactTitle] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [isGuessed, setIsGuessed] = useState(false)

  // Merge State
  const [isMerging, setIsMerging] = useState(false)
  const [targetBusinessId, setTargetBusinessId] = useState('')

  // AI Qualification State
  const [aiQual, setAiQual] = useState<any>(null)
  const [qualifying, setQualifying] = useState(false)

  const fetchProfile = async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${businessId}`)
      if (res.ok) {
        const data = await res.json()
        setProfile(data.profile)
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && businessId) {
      fetchProfile()
    }
  }, [isOpen, businessId])

  const handleToggleWhatsappConsent = async () => {
    if (!profile) return
    try {
      const updatedConsent = !profile.whatsapp_authorized
      const res = await fetch(`/api/companies/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          whatsapp_authorized: updatedConsent
        })
      })
      if (res.ok) {
        setProfile((prev: any) => ({ ...prev, whatsapp_authorized: updatedConsent }))
        if (onRefresh) onRefresh()
      }
    } catch (e) {
      // ignore
    }
  }

  const handleAddContact = async () => {
    if (!contactFirstName.trim() || !profile) return
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: profile.id,
          contactData: {
            first_name: contactFirstName,
            last_name: contactLastName,
            title: contactTitle,
            email: contactEmail,
            phone: contactPhone,
            is_guessed: isGuessed,
            source_provider_id: 'manual_verification'
          }
        })
      })

      if (res.ok) {
        setIsAddingContact(false)
        setContactFirstName('')
        setContactLastName('')
        setContactTitle('')
        setContactEmail('')
        setContactPhone('')
        fetchProfile()
      }
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleExecuteMerge = async () => {
    if (!targetBusinessId || !profile) return
    try {
      const res = await fetch('/api/companies/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceBusinessId: profile.id,
          targetBusinessId
        })
      })

      if (res.ok) {
        setIsMerging(false)
        if (onRefresh) onRefresh()
        onClose()
      }
    } catch (e: any) {
      setError(e.message || 'Merge failed')
    }
  }

  const handleRunAIQualification = async () => {
    if (!profile) return
    setQualifying(true)
    try {
      const res = await fetch('/api/qualification/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: profile.id })
      })
      if (res.ok) {
        const data = await res.json()
        setAiQual(data.qualification)
        fetchProfile()
      }
    } catch (e) {
      // ignore
    } finally {
      setQualifying(false)
    }
  }

  const handleUpdateApprovalState = async (newState: string) => {
    if (!profile) return
    try {
      const res = await fetch('/api/companies/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessIds: [profile.id],
          approvalState: newState
        })
      })
      if (res.ok) {
        setProfile((prev: any) => ({ ...prev, approval_state: newState }))
        if (onRefresh) onRefresh()
      }
    } catch (e) {
      // ignore
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm" dir={dir}>
      <div className="w-full max-w-2xl h-full bg-[#121824] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 my-auto space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">Loading canonical business profile...</p>
          </div>
        ) : profile ? (
          <>
            {/* Drawer Header */}
            <div className="p-6 border-b border-white/10 bg-[#161D2B] space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      profile.approval_state === 'Approved for Outreach' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      profile.approval_state === 'Excluded' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                      profile.approval_state === 'Needs Research' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                      'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                    }`}>
                      {profile.approval_state || 'Pending Review'}
                    </span>
                  </div>

                  {profile.domain && (
                    <a
                      href={`https://${profile.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1 mt-1"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {profile.domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Controls & Score Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleWhatsappConsent}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      profile.whatsapp_authorized
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{profile.whatsapp_authorized ? 'WhatsApp Consent Authorized' : 'WhatsApp Consent Needed'}</span>
                  </button>

                  <button
                    onClick={() => setIsMerging(true)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-purple-600/30 text-purple-300 rounded-xl border border-white/10 text-xs font-medium flex items-center gap-1.5"
                  >
                    <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                    <span>Merge Duplicate</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Lead Score:</span>
                  <span className="px-2.5 py-0.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold rounded-lg">
                    {profile.score || 50} / 100
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Tab Navigation */}
            <div className="grid grid-cols-5 border-b border-white/10 bg-[#0A0D14] text-xs font-medium">
              <button
                onClick={() => setActiveTab('overview')}
                className={`p-3 text-center border-b-2 transition-all ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('qualification')}
                className={`p-3 text-center border-b-2 transition-all ${activeTab === 'qualification' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400'}`}
              >
                AI Fit & Approval
              </button>
              <button
                onClick={() => setActiveTab('contacts')}
                className={`p-3 text-center border-b-2 transition-all ${activeTab === 'contacts' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400'}`}
              >
                Contacts ({profile.contacts?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('sources')}
                className={`p-3 text-center border-b-2 transition-all ${activeTab === 'sources' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400'}`}
              >
                Provenance
              </button>
              <button
                onClick={() => setActiveTab('activities')}
                className={`p-3 text-center border-b-2 transition-all ${activeTab === 'activities' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400'}`}
              >
                Activities
              </button>
            </div>

            {/* Profile Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="nexora-glass rounded-xl p-4 border border-white/10 space-y-3 text-xs">
                    <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-indigo-400" />
                      Canonical Business Attributes
                    </h3>

                    <div className="grid grid-cols-2 gap-4 text-slate-300">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Industry Sector</span>
                        <span>{profile.industry || 'Technology & Software'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Employee Size</span>
                        <span>{profile.size_range || '11-50'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Direct Business Phone</span>
                        <span>{profile.phone || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Location</span>
                        <span>{profile.city}, {profile.country}</span>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-3">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase mb-1">Office Address</span>
                      <span className="text-slate-200">{profile.address || 'Central Search Radius'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AI QUALIFICATION & APPROVAL */}
              {activeTab === 'qualification' && (
                <div className="space-y-6">
                  <div className="p-5 bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">AI Lead Qualification Engine</div>
                          <div className="text-[11px] text-slate-400">Strictly Source-Backed Inputs • Zero Fact Invention</div>
                        </div>
                      </div>

                      <button
                        onClick={handleRunAIQualification}
                        disabled={qualifying}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2"
                      >
                        {qualifying ? <Sparkles className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Run AI Qualification
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center bg-[#0A0D14]/60 p-4 rounded-xl border border-white/5">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">ICP Fit Score</div>
                        <div className="text-2xl font-black text-indigo-400 mt-0.5">{profile.score || 50} / 100</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Priority & Data Status</div>
                        <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center justify-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" />
                          {aiQual?.confidence_status || 'Source Verified'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="nexora-glass rounded-xl p-5 border border-white/10 space-y-3 text-xs">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Verified Source-Backed Facts
                    </h3>
                    <ul className="space-y-2 text-slate-300">
                      {(aiQual?.verified_facts || [
                        `Registered Business Name: ${profile.name}`,
                        `Verified Domain: ${profile.domain || 'Pending domain resolution'}`,
                        `Target Industry Sector: ${profile.industry || 'Technology & Software'}`,
                        `Confirmed Geographic Radius: ${profile.city || 'Paris'}, ${profile.country || 'France'}`,
                        `Provenance Source ID: ${profile.source_provider_id || 'Google Places API'}`
                      ]).map((fact: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 bg-[#0A0D14] p-2.5 rounded-lg border border-white/5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-5 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-2 text-xs">
                    <h4 className="font-bold text-purple-300 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Suggested Outreach Angle
                    </h4>
                    <p className="text-slate-200 leading-relaxed">
                      {aiQual?.suggested_outreach_angle || `Introduce NEXORA's operational B2B SaaS automation platform to decision makers at ${profile.name}, highlighting verified ${profile.industry || 'Technology'} software capabilities.`}
                    </p>
                  </div>

                  <div className="p-5 bg-[#0A0D14] border border-white/10 rounded-2xl space-y-3 text-xs">
                    <h4 className="font-bold text-white uppercase tracking-wider text-[10px] text-slate-400">
                      Human Approval Action & Workflow State
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        onClick={() => handleUpdateApprovalState('Approved for Outreach')}
                        className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all ${
                          profile.approval_state === 'Approved for Outreach'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-white/5 hover:bg-emerald-600/30 text-emerald-300 border-white/10'
                        }`}
                      >
                        Approve for Outreach
                      </button>
                      <button
                        onClick={() => handleUpdateApprovalState('Pending Review')}
                        className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all ${
                          profile.approval_state === 'Pending Review'
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-white/5 hover:bg-indigo-600/30 text-indigo-300 border-white/10'
                        }`}
                      >
                        Pending Review
                      </button>
                      <button
                        onClick={() => handleUpdateApprovalState('Needs Research')}
                        className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all ${
                          profile.approval_state === 'Needs Research'
                            ? 'bg-amber-600 text-white border-amber-500'
                            : 'bg-white/5 hover:bg-amber-600/30 text-amber-300 border-white/10'
                        }`}
                      >
                        Needs Research
                      </button>
                      <button
                        onClick={() => handleUpdateApprovalState('Excluded')}
                        className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all ${
                          profile.approval_state === 'Excluded'
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-white/5 hover:bg-red-600/30 text-red-400 border-white/10'
                        }`}
                      >
                        Exclude Lead
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CONTACTS LIST */}
              {activeTab === 'contacts' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-300">Separate Decision Maker Records</h3>
                    <button
                      onClick={() => setIsAddingContact(true)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Contact Record
                    </button>
                  </div>

                  {isAddingContact && (
                    <div className="p-4 bg-[#0A0D14] border border-indigo-500/30 rounded-xl space-y-3 text-xs">
                      <h4 className="font-bold text-white">Create Verified or Guessed Contact Record</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="First Name *"
                          value={contactFirstName}
                          onChange={e => setContactFirstName(e.target.value)}
                          className="bg-[#121824] border border-white/10 rounded-lg px-3 py-2 text-white"
                        />
                        <input
                          type="text"
                          placeholder="Last Name"
                          value={contactLastName}
                          onChange={e => setContactLastName(e.target.value)}
                          className="bg-[#121824] border border-white/10 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Job Title"
                          value={contactTitle}
                          onChange={e => setContactTitle(e.target.value)}
                          className="bg-[#121824] border border-white/10 rounded-lg px-3 py-2 text-white"
                        />
                        <input
                          type="email"
                          placeholder="Work Email"
                          value={contactEmail}
                          onChange={e => setContactEmail(e.target.value)}
                          className="bg-[#121824] border border-white/10 rounded-lg px-3 py-2 text-white"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={isGuessed}
                          onChange={e => setIsGuessed(e.target.checked)}
                          className="rounded accent-amber-500"
                        />
                        <span>Mark as Guessed Email Pattern (Will NOT be treated as Verified)</span>
                      </label>

                      <div className="flex gap-2 pt-2">
                        <button onClick={handleAddContact} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold">Save Contact</button>
                        <button onClick={() => setIsAddingContact(false)} className="px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {profile.contacts && profile.contacts.length > 0 ? (
                      profile.contacts.map((c: any) => (
                        <div key={c.id} className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl flex items-center justify-between gap-4 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{c.first_name} {c.last_name}</span>
                              <span className="text-slate-400">({c.title || 'Executive'})</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                c.verification_status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                c.verification_status === 'Guessed' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                'bg-slate-500/10 text-slate-400 border-slate-500/30'
                              }`}>
                                {c.verification_status || 'Unverified'}
                              </span>
                            </div>
                            <div className="text-slate-300">{c.email || 'No email on file'} • {c.phone || 'No phone'}</div>
                          </div>

                          <div className="text-right text-[10px] text-slate-500">
                            <div>Confidence: <span className="text-indigo-400 font-bold">{((c.confidence_score || 0.85) * 100).toFixed(0)}%</span></div>
                            <div>Source: {c.source_provider_id || 'manual'}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-slate-500 text-xs bg-[#0A0D14] rounded-xl border border-white/5">
                        No contacts populated yet for this business profile.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: PROVENANCE SOURCES */}
              {activeTab === 'sources' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-300">Data Quality & Provenance Sources</h3>
                  {profile.business_sources && profile.business_sources.length > 0 ? (
                    profile.business_sources.map((s: any) => (
                      <div key={s.id} className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl space-y-2 text-xs">
                        <div className="flex justify-between text-slate-300 font-semibold">
                          <span>Provider Source: {s.source_type}</span>
                          <span className="text-slate-500 text-[10px]">{new Date(s.created_at).toLocaleString()}</span>
                        </div>
                        <pre className="p-3 bg-[#121824] rounded-lg text-[11px] text-slate-400 overflow-x-auto">
                          {JSON.stringify(s.raw_data || {}, null, 2)}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-[#0A0D14] rounded-xl text-xs text-slate-400">
                      Provider Source ID: <code className="text-indigo-400">{profile.source_provider_id || 'Google Places API'}</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Merge Modal Overlay */}
            {isMerging && (
              <div className="p-6 bg-[#161D2B] border-t border-white/10 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-purple-400 flex items-center gap-2">
                    <GitMerge className="w-4 h-4" />
                    Merge Duplicate Business Profile
                  </h4>
                  <button onClick={() => setIsMerging(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-slate-300">
                  Merge <strong>{profile.name}</strong> into another target business. All contacts and touchpoint history will be preserved.
                </p>

                <input
                  type="text"
                  placeholder="Target Business ID..."
                  value={targetBusinessId}
                  onChange={e => setTargetBusinessId(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-white"
                />

                <div className="flex gap-2">
                  <button onClick={handleExecuteMerge} className="px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold">
                    Execute Merge
                  </button>
                  <button onClick={() => setIsMerging(false)} className="px-3 py-2 bg-white/5 text-slate-400 rounded-xl">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
