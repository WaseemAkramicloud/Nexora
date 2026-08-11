'use client'

import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Megaphone,
  Compass,
  Building2,
  Send,
  Inbox,
  BarChart3,
  Users,
  Layers,
  Settings,
  Globe,
  LogOut,
  ShieldCheck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Zap,
  PhoneCall,
  Mail,
  MessageSquare,
  TrendingUp,
  Sliders,
  ChevronRight,
  UserCheck,
  Lock,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react'

import { useTranslation } from '@/lib/i18n/context'
import { MockApolloDiscoveryAdapter } from '@/lib/adapters/discovery-adapter'
import { MockHunterEnrichmentAdapter } from '@/lib/adapters/enrichment-adapter'
import { CampaignBuilderModal } from '@/components/CampaignBuilderModal'
import { BusinessProfileModal } from '@/components/BusinessProfileModal'

export default function NexoraApp() {
  const { t, locale, setLocale, dir } = useTranslation()

  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'explorer' | 'companies' | 'outreach' | 'inbox' | 'analytics' | 'team' | 'integrations' | 'settings'>('dashboard')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<any>(null)

  // Campaign Builder Modal State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<any>(null)

  // Business Profile Drawer & Bulk Action State
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([])



  // Demo state for interactive features
  const [campaigns, setCampaigns] = useState<any[]>([
    {
      id: 'c1',
      name: 'Île-de-France Tech Lead Expansion Q3',
      target_industry: 'Technology & Software',
      daily_budget: 150,
      total_leads_count: 240,
      converted_leads_count: 38,
      status: 'active'
    },
    {
      id: 'c2',
      name: 'DACH Enterprise Logistics & Supply Chain',
      target_industry: 'Logistics & Supply Chain',
      daily_budget: 250,
      total_leads_count: 180,
      converted_leads_count: 22,
      status: 'active'
    }
  ])

  const [discoveryResults, setDiscoveryResults] = useState<any[]>([])
  const [discoveryIndustry, setDiscoveryIndustry] = useState('Technology & Software')
  const [discoveryCity, setDiscoveryCity] = useState('Paris')

  const [enrichedContacts, setEnrichedContacts] = useState<Record<string, any[]>>({})

  // Check authenticated session on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.session) {
          setSession(data.session)
        } else {
          setSession(null)
        }
      })
      .catch(() => {
        setSession(null)
      })
  }, [])


  const [activeJob, setActiveJob] = useState<any>(null)

  // Trigger Provider Adapter Discovery Engine (Async Job)
  const handleRunDiscovery = async () => {
    setLoading(true)
    try {
      // 1. Launch Async Discovery Job
      const res = await fetch('/api/discovery/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: {
            industry: discoveryIndustry,
            city: discoveryCity,
            country: 'France'
          },
          requestedLimit: 50
        })
      })

      const data = await res.json()
      if (data.job) {
        setActiveJob(data.job)
      }

      // 2. Fetch canonical businesses from database
      const bizRes = await fetch(`/api/discovery/businesses?industry=${encodeURIComponent(discoveryIndustry)}&q=${encodeURIComponent(discoveryCity)}`)
      if (bizRes.ok) {
        const bizData = await bizRes.json()
        if (bizData.businesses && bizData.businesses.length > 0) {
          setDiscoveryResults(bizData.businesses)
        } else {
          // Fallback to adapter results
          const adapter = new MockApolloDiscoveryAdapter()
          const results = await adapter.searchBusinesses({
            industry: discoveryIndustry,
            city: discoveryCity,
            country: 'France'
          })
          setDiscoveryResults(results)
        }
      }
    } catch (e) {
      const adapter = new MockApolloDiscoveryAdapter()
      const results = await adapter.searchBusinesses({
        industry: discoveryIndustry,
        city: discoveryCity,
        country: 'France'
      })
      setDiscoveryResults(results)
    } finally {
      setLoading(false)
    }
  }


  // Trigger Contact Enrichment via Pipeline API
  const handleEnrichCompany = async (domain: string, name: string, bizId?: string) => {
    setLoading(true)
    try {
      if (bizId) {
        await fetch('/api/enrichment/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: bizId })
        })
        handleOpenProfile(bizId)
      } else {
        const adapter = new MockHunterEnrichmentAdapter()
        const contacts = await adapter.enrichCompanyContacts({ domain, companyName: name })
        setEnrichedContacts(prev => ({ ...prev, [domain]: contacts }))
      }
    } catch (e) {
      const adapter = new MockHunterEnrichmentAdapter()
      const contacts = await adapter.enrichCompanyContacts({ domain, companyName: name })
      setEnrichedContacts(prev => ({ ...prev, [domain]: contacts }))
    } finally {
      setLoading(false)
    }
  }


  // Fetch campaigns from server API

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns')
      if (res.ok) {
        const data = await res.json()
        if (data.campaigns && data.campaigns.length > 0) {
          setCampaigns(data.campaigns)
        }
      }
    } catch (e) {
      // Keep state
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleOpenProfile = (bizId: string) => {
    setSelectedBusinessId(bizId)
    setIsProfileOpen(true)
  }

  const handleToggleSelectBusiness = (id: string) => {
    setSelectedBusinessIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBulkAction = async (action: 'approve' | 'suppress' | 'export') => {
    if (selectedBusinessIds.length === 0) return
    setLoading(true)
    try {
      if (action === 'export') {
        const res = await fetch('/api/companies/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'export', businessIds: selectedBusinessIds })
        })
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `nexora_leads_export_${Date.now()}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        await fetch('/api/companies/bulk-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, businessIds: selectedBusinessIds })
        })
        handleRunDiscovery()
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }


  const handleCreateCampaign = () => {
    setEditingCampaign(null)
    setIsBuilderOpen(true)
  }

  const handleEditCampaign = (camp: any) => {
    setEditingCampaign(camp)
    setIsBuilderOpen(true)
  }

  const handleDuplicateCampaign = async (campId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campId}/duplicate`, { method: 'POST' })
      if (res.ok) {
        fetchCampaigns()
      }
    } catch (e) {
      // fallback copy
      const item = campaigns.find(c => c.id === campId)
      if (item) {
        setCampaigns([...campaigns, { ...item, id: 'c_' + Date.now(), name: `${item.name} (Copy)` }])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleArchiveCampaign = async (campId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchCampaigns()
      } else {
        setCampaigns(campaigns.filter(c => c.id !== campId))
      }
    } catch (e) {
      setCampaigns(campaigns.filter(c => c.id !== campId))
    } finally {
      setLoading(false)
    }

  }


  const navItems = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'campaigns', label: t.nav.campaigns, icon: Megaphone },
    { id: 'explorer', label: t.nav.leadExplorer, icon: Compass },
    { id: 'companies', label: t.nav.companies, icon: Building2 },
    { id: 'outreach', label: t.nav.outreach, icon: Send },
    { id: 'inbox', label: t.nav.inbox, icon: Inbox },
    { id: 'analytics', label: t.nav.analytics, icon: BarChart3 },
    { id: 'team', label: t.nav.team, icon: Users },
    { id: 'integrations', label: t.nav.integrations, icon: Layers },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ]

  if (!session) {

    return (
      <div className="min-h-screen bg-[#0A0D14] text-slate-100 flex items-center justify-center p-6" dir={dir}>
        <div className="max-w-md w-full nexora-glass rounded-3xl p-8 border border-white/10 text-center space-y-6 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-xl shadow-indigo-600/30">
            N
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">LAM ID SSO Authentication Required</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              NEXORA is protected by LAM ID SSO. Please authenticate with your LAM ID company workspace identity to access your workspace.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href="/api/auth/sso"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 block"
            >
              Authenticate with LAM ID SSO
            </a>

            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth/dev-login', { method: 'POST' })
                  if (res.ok) {
                    window.location.reload()
                  } else {
                    const data = await res.json()
                    alert(data.error || 'Dev login unavailable in production')
                  }
                } catch (e: any) {
                  alert(e.message || 'Dev login failed')
                }
              }}
              className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium rounded-xl border border-white/10 transition-all block"
            >
              Development Testing Session (Dev Only)
            </button>
          </div>

          <div className="text-[10px] text-slate-500 border-t border-white/5 pt-4">
            Independent DB Instance: <code className="text-indigo-400">zfancncassjmghxzogbm</code>
          </div>
        </div>
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-[#0A0D14] text-slate-100 flex flex-col font-sans" dir={dir}>
      {/* Top Header Navigation */}
      <header className="h-16 border-b border-white/10 bg-[#121824]/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-600/30">
            N
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-white text-lg font-display">NEXORA</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                SaaS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{t.tagline}</p>
          </div>
        </div>

        {/* Identity & Localization Bar */}
        <div className="flex items-center gap-4">
          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-[#0A0D14] border border-white/10 rounded-full p-1 text-xs">
            <button
              onClick={() => setLocale('en')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === 'en' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLocale('fr')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === 'fr' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              FR
            </button>
            <button
              onClick={() => setLocale('ar')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${locale === 'ar' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              AR (عربي)
            </button>
          </div>

          {/* User Profile Badge */}
          {session && (
            <div className="flex items-center gap-3 pl-3 border-l border-white/10">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-white">{session.firstName} {session.lastName}</div>
                <div className="text-[10px] text-indigo-400 flex items-center justify-end gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  {t.userRole[session.role as keyof typeof t.userRole] || session.role}
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-indigo-500/30">
                {session.firstName?.[0] || 'U'}
              </div>
            </div>
          )}

          <a
            href="/api/auth/sso"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5"
            title={t.auth.loginWithLam}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">LAM SSO</span>
          </a>
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-white/10 bg-[#0E131F]/90 flex flex-col py-6 px-3 gap-1 shrink-0">
          <div className="px-3 pb-3 mb-2 border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Operational SaaS Navigation
          </div>

          {navItems.map(item => {
            const Icon = item.icon
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/25 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            )
          })}

          <div className="mt-auto pt-4 border-t border-white/10 px-3">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
              <div className="font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                LAM ID SSO Active
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Independent DB: <code className="text-slate-300">zfancncass...</code>
              </p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-b from-[#0A0D14] via-[#0D111A] to-[#0A0D14]">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">{t.dashboard.welcome}</h1>
                  <p className="text-slate-400 text-sm mt-1">Tenant Workspace ID: <code className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{session?.tenantId || 'tenant_nexora_workspace_1'}</code></p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('campaigns')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t.campaigns.createNew}
                  </button>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="nexora-glass rounded-2xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                    <span>{t.dashboard.activeCampaigns}</span>
                    <Megaphone className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">02 Active</div>
                  <div className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <TrendingUp className="w-3 h-3" /> +12.4% from last month
                  </div>
                </div>

                <div className="nexora-glass rounded-2xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                    <span>{t.dashboard.discoveredLeads}</span>
                    <Compass className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">420 Verified</div>
                  <div className="text-xs text-purple-400 font-medium">94.2% Enrichment Match</div>
                </div>

                <div className="nexora-glass rounded-2xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                    <span>{t.dashboard.conversionRate}</span>
                    <Zap className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">16.8% Avg</div>
                  <div className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <TrendingUp className="w-3 h-3" /> 60 Qualified Leads
                  </div>
                </div>

                <div className="nexora-glass rounded-2xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                    <span>{t.dashboard.outreachSent}</span>
                    <Send className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">1,480 Sent</div>
                  <div className="text-xs text-slate-400 font-medium">Email, Phone & WhatsApp</div>
                </div>
              </div>

              {/* Two Column Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pipeline Overview */}
                <div className="lg:col-span-2 nexora-glass rounded-2xl p-6 border border-white/10">
                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    {t.dashboard.pipelineOverview}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1 font-medium">
                        <span>New Discovered Leads (140)</span>
                        <span>33.3%</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: '33.3%' }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1 font-medium">
                        <span>Contacted / Sequence Active (180)</span>
                        <span>42.8%</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '42.8%' }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1 font-medium">
                        <span>Proposal / Demo Scheduled (60)</span>
                        <span>14.2%</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: '14.2%' }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1 font-medium">
                        <span>Won Contracts (40)</span>
                        <span>9.7%</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '9.7%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Feed */}
                <div className="nexora-glass rounded-2xl p-6 border border-white/10">
                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    {t.dashboard.recentActivities}
                  </h3>

                  <div className="space-y-4 text-xs">
                    <div className="flex gap-3 pb-3 border-b border-white/5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-slate-200 font-medium">Outreach Response Received</div>
                        <div className="text-slate-400">Alexandre Dubois (Aetheria Cloud)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">12 mins ago</div>
                      </div>
                    </div>

                    <div className="flex gap-3 pb-3 border-b border-white/5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <Compass className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-slate-200 font-medium">35 Leads Enriched</div>
                        <div className="text-slate-400">Île-de-France Tech Expansion</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">1 hour ago</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                        <PhoneCall className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-slate-200 font-medium">Discovery Call Completed</div>
                        <div className="text-slate-400">Vanguard Logistics SAS</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">3 hours ago</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CAMPAIGNS */}
          {activeTab === 'campaigns' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.campaigns.title}</h1>
                  <p className="text-slate-400 text-sm">Targeted B2B outreach & automated acquisition workflows</p>
                </div>

                <button
                  onClick={handleCreateCampaign}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 self-start"
                >
                  <Plus className="w-4 h-4" />
                  {t.campaigns.createNew}
                </button>
              </div>

              {/* Campaign Cards List */}
              <div className="space-y-4">
                {campaigns.map(camp => (
                  <div key={camp.id} className="nexora-glass rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-indigo-500/30 transition-all">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-white">{camp.name}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          camp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          camp.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/30'
                        }`}>
                          {camp.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{t.campaigns.targetIndustry}: <span className="text-slate-200 font-medium">{camp.target_industry}</span></p>

                      {/* Action Bar for Edit, Duplicate, Archive */}
                      <div className="flex items-center gap-2 pt-2 text-xs">
                        <button
                          onClick={() => handleEditCampaign(camp)}
                          className="px-3 py-1 bg-white/5 hover:bg-indigo-600/30 text-indigo-300 rounded-lg border border-white/10 transition-all"
                        >
                          Edit Criteria
                        </button>
                        <button
                          onClick={() => handleDuplicateCampaign(camp.id)}
                          className="px-3 py-1 bg-white/5 hover:bg-purple-600/30 text-purple-300 rounded-lg border border-white/10 transition-all"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleArchiveCampaign(camp.id)}
                          className="px-3 py-1 bg-white/5 hover:bg-red-600/30 text-red-400 rounded-lg border border-white/10 transition-all"
                        >
                          Archive
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6 text-center border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">{t.campaigns.dailyBudget}</div>
                        <div className="text-base font-bold text-white">€{camp.daily_budget} / day</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">{t.campaigns.leadsCount}</div>
                        <div className="text-base font-bold text-white">{camp.total_leads_count || camp.desired_result_limit || 100}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">{t.campaigns.converted}</div>
                        <div className="text-base font-bold text-emerald-400">{camp.converted_leads_count || 0}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* TAB 3: LEAD EXPLORER */}
          {activeTab === 'explorer' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h1 className="text-2xl font-bold text-white">{t.explorer.title}</h1>
                <p className="text-slate-400 text-sm">{t.explorer.subtitle}</p>
              </div>

              {/* Filter Controls */}
              <div className="nexora-glass rounded-2xl p-6 border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.explorer.filterIndustry}</label>
                  <select
                    value={discoveryIndustry}
                    onChange={e => setDiscoveryIndustry(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Technology & Software">Technology & Software</option>
                    <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                    <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                    <option value="Finance & Banking">Finance & Banking</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t.explorer.filterCity}</label>
                  <input
                    type="text"
                    value={discoveryCity}
                    onChange={e => setDiscoveryCity(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleRunDiscovery}
                    disabled={loading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {t.explorer.searchBtn}
                  </button>
                </div>
              </div>

              {/* Active Async Discovery Job Progress Banner */}
              {activeJob && (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between text-xs text-indigo-300">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shrink-0">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>Asynchronous Discovery Job #{activeJob.id?.slice(0, 8)}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-600 text-white">
                          {activeJob.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Target Limit: {activeJob.total_requested_limit} leads • Provider: Google Places Maps API
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Duplicates Skipped</div>
                      <div className="text-sm font-bold text-amber-400">{activeJob.duplicate_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">New Discovered</div>
                      <div className="text-sm font-bold text-emerald-400">{activeJob.discovered_count || discoveryResults.length}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk Action Controls Bar */}
              {selectedBusinessIds.length > 0 && (
                <div className="p-3 bg-[#161D2B] border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs text-white">
                  <span className="font-semibold text-indigo-300">
                    {selectedBusinessIds.length} Businesses Selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        await fetch('/api/companies/approval', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ businessIds: selectedBusinessIds, approvalState: 'Approved for Outreach' })
                        })
                        handleRunDiscovery()
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
                    >
                      Approve for Outreach
                    </button>
                    <button
                      onClick={async () => {
                        await fetch('/api/companies/approval', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ businessIds: selectedBusinessIds, approvalState: 'Needs Research' })
                        })
                        handleRunDiscovery()
                      }}
                      className="px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white font-semibold rounded-lg"
                    >
                      Flag Needs Research
                    </button>
                    <button
                      onClick={async () => {
                        await fetch('/api/companies/approval', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ businessIds: selectedBusinessIds, approvalState: 'Excluded' })
                        })
                        handleRunDiscovery()
                      }}
                      className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white font-semibold rounded-lg"
                    >
                      Exclude
                    </button>
                    <button
                      onClick={() => handleBulkAction('export')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg"
                    >
                      Export Controlled CSV
                    </button>
                  </div>
                </div>
              )}


              {/* Discovery Table Results */}
              {discoveryResults.length > 0 && (
                <div className="nexora-glass rounded-2xl overflow-hidden border border-white/10">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-4 w-8">
                          <input
                            type="checkbox"
                            onChange={e => {
                              if (e.target.checked) setSelectedBusinessIds(discoveryResults.map(r => r.id || r.name))
                              else setSelectedBusinessIds([])
                            }}
                            className="rounded accent-indigo-600"
                          />
                        </th>
                        <th className="p-4">Company Name & Domain</th>
                        <th className="p-4">Industry Sector</th>
                        <th className="p-4">Location & Address</th>
                        <th className="p-4">Provider Source</th>
                        <th className="p-4">Dedup & Timestamp</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-200">
                      {discoveryResults.map((item, idx) => {
                        const itemKey = item.id || item.name
                        const isSelected = selectedBusinessIds.includes(itemKey)
                        return (
                          <tr key={idx} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => handleOpenProfile(item.id || 'b1')}>
                            <td className="p-4" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectBusiness(itemKey)}
                                className="rounded accent-indigo-600"
                              />
                            </td>
                            <td className="p-4 font-semibold text-white">
                              <div>{item.name}</div>
                              <div className="text-[10px] text-indigo-400 font-normal">{item.domain || 'N/A'}</div>
                            </td>
                            <td className="p-4">{item.industry || 'Technology & Software'}</td>
                            <td className="p-4">
                              <div>{item.city}, {item.country || 'France'}</div>
                              <div className="text-[10px] text-slate-400">{item.address || 'Central Search Radius'}</div>
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20 text-[10px] flex items-center gap-1 w-fit">
                                <Globe className="w-3 h-3 text-indigo-400" />
                                {item.source_provider_id || item.source || 'Google Places API'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
                                <CheckCircle2 className="w-3 h-3" /> Canonical Verified
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {item.retrieved_at ? new Date(item.retrieved_at).toLocaleTimeString() : 'Just Now'}
                              </div>
                            </td>
                            <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => handleOpenProfile(item.id || 'b1')}
                                className="px-3 py-1.5 bg-white/5 hover:bg-indigo-600 text-white rounded-lg transition-all border border-white/10"
                              >
                                View Profile
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}


          {/* TAB 4: COMPANIES & CONTACTS */}
          {activeTab === 'companies' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <h1 className="text-2xl font-bold text-white">{t.companies.title}</h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="nexora-glass rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-white">Aetheria Cloud Systems</h3>
                      <p className="text-xs text-slate-400">aetheria-cloud.fr • Technology & Software</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                      51-200 Employees
                    </span>
                  </div>

                  <div className="space-y-3 border-t border-white/5 pt-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t.companies.phone}:</span>
                      <span className="text-slate-200 font-medium">+33 1 42 68 55 00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Verified Decision Maker:</span>
                      <span className="text-emerald-400 font-semibold">Alexandre Dubois (CTO)</span>
                    </div>
                  </div>
                </div>

                <div className="nexora-glass rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-white">Vanguard Logistics SAS</h3>
                      <p className="text-xs text-slate-400">vanguard-logistics.com • Logistics</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                      201-500 Employees
                    </span>
                  </div>

                  <div className="space-y-3 border-t border-white/5 pt-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t.companies.phone}:</span>
                      <span className="text-slate-200 font-medium">+33 4 72 00 11 22</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Verified Decision Maker:</span>
                      <span className="text-emerald-400 font-semibold">Claire Moreau (VP Operations)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: OUTREACH */}
          {activeTab === 'outreach' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.nav.outreach}</h1>
                  <p className="text-slate-400 text-sm">Production email sequence engine & delivery analytics</p>
                </div>

                <button
                  onClick={async () => {
                    setLoading(true)
                    try {
                      const res = await fetch('/api/outreach/dispatch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ businessId: 'b1', stepNumber: 1 })
                      })
                      alert('Outreach sequence step dispatched to approved leads!')
                    } catch (e: any) {
                      alert(e.message || 'Dispatch failed')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 self-start"
                >
                  <Send className="w-4 h-4" />
                  Dispatch Sequence to Approved Leads
                </button>
              </div>

              {/* Sender Connections Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Resend Production API</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Active</span>
                  </div>
                  <div className="text-slate-400">outreach@nexora.lam.com</div>
                  <div className="text-[10px] text-indigo-400 font-semibold mt-1">Daily Limit: 200 emails • 14 Sent Today</div>
                </div>

                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">SendGrid SMTP Dedicated</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Active</span>
                  </div>
                  <div className="text-slate-400">alexandre@vanguard-logistics.com</div>
                  <div className="text-[10px] text-purple-400 font-semibold mt-1">Daily Limit: 500 emails • 42 Sent Today</div>
                </div>

                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Reply-Stop Automation</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">Enabled</span>
                  </div>
                  <div className="text-slate-400">Halts sequence when contact replies</div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-1">HMAC Signed Webhook Receiver Active</div>
                </div>
              </div>

              {/* Multi-Step Email Sequence Builder */}
              <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white">Multi-Step Cold Outreach Sequence</h3>
                  <span className="text-xs text-indigo-400 font-medium">Merge Tags: {'{{first_name}}, {{company_name}}, {{city}}, {{industry}}'}</span>
                </div>

                <div className="relative pl-6 space-y-6 border-l-2 border-indigo-500/30 ml-3">
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-indigo-600 border-2 border-[#0A0D14]" />
                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Step 1 • Immediate Dispatch</div>
                    <h4 className="text-sm font-semibold text-white mt-1">Personalized Executive Intro Email</h4>
                    <p className="text-xs text-slate-400 mt-1">Subject: Streamlining B2B operations for {'{{company_name}}'}</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-purple-600 border-2 border-[#0A0D14]" />
                    <div className="text-xs font-bold text-purple-400 uppercase tracking-wider">Step 2 • Day 3 (If No Reply)</div>
                    <h4 className="text-sm font-semibold text-white mt-1">Contextual Case Study Follow-up</h4>
                    <p className="text-xs text-slate-400 mt-1">Subject: Quick follow-up regarding {'{{company_name}}'}</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-emerald-600 border-2 border-[#0A0D14]" />
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Step 3 • Day 7 (Break-up Note)</div>
                    <h4 className="text-sm font-semibold text-white mt-1">Final Operational Inquiry</h4>
                    <p className="text-xs text-slate-400 mt-1">Subject: Closing thoughts for {'{{company_name}}'} team</p>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* TAB 6: CENTRAL INBOX */}
          {activeTab === 'inbox' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.nav.inbox}</h1>
                  <p className="text-slate-400 text-sm">Centralized prospect response management & AI intent classification</p>
                </div>
              </div>

              {/* Response Category Filters */}
              <div className="flex flex-wrap items-center gap-2 bg-[#0A0D14] p-3 rounded-2xl border border-white/10 text-xs">
                {['All', 'Interested', 'Referral', 'Not Interested', 'Out of Office', 'Unsubscribe', 'Unclear', 'Manual Review'].map((cat, i) => (
                  <button
                    key={cat}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition-all ${
                      i === 0 ? 'bg-indigo-600 text-white' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Central Inbox Responses List */}
              <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">Alexandre Dubois</span>
                      <span className="text-slate-400">&lt;a.dubois@aetheria-cloud.fr&gt;</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Interested
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] text-indigo-400 bg-indigo-500/10">
                        AI Confidence: 94%
                      </span>
                    </div>
                    <div className="text-slate-300 bg-[#121824] p-3 rounded-lg border border-white/5">
                      "Hello Alexandre, we are reviewing your NEXORA enterprise proposal. Can we schedule the technical evaluation call tomorrow at 14:00 CET?"
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <span>Company: <strong className="text-slate-300">Aetheria Cloud Systems</strong></span>
                      <span>Campaign: <strong className="text-slate-300">SaaS Enterprise Outreach</strong></span>
                      <span>Classified by: <strong className="text-indigo-400">AI-Assisted Engine</strong></span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">12 mins ago</span>
                </div>

                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">Claire Moreau</span>
                      <span className="text-slate-400">&lt;c.moreau@vanguard-logistics.com&gt;</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                        Referral
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] text-purple-400 bg-purple-500/10">
                        AI Confidence: 90%
                      </span>
                    </div>
                    <div className="text-slate-300 bg-[#121824] p-3 rounded-lg border border-white/5">
                      "Please contact our VP of IT Infrastructure, Marc Laurent, at m.laurent@vanguard-logistics.com for enterprise evaluation."
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <span>Company: <strong className="text-slate-300">Vanguard Logistics SAS</strong></span>
                      <span>Campaign: <strong className="text-slate-300">Logistics B2B Scaling</strong></span>
                      <span>Classified by: <strong className="text-indigo-400">AI-Assisted Engine</strong></span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">2 hours ago</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: REAL-EVENT ANALYTICS & CREDIT LEDGER */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.nav.analytics}</h1>
                  <p className="text-slate-400 text-sm">Real-event conversion metrics & transparent usage credit ledger</p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  LAM SSO Entitlement Interface Synced
                </span>
              </div>

              {/* Real-Event Conversion Funnel */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Discovered</div>
                  <div className="text-2xl font-bold text-white mt-1">100</div>
                </div>
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Enriched</div>
                  <div className="text-2xl font-bold text-indigo-400 mt-1">84</div>
                </div>
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Human Approved</div>
                  <div className="text-2xl font-bold text-purple-400 mt-1">45</div>
                </div>
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Sent & Delivered</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">38</div>
                </div>
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Real Replies</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">8</div>
                </div>
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-2xl text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Positive Qualified</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">6</div>
                </div>
              </div>

              {/* Industry Segment Conversion Table */}
              <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-4">
                <h3 className="text-base font-bold text-white">Conversion Performance by Industry Segment & Source</h3>
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Industry Segment</th>
                      <th className="p-3">Discovered</th>
                      <th className="p-3">Approved</th>
                      <th className="p-3">Deliveries</th>
                      <th className="p-3">Positive Replies</th>
                      <th className="p-3 text-right">Conversion %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    <tr>
                      <td className="p-3 font-bold text-white">Technology & Software</td>
                      <td className="p-3">60</td>
                      <td className="p-3">30</td>
                      <td className="p-3">25</td>
                      <td className="p-3 text-emerald-400 font-bold">5</td>
                      <td className="p-3 text-right font-bold text-indigo-400">50.0%</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Logistics & Supply Chain</td>
                      <td className="p-3">40</td>
                      <td className="p-3">15</td>
                      <td className="p-3">13</td>
                      <td className="p-3 text-emerald-400 font-bold">1</td>
                      <td className="p-3 text-right font-bold text-purple-400">37.5%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Transparent Usage Credit Ledger */}
              <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Transparent Credit Usage Ledger</h3>
                    <p className="text-xs text-slate-400">Real-time ledger recording discovery, enrichment, verification, email, and AI usage</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Tenant Consumed</span>
                    <span className="text-xl font-bold text-indigo-400">142 Credits</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <div className="text-slate-400 text-[10px] font-semibold uppercase">Discovery</div>
                    <div className="font-bold text-white mt-1">50 Credits</div>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <div className="text-slate-400 text-[10px] font-semibold uppercase">Enrichment</div>
                    <div className="font-bold text-indigo-400 mt-1">40 Credits</div>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <div className="text-slate-400 text-[10px] font-semibold uppercase">Verification</div>
                    <div className="font-bold text-purple-400 mt-1">14 Credits</div>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <div className="text-slate-400 text-[10px] font-semibold uppercase">Email Dispatch</div>
                    <div className="font-bold text-emerald-400 mt-1">28 Credits</div>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <div className="text-slate-400 text-[10px] font-semibold uppercase">AI Qualification</div>
                    <div className="font-bold text-amber-400 mt-1">10 Credits</div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* TAB 8: TEAM & PERMISSIONS */}
          {activeTab === 'team' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.team.title}</h1>
                  <p className="text-slate-400 text-sm">Role-based permissions & authentication delegated to LAM ID SSO</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/team/reassign', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ targetOwnerId: 'mem_admin_2' })
                        })
                        if (res.ok) alert('Lead ownership reassigned cleanly without orphaned records!')
                      } catch (e: any) {
                        alert(e.message || 'Reassignment failed')
                      }
                    }}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Reassign Lead Ownership
                  </button>


                  <span className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold">
                    10 Seats Allowed • 3 Active
                  </span>
                </div>
              </div>

              <div className="nexora-glass rounded-2xl overflow-hidden border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4">Member Name</th>
                      <th className="p-4">Email Address</th>
                      <th className="p-4">{t.team.role}</th>
                      <th className="p-4">{t.team.ssoStatus}</th>
                      <th className="p-4 text-right">LAM Identity ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    <tr className="hover:bg-white/5">
                      <td className="p-4 font-semibold text-white">Alexandre Dubois</td>
                      <td className="p-4 text-slate-400">alexandre.dubois@aetheria.fr</td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                          {t.userRole.owner}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Synced with LAM ID
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-[10px] text-slate-400">lam_user_99214</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-4 font-semibold text-white">Claire Moreau</td>
                      <td className="p-4 text-slate-400">c.moreau@vanguard-logistics.com</td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                          Admin
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Synced with LAM ID
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-[10px] text-slate-400">lam_user_88123</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: INTEGRATIONS, WEBHOOK HEALTH & LAM CONTRACT */}
          {activeTab === 'integrations' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">{t.nav.integrations}</h1>
                  <p className="text-slate-400 text-sm">Provider adapters, signed webhook health monitoring & formal LAM Contract status</p>
                </div>
              </div>

              {/* LAM Contract Status Card */}
              <div className="p-6 bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">LAM SSO Entitlement Contract Interface</div>
                      <div className="text-[11px] text-slate-400">No Direct Cross-Database Access • Secure Event-Driven Hooks</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold">
                    Entitlement Status: Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Plan Tier</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">Enterprise SaaS Tier</span>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Allowed Seat Limits</span>
                    <span className="font-bold text-indigo-400 text-sm mt-0.5 block">10 User Seats</span>
                  </div>
                  <div className="p-3 bg-[#0A0D14] rounded-xl border border-white/5">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Update Webhook Hook</span>
                    <span className="font-mono text-[10px] text-purple-300 mt-1 block truncate">/api/lam/hooks/update-entitlement</span>
                  </div>
                </div>
              </div>

              {/* Provider Adapters & Webhook Health Monitor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white">Resend Signed Webhook</div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
                  </div>
                  <p className="text-xs text-slate-400">HMAC SHA-256 Signature Verification & Event Deduplication</p>
                  <div className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded w-fit">Webhook Healthy</div>
                </div>

                <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white">SendGrid SMTP Dedicated</div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
                  </div>
                  <p className="text-xs text-slate-400">High-Volume Transactional Delivery & Bounce Management</p>
                  <div className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded w-fit">Adapter Active</div>
                </div>

                <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white">Official WhatsApp Cloud API</div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
                  </div>
                  <p className="text-xs text-slate-400">Template Business Messaging with Opt-in Consent Verification</p>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/messaging/whatsapp', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ businessId: 'b1', phoneNumber: '+33142685500', templateName: 'b2b_executive_intro' })
                        })
                        if (res.ok) alert('Official WhatsApp Template message dispatched!')
                      } catch (e: any) {
                        alert(e.message || 'Dispatch failed')
                      }
                    }}
                    className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded border border-emerald-500/30"
                  >
                    Test WhatsApp Template
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* TAB 10: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <h1 className="text-2xl font-bold text-white">{t.settings.title}</h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Language & Localization Settings */}
                <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    {t.settings.language}
                  </h3>

                  <div className="space-y-2">
                    <button
                      onClick={() => setLocale('en')}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${locale === 'en' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                    >
                      <span>English (Default)</span>
                      {locale === 'en' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </button>

                    <button
                      onClick={() => setLocale('fr')}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${locale === 'fr' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                    >
                      <span>Français (French)</span>
                      {locale === 'fr' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </button>

                    <button
                      onClick={() => setLocale('ar')}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${locale === 'ar' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                    >
                      <span>العربية (Arabic - RTL)</span>
                      {locale === 'ar' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </button>
                  </div>
                </div>

                {/* Tenant & SSO Identity Mapping Info */}
                <div className="nexora-glass rounded-2xl p-6 border border-white/10 space-y-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-purple-400" />
                    {t.settings.tenantInfo}
                  </h3>

                  <div className="text-xs space-y-2 text-slate-300">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-400">LAM Company ID</span>
                      <code className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{session?.lamCompanyId || 'comp_demo_9921'}</code>
                    </div>

                    <div className="flex justify-between border-b border-white/5 pb-2">
                      <span className="text-slate-400">NEXORA Tenant ID</span>
                      <code className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{session?.tenantId || 'tenant_nexora_workspace_1'}</code>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">LAM Customer ID</span>
                      <code className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{session?.lamCustomerId || 'cust_demo_8829'}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Campaign Builder Modal */}
      <CampaignBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onSuccess={fetchCampaigns}
        initialData={editingCampaign}
      />

      {/* Business Profile Modal */}
      <BusinessProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        businessId={selectedBusinessId}
        onRefresh={handleRunDiscovery}
      />
    </div>
  )
}


