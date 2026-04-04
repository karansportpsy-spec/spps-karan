// src/pages/auth/ProfileSetupPage.tsx
// DESIGN PRINCIPLE: Navigate FIRST, write DB in background.
// The router only checks compliance_completed, so navigation is never
// blocked by DB latency or RLS issues. Works even if update fails.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Building, Phone, FileText, CheckCircle, Briefcase } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

const ROLES = [
  { value: 'sport_psychologist',     label: 'Sport Psychologist',        desc: 'Registered / licensed practitioner' },
  { value: 'counsellor',             label: 'Counsellor / Therapist',    desc: 'Mental health counselling focus' },
  { value: 'performance_consultant', label: 'Performance Consultant',    desc: 'Non-clinical performance work' },
  { value: 'researcher',             label: 'Researcher / Academic',     desc: 'Research or university context' },
  { value: 'coach_with_psych',       label: 'Coach with Psych Training', desc: 'Coaching + psychology skills' },
  { value: 'intern_trainee',         label: 'Intern / Trainee',          desc: 'Supervised practice' },
]
const ORG_TYPES = [
  'National Sports Federation','State Sports Academy','Sports Science Centre',
  'Professional Club / Franchise','University / College','Private Practice',
  'Hospital / Rehabilitation Centre','Olympic / Paralympic Programme',
  'School / Youth Sports','Corporate / Military','Other',
]
const SPECS = [
  'Performance Enhancement','Anxiety & Stress','Career Transitions',
  'Injury Rehabilitation','Team Dynamics','Leadership','Youth Development',
  'Trauma-Informed','Eating Disorders','Neuropsychology',
]

export default function ProfileSetupPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [role, setRole]       = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('')
  const [phone, setPhone]     = useState('')
  const [bio, setBio]         = useState('')
  const [years, setYears]     = useState('')
  const [specs, setSpecs]     = useState<string[]>([])
  const [roleError, setRoleError] = useState(false)

  function toggleSpec(s: string) {
    setSpecs(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])
  }

  function persist(uid: string) {
    // Fire and forget — never blocks navigation
    supabase.from('practitioners').upsert({
      id: uid,
      professional_role:    role || null,
      organisation_name:    orgName || null,
      organisation_type:    orgType || null,
      phone:                phone || null,
      bio:                  bio || null,
      years_of_practice:    years ? parseInt(years) : null,
      specialisation_areas: specs.length ? specs : null,
      profile_completed:    true,
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[ProfileSetup] save warning:', error.message)
    })
  }

  function go() {
    if (!role) { setRoleError(true); return }
    if (user?.id) persist(user.id)
    navigate('/dashboard', { replace: true })
  }

  function skip() {
    if (user?.id) {
      supabase.from('practitioners')
        .upsert({ id: user.id, profile_completed: true }, { onConflict: 'id' })
        .then(({ error }) => { if (error) console.warn('[ProfileSetup] skip warning:', error.message) })
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#0D1F35] px-6 py-4 flex items-center justify-between">
        <LogoBrand size="md" variant="sidebar" />
        <span className="text-xs text-white/40 hidden sm:block">Step 3 of 3 — Profile Setup</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <User size={26} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Almost there! Tell us about yourself</h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            This personalises your SPPS experience. Everything can be updated later in Settings.
          </p>
        </div>

        <div className="space-y-5">
          {/* Role */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase size={16} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Your Role <span className="text-red-500">*</span></h2>
            </div>
            {roleError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">Please select your role.</p>}
            <div className="grid sm:grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => { setRole(r.value); setRoleError(false) }}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    role === r.value ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    role === r.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                    {role === r.value && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Organisation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Building size={16} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Organisation <span className="text-gray-400 text-xs font-normal">(optional)</span></h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
                <input value={orgName} onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. SAI, AIFF, Club name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
                <select value={orgType} onChange={e => setOrgType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— Select —</option>
                  {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contact & Experience */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Phone size={16} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Contact & Experience <span className="text-gray-400 text-xs font-normal">(optional)</span></h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Years of Practice</label>
                <input type="number" min="0" max="50" value={years} onChange={e => setYears(e.target.value)} placeholder="e.g. 8"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Specialisations */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={16} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Specialisation Areas <span className="text-gray-400 text-xs font-normal">(select all that apply)</span></h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {SPECS.map(s => (
                <button key={s} onClick={() => toggleSpec(s)}
                  className={`text-sm px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                    specs.includes(s) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">Bio <span className="text-gray-400 text-xs font-normal">(optional · appears on PDF exports)</span></h2>
            </div>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
              placeholder="Brief background, qualifications, areas of practice…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button onClick={skip}
              className="px-5 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors">
              Skip
            </button>
            <button onClick={go}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
              <CheckCircle size={16} />
              Save &amp; Go to Dashboard
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 pb-6">All details can be updated in Settings</p>
        </div>
      </div>
    </div>
  )
}
