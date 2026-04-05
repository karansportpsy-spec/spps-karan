// src/pages/auth/ProfileSetupPage.tsx
// Profile setup step — shown once after compliance completion.
// Collects professional role, organisation, experience, specialisations, bio.
// Save or Skip both go to /dashboard immediately.
// DB write is best-effort — never blocks navigation.

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCircle, Building2, Briefcase, Tag, FileText, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const ROLES = [
  { value: 'sport_psychologist',    label: 'Sport Psychologist',        icon: '🧠' },
  { value: 'counsellor',            label: 'Counsellor / Therapist',     icon: '💬' },
  { value: 'psychometrist',         label: 'Psychometrist',              icon: '📊' },
  { value: 'researcher',            label: 'Researcher',                 icon: '🔬' },
  { value: 'student_intern',        label: 'Student / Intern',           icon: '🎓' },
  { value: 'performance_coach',     label: 'Performance Coach',          icon: '🏆' },
]

const ORG_TYPES = [
  'National Federation', 'State Sports Academy', 'Club / Academy',
  'University / College', 'Hospital / Clinic', 'Private Practice',
  'Corporate / Industry', 'Military / Defence', 'Other',
]

const SPECIALISATIONS = [
  'Performance Optimisation', 'Anxiety & Stress Management',
  'Injury Rehabilitation Psychology', 'Team Cohesion & Leadership',
  'Youth Athlete Development', 'Elite / Olympic Athletes',
  'Mindfulness & Mental Skills', 'Burnout & Recovery',
  'Talent Identification', 'Return to Sport', 'Crisis Intervention',
  'Neurocognitive Performance', 'Psychophysiology & Biofeedback',
]

export default function ProfileSetupPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [role, setRole]               = useState('')
  const [orgName, setOrgName]         = useState('')
  const [orgType, setOrgType]         = useState('')
  const [phone, setPhone]             = useState('')
  const [years, setYears]             = useState('')
  const [specs, setSpecs]             = useState<string[]>([])
  const [bio, setBio]                 = useState('')
  const [roleError, setRoleError]     = useState(false)
  const [saving, setSaving]           = useState(false)

  function toggleSpec(s: string) {
    setSpecs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  // Save profile and navigate — MUST await so router guards see updated state
  async function persistAndNavigate(completed: boolean) {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase.from('practitioners').upsert({
        id:                   user.id,
        email:                user.email ?? '',
        professional_role:    role || null,
        organisation_name:    orgName || null,
        organisation_type:    orgType || null,
        phone:                phone || null,
        years_of_practice:    years ? parseInt(years) : null,
        specialisation_areas: specs.length > 0 ? specs : null,
        bio:                  bio || null,
        profile_completed:    completed,
      }, { onConflict: 'id' })

      if (error) {
        console.warn('[SPPS ProfileSetup] Save failed:', error.message)
      }

      // Refresh in-memory practitioner state so RequireAuth / RedirectIfAuth
      // see profile_completed = true and don't redirect back here
      await refreshProfile()
    } catch (err) {
      console.warn('[SPPS ProfileSetup] Save error:', err)
    }
    // Always navigate even if save failed — user can fix in Settings
    navigate('/dashboard', { replace: true })
  }

  function handleSave() {
    if (!role) { setRoleError(true); return }
    setRoleError(false)
    persistAndNavigate(true)
  }

  function handleSkip() {
    persistAndNavigate(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl">

        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#1A2D4A] flex items-center justify-center">
              <span className="text-[#3DDC84] font-black text-sm">W</span>
            </div>
            <span className="font-black text-[#1A2D4A] text-lg tracking-tight">
              WIN<span className="text-[#2D7DD2]">MIND</span>PERFORM
            </span>
          </div>
          <p className="text-xs text-gray-400">Sport Psychology Practitioner Suite · Profile Setup</p>
        </div>

        {/* Progress: all 4 compliance steps done */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {['HIPAA', 'Agreement', 'Terms', 'Privacy', 'Profile'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                i < 4 ? 'bg-emerald-100 text-emerald-700' :
                'bg-blue-600 text-white shadow-sm'
              }`}>
                <span>{i < 4 ? '✓' : '5'}</span>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < 4 && <div className={`w-4 h-px ${i < 4 ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <UserCircle size={22} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Complete Your Profile</h1>
              <p className="text-xs text-gray-500 mt-0.5">Optional — takes 2 minutes · editable anytime in Settings</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">

            {/* Role selector */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Briefcase size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-gray-900">
                  Your Role <span className="text-red-500">*</span>
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => { setRole(r.value); setRoleError(false) }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all text-sm ${
                      role === r.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                        : 'border-gray-100 hover:border-gray-200 text-gray-700'
                    }`}
                  >
                    <span className="text-base">{r.icon}</span>
                    <span className="leading-tight text-xs">{r.label}</span>
                  </button>
                ))}
              </div>
              {roleError && (
                <p className="text-xs text-red-600 mt-2">Please select your professional role to continue.</p>
              )}
            </div>

            {/* Organisation */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-gray-900">Organisation</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Organisation Name</label>
                  <input
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="e.g. SAI, AIFF, Club name…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Organisation Type</label>
                  <select
                    value={orgType}
                    onChange={e => setOrgType(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">— Select type —</option>
                    {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Experience */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Years of Practice</label>
              <input
                type="number"
                min={0}
                max={50}
                value={years}
                onChange={e => setYears(e.target.value)}
                placeholder="e.g. 5"
                className="w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Specialisations */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-gray-900">Specialisation Areas</p>
                <span className="text-xs text-gray-400">(select all that apply)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SPECIALISATIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSpec(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      specs.includes(s)
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={15} className="text-blue-600" />
                <p className="text-sm font-semibold text-gray-900">Professional Bio</p>
                <span className="text-xs text-gray-400">(optional)</span>
              </div>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                placeholder="Brief professional background, approach, and areas of expertise…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

          </div>

          {/* Footer actions */}
          <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3">
            <button
              onClick={handleSkip}
              disabled={saving}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              Skip for now — complete in Settings later
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save & Go to Dashboard'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          All fields editable anytime in Settings → Profile · WinMindPerform SPPS
        </p>
      </div>
    </div>
  )
}
