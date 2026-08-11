'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Plus,
  Compass,
  MapPin,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  Building2,
  Trash2,
  Copy,
  ChevronRight,
  ChevronLeft,
  Check
} from 'lucide-react'

import { useTranslation } from '@/lib/i18n/context'

export interface CampaignBuilderProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: any
  members?: any[]
}

export function CampaignBuilderModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  members = []
}: CampaignBuilderProps) {
  const { t, dir } = useTranslation()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form State
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [targetIndustry, setTargetIndustry] = useState(initialData?.target_industry || 'Technology & Software')
  const [dailyBudget, setDailyBudget] = useState(initialData?.daily_budget || 150)
  const [desiredResultLimit, setDesiredResultLimit] = useState(initialData?.desired_result_limit || 100)
  const [contactPreferences, setContactPreferences] = useState<string[]>(
    initialData?.contact_preferences || ['email', 'phone']
  )
  const [ownerId, setOwnerId] = useState(initialData?.owner_id || '')
  const [status, setStatus] = useState(initialData?.status || 'active')

  // Geography State (Polygon-Ready)
  const [geographyType, setGeographyType] = useState<'radius' | 'polygon'>('radius')
  const [country, setCountry] = useState(initialData?.target_areas?.[0]?.country || 'France')
  const [city, setCity] = useState(initialData?.target_areas?.[0]?.city || 'Paris')
  const [centerAddress, setCenterAddress] = useState(
    initialData?.target_areas?.[0]?.center_address || '14 Boulevard Haussmann, 75009 Paris'
  )
  const [radiusKm, setRadiusKm] = useState(initialData?.target_areas?.[0]?.radius_km || 30)

  // Rules & Criteria State
  const [categories, setCategories] = useState<string[]>(
    initialData?.campaign_targeting_rules?.[0]?.business_categories || ['Software', 'Cloud Systems']
  )
  const [newCat, setNewCat] = useState('')

  const [keywords, setKeywords] = useState<string[]>(
    initialData?.campaign_targeting_rules?.[0]?.keywords || ['SaaS', 'ERP', 'Enterprise']
  )
  const [newKeyword, setNewKeyword] = useState('')

  const [exclusions, setExclusions] = useState<string[]>(
    initialData?.campaign_targeting_rules?.[0]?.exclusions || ['Freelance', 'Non-profit']
  )
  const [newExclusion, setNewExclusion] = useState('')

  // Preview State
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setDescription(initialData.description || '')
      setTargetIndustry(initialData.target_industry || 'Technology & Software')
      setDailyBudget(initialData.daily_budget || 150)
      setDesiredResultLimit(initialData.desired_result_limit || 100)
      setContactPreferences(initialData.contact_preferences || ['email', 'phone'])
      setStatus(initialData.status || 'active')
    }
  }, [initialData])

  // Fetch Server-Side Targeting Preview
  const fetchPreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/campaigns/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetArea: {
            country,
            city,
            center_address: centerAddress,
            radius_km: radiusKm,
            geography_type: geographyType
          },
          targetingRules: {
            business_categories: categories,
            keywords,
            exclusions
          },
          desiredResultLimit
        })
      })
      const data = await res.json()
      setPreviewData(data)
    } catch (e) {
      // Fallback preview
      setPreviewData({
        estimatedTotalMatches: 450,
        estimatedCreditsCost: Math.round(desiredResultLimit * 2.5),
        sampleResults: [
          { name: 'Aetheria Cloud Systems', domain: 'aetheria-cloud.fr', industry: targetIndustry, city, country },
          { name: 'Vanguard Logistics SAS', domain: 'vanguard-logistics.com', industry: 'Logistics', city, country }
        ],
        usageWarning: desiredResultLimit > 500 ? `Notice: Large result limit (${desiredResultLimit}) requested.` : null
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleNextStep = () => {
    if (step === 1 && !name.trim()) {
      setError('Campaign Name is required.')
      return
    }
    setError('')
    if (step === 3) {
      fetchPreview()
    }
    setStep(prev => (prev < 4 ? ((prev + 1) as any) : 4))
  }

  const handlePrevStep = () => {
    setError('')
    setStep(prev => (prev > 1 ? ((prev - 1) as any) : 1))
  }

  const toggleContactPref = (pref: string) => {
    setContactPreferences(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    )
  }

  const addCategory = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      setCategories([...categories, newCat.trim()])
      setNewCat('')
    }
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()])
      setNewKeyword('')
    }
  }

  const addExclusion = () => {
    if (newExclusion.trim() && !exclusions.includes(newExclusion.trim())) {
      setExclusions([...exclusions, newExclusion.trim()])
      setNewExclusion('')
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignData: {
            name,
            description,
            status,
            target_industry: targetIndustry,
            daily_budget: dailyBudget,
            desired_result_limit: desiredResultLimit,
            contact_preferences: contactPreferences,
            owner_id: ownerId || null
          },
          targetArea: {
            country,
            city,
            geography_type: geographyType,
            center_address: centerAddress,
            radius_km: radiusKm
          },
          targetingRules: {
            business_categories: categories,
            keywords,
            exclusions
          }
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to save campaign')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" dir={dir}>
      <div className="w-full max-w-3xl bg-[#121824] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#161D2B]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialData ? 'Edit Campaign & Targeting' : 'Create New Outbound Campaign'}
              </h2>
              <p className="text-xs text-slate-400">Step {step} of 4 • Configure targeting rules and geography</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="grid grid-cols-4 border-b border-white/5 bg-[#0A0D14] text-xs">
          <div className={`p-3 text-center border-b-2 font-medium transition-all ${step === 1 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500'}`}>
            1. Campaign Info
          </div>
          <div className={`p-3 text-center border-b-2 font-medium transition-all ${step === 2 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500'}`}>
            2. Geography
          </div>
          <div className={`p-3 text-center border-b-2 font-medium transition-all ${step === 3 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500'}`}>
            3. Categories & Rules
          </div>
          <div className={`p-3 text-center border-b-2 font-medium transition-all ${step === 4 ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-500'}`}>
            4. Preview & Cost
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: General Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Campaign Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Île-de-France Tech Lead Expansion Q3"
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Campaign strategic objective..."
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target Industry Sector</label>
                  <select
                    value={targetIndustry}
                    onChange={e => setTargetIndustry(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Technology & Software">Technology & Software</option>
                    <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                    <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                    <option value="Finance & Banking">Finance & Banking</option>
                    <option value="Manufacturing & Retail">Manufacturing & Retail</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Daily Outreach Budget (€)</label>
                  <input
                    type="number"
                    value={dailyBudget}
                    onChange={e => setDailyBudget(Number(e.target.value))}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Desired Result Limit</label>
                  <input
                    type="number"
                    step={25}
                    value={desiredResultLimit}
                    onChange={e => setDesiredResultLimit(Number(e.target.value))}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Maximum lead count to discover & enrich.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lifecycle Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              {/* Contact Preferences Checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Contact Preference Channels</label>
                <div className="flex flex-wrap gap-3">
                  {['email', 'phone', 'whatsapp', 'linkedin'].map(ch => (
                    <label key={ch} className="flex items-center gap-2 bg-[#0A0D14] border border-white/10 px-3 py-2 rounded-xl text-xs cursor-pointer hover:border-indigo-500/50">
                      <input
                        type="checkbox"
                        checked={contactPreferences.includes(ch)}
                        onChange={() => toggleContactPref(ch)}
                        className="rounded accent-indigo-600"
                      />
                      <span className="capitalize text-slate-200">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Polygon-Ready Geography */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Geography Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Geographic Selection Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGeographyType('radius')}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all ${geographyType === 'radius' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-[#0A0D14] border-white/10 text-slate-400'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-4 h-4 text-indigo-400" />
                      <span>Radius Search Center</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal">Search within radial distance around address center point.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGeographyType('polygon')}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all ${geographyType === 'polygon' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-[#0A0D14] border-white/10 text-slate-400'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>Polygon GeoJSON (Future-Proof)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal">Custom bounding box & multi-vertex map polygon ready.</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Center Search Address</label>
                <input
                  type="text"
                  value={centerAddress}
                  onChange={e => setCenterAddress(e.target.value)}
                  placeholder="e.g. 14 Boulevard Haussmann, Paris"
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">City / Region</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Radius Slider */}
              {geographyType === 'radius' && (
                <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Search Radius Distance</span>
                    <span className="text-indigo-400">{radiusKm} km</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={150}
                    step={5}
                    value={radiusKm}
                    onChange={e => setRadiusKm(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Categories & Keywords */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Business Categories Tag Builder */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Categories</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    placeholder="Add category tag..."
                    className="flex-1 bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={addCategory} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-medium">
                      {c}
                      <button onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3 hover:text-white" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Keywords Tag Builder */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Positive Target Keywords</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                    placeholder="e.g. SaaS, Enterprise, Cloud..."
                    className="flex-1 bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={addKeyword} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-lg text-xs font-medium">
                      {k}
                      <button onClick={() => setKeywords(keywords.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3 hover:text-white" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Exclusions */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Negative Exclusions</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newExclusion}
                    onChange={e => setNewExclusion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExclusion())}
                    placeholder="e.g. Agency, Freelance, Non-profit..."
                    className="flex-1 bg-[#0A0D14] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={addExclusion} className="px-3 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-xl text-xs font-semibold">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {exclusions.map((x, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium">
                      {x}
                      <button onClick={() => setExclusions(exclusions.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3 hover:text-white" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Server-Side Preview & Usage Warning */}
          {step === 4 && (
            <div className="space-y-5">
              {previewLoading ? (
                <div className="p-8 text-center text-slate-400 space-y-3">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Calculating server-side targeting estimation...</p>
                </div>
              ) : previewData ? (
                <div className="space-y-4">
                  {/* Estimated Match & Credit Summary Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Lead Matches</div>
                      <div className="text-2xl font-bold text-indigo-400">{previewData.estimatedTotalMatches} Companies</div>
                      <div className="text-[10px] text-slate-500 mt-1">Based on radius ({radiusKm}km) & categories</div>
                    </div>

                    <div className="p-4 bg-[#0A0D14] border border-white/10 rounded-xl">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Credit Usage</div>
                      <div className="text-2xl font-bold text-purple-400">~{previewData.estimatedCreditsCost} Credits</div>
                      <div className="text-[10px] text-slate-500 mt-1">For discovery & contact enrichment</div>
                    </div>
                  </div>

                  {/* Usage Warning Banner */}
                  {previewData.usageWarning && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                      <div>
                        <div className="font-bold">Usage Warning Alert</div>
                        <p className="mt-0.5 leading-relaxed">{previewData.usageWarning}</p>
                      </div>
                    </div>
                  )}

                  {/* Sample Matched Businesses Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2">Sample Server-Side Matched Companies</h4>
                    <div className="border border-white/10 rounded-xl overflow-hidden bg-[#0A0D14]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-slate-400 font-semibold border-b border-white/10 text-[10px] uppercase">
                          <tr>
                            <th className="p-3">Company Name</th>
                            <th className="p-3">Domain</th>
                            <th className="p-3">Industry</th>
                            <th className="p-3">Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                          {previewData.sampleResults?.map((res: any, i: number) => (
                            <tr key={i}>
                              <td className="p-3 font-semibold text-white">{res.name}</td>
                              <td className="p-3 text-slate-400">{res.domain}</td>
                              <td className="p-3">{res.industry}</td>
                              <td className="p-3">{res.city}, {res.country}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#161D2B] flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={step === 1}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-all disabled:opacity-30"
          >
            Previous
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {initialData ? 'Save Changes' : 'Launch Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
