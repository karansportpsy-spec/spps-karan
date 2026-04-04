// src/pages/auth/ProfileSetupPage.tsx
// Sits between compliance and dashboard.
// Collects professional details — saves in background, navigates immediately.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

const ROLES = [
  { value: 'sport_psychologist',  label: 'Sport Psychologist' },
  { value: 'counsellor',          label: 'Counsellor / Psychotherapist' },
  { value: 'psychometrist',       label: 'Psychometrist' },
  { value: 'researcher',          label: 'Researcher' },
  { value: 'student_intern',      label: 'Student / Intern (supervised)' },
  { value: 'admin',               label: 'Administrator' },
]

const ORG_TYPES = [
  { value: 'national_federation', label: 'National Sports Federation' },
  { value: 'state_academy',       label: 'State Sports Academy / SAI' },
  { value: 'club',                label: 'Sports Club / Franchise' },
  { value: 'hospital',            label: 'Hospital / Clinic' },
  { value: 'university',          label: 'University / College' },
  { value: 'private_practice',    label: 'Private Practice' },
  { value: 'research',            label: 'Research Institution' },
  { value: 'other',               label: 'Other' },
]

export default function ProfileSetupPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    professional_role: 'sport_psychologist',
    organisation_name: '',
    organisation_type: 'private_practice',
    years_of_practice: '',
    bio: '',
    phone: '',
  })

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  function persistToDb() {
    // Fire and forget — never block navigation on this
    if (!user) return
    supabase.from('practitioners').update({
      professional_role:  form.professional_role,
      organisation_name:  form.organisation_name || null,
      organisation_type:  form.organisation_type || null,
      years_of_practice:  form.years_of_practice ? Number(form.years_of_practice) : null,
      bio:                form.bio || null,
      phone:              form.phone || null,
      profile_completed:  true,
    }).eq('id', user.id).then(({ error }) => {
      if (error) console.warn('[SPPS Profile] Save warning:', error.message)
    })
  }

  function handleSave() {
    persistToDb()
    navigate('/dashboard', { replace: true })
  }

  function handleSkip() {
    // Mark profile complete even on skip so they don't see this page again
    if (user) {
      supabase.from('practitioners')
        .update({ profile_completed: true })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error) console.warn('[SPPS Profile] Skip save warning:', error.message)
        })
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-xl">

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

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <h1 className="text-lg font-bold text-gray-900">Tell us about yourself</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              This helps personalise your SPPS experience. You can update these details anytime in Settings.
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your professional role <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, professional_role: r.value }))}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      form.professional_role === r.value
                        ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Organisation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisation / Institution</label>
                <input
                  type="text"
                  value={form.organisation_name}
                  onChange={set('organisation_name')}
                  placeholder="e.g. SAI, AIFF, Club name…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisation type</label>
                <select
                  value={form.organisation_type}
                  onChange={set('organisation_type')}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ORG_TYPES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Years + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years in practice</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={form.years_of_practice}
                  onChange={set('years_of_practice')}
                  placeholder="e.g. 5"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Professional bio (optional)</label>
              <textarea
                value={form.bio}
                onChange={set('bio')}
                rows={3}
                placeholder="Brief description of your work, specialisations, and athlete populations…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-between gap-3">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip for now →
            </button>
            <button
              onClick={handleSave}
              disabled={!form.professional_role}
              className="px-6 py-2.5 bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save &amp; Enter SPPS →
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          WinMindPerform · SPPS · All data is stored securely in compliance with DPDP Act 2023
        </p>
      </div>
    </div>
  )
}
