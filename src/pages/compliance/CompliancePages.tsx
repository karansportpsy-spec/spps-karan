// src/pages/compliance/CompliancePages.tsx
// Step 4 redirects to /profile/setup using window.location.replace
// Uses upsert (not update) so it works even if practitioners row is new

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, FileText, Lock, CheckCircle, LogOut, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui'

const STEPS = [
  { path: 'hipaa', label: 'HIPAA' },
  { path: 'user-agreement', label: 'Agreement' },
  { path: 'terms', label: 'Terms' },
  { path: 'data-privacy', label: 'Privacy' },
]

function ComplianceLayout({ step, icon: Icon, title, subtitle, children, onDisagree, disagreeLabel = 'I disagree — sign me out' }: {
  step: 1 | 2 | 3 | 4; icon: React.ElementType; title: string; subtitle: string
  children: React.ReactNode; onDisagree: () => void; disagreeLabel?: string
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#1A2D4A] flex items-center justify-center">
              <span className="text-[#3DDC84] font-black text-sm">W</span>
            </div>
            <span className="font-black text-[#1A2D4A] text-lg tracking-tight">
              WIN<span className="text-[#2D7DD2]">MIND</span>PERFORM
            </span>
          </div>
          <p className="text-xs text-gray-400">Sport Psychology Practitioner Suite · Setup</p>
        </div>
        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((s, i) => {
            const done = i + 1 < step; const current = i + 1 === step
            return (
              <React.Fragment key={s.path}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <span>{done ? '✓' : i + 1}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < 3 && <div className={`w-6 h-px ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
              </React.Fragment>
            )
          })}
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Icon size={22} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div className="px-6 py-5">{children}</div>
          <div className="px-6 pb-5 pt-2">
            <button onClick={onDisagree} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all">
              <LogOut size={14} />{disagreeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HIPAAPage() {
  const navigate = useNavigate(); const { signOut } = useAuth()
  return (
    <ComplianceLayout step={1} icon={Shield} title="HIPAA Business Associate Agreement" subtitle="Step 1 of 4 — Required before handling athlete health data" onDisagree={async () => { await signOut(); navigate('/auth/login', { replace: true }) }}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800"><strong>Mandatory compliance.</strong> You must acknowledge this agreement before accessing any athlete records.</p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">HIPAA Business Associate Agreement (BAA)</h3>
        <p>This Agreement is entered into between you, the licensed sport psychology practitioner, and WinMindPerform SPPS, in accordance with HIPAA, HITECH, and applicable state privacy laws.</p>
        <h4 className="font-semibold">1. Permitted Uses of PHI</h4>
        <p>SPPS is authorised to store, retrieve, and process PHI solely for enabling you to provide sport psychology services.</p>
        <h4 className="font-semibold">2. Data Security</h4>
        <ul className="list-disc pl-5 space-y-1"><li>AES-256 encryption at rest (Supabase, SOC 2 Type II)</li><li>TLS 1.3 in transit</li><li>Row Level Security — your data is inaccessible to others</li><li>Full PHI audit logging</li></ul>
        <h4 className="font-semibold">3. Breach Notification</h4>
        <p>Notification within 72 hours of confirmed breach as required by HITECH §13402.</p>
        <h4 className="font-semibold">4. Your Obligations</h4>
        <ul className="list-disc pl-5 space-y-1"><li>Use strong, unique passwords</li><li>Obtain written consent from athletes before entering data</li><li>Notify support immediately if account is compromised</li></ul>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/user-agreement')}>I Acknowledge &amp; Accept → Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

export function UserAgreementPage() {
  const navigate = useNavigate(); const { signOut } = useAuth()
  return (
    <ComplianceLayout step={2} icon={FileText} title="Practitioner User Agreement" subtitle="Step 2 of 4 — Professional conduct and clinical scope" onDisagree={async () => { await signOut(); navigate('/auth/login', { replace: true }) }}>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">Professional Conduct &amp; Scope of Practice</h3>
        <p>By using SPPS, you confirm you are a qualified sport psychology practitioner, trainee under supervision, or allied health professional operating within your scope of practice.</p>
        <h4 className="font-semibold">1. Clinical Responsibility</h4>
        <p>SPPS supports — never replaces — your clinical judgment. You retain full clinical and legal responsibility for every decision regarding athlete welfare.</p>
        <h4 className="font-semibold">2. Emergency Situations</h4>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="font-semibold text-red-800">⚠ SPPS is NOT an emergency response system.</p><p className="text-red-700 mt-1">Follow your jurisdiction's mandatory reporting obligations immediately for any crisis disclosure.</p></div>
        <h4 className="font-semibold">3. Minors</h4>
        <p>For athletes under 18, obtain written parental/guardian consent before entering data. Use the SPPS Consent Forms module.</p>
        <h4 className="font-semibold">4. Prohibited Uses</h4>
        <ul className="list-disc pl-5 space-y-1"><li>No DSM-5 diagnoses without appropriate licensure</li><li>No sharing of athlete UIDs/reports with unauthorised parties</li><li>No AI features as substitute for formal crisis assessment</li></ul>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/terms')}>I Accept the Agreement → Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

export function TermsPage() {
  const navigate = useNavigate(); const { signOut } = useAuth()
  return (
    <ComplianceLayout step={3} icon={Lock} title="Terms of Service" subtitle="Step 3 of 4 — Platform rules and usage guidelines" onDisagree={async () => { await signOut(); navigate('/auth/login', { replace: true }) }}>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">WinMindPerform SPPS — Terms of Service v1.0</h3>
        <h4 className="font-semibold">1. Data Ownership</h4>
        <p>You retain complete ownership of all clinical data you create. WinMindPerform claims no IP rights over your clinical work.</p>
        <h4 className="font-semibold">2. Account Security</h4>
        <p>Maintain confidentiality of your credentials. Notify support@winmindperform.com immediately of any suspected compromise.</p>
        <h4 className="font-semibold">3. Service Availability</h4>
        <p>SPPS targets 99.9% uptime but is not liable for interruptions caused by Supabase, Vercel, Groq, or internet outages.</p>
        <h4 className="font-semibold">4. Subscription &amp; Fees</h4>
        <p>Currently in beta — free of charge. Pricing changes will be communicated with minimum 30 days' notice.</p>
        <h4 className="font-semibold">5. Data Deletion</h4>
        <p>All data is permanently destroyed within 30 days of account deletion in compliance with GDPR and DPDP Act 2023.</p>
        <h4 className="font-semibold">6. Governing Law</h4>
        <p>Governed by the laws of India. Disputes resolved through good-faith mediation first.</p>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/data-privacy')}>I Accept the Terms → Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

export function DataPrivacyPage() {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user, signOut } = useAuth()

  async function handleComplete() {
    if (!user || !checked) return
    setLoading(true); setError('')
    try {
      const { error: dbError } = await supabase
        .from('practitioners')
        .upsert({
          id: user.id,
          email: user.email ?? '',
          compliance_completed: true,
          hipaa_acknowledged: true,
          notification_email: true,
          notification_sms: false,
        }, { onConflict: 'id', ignoreDuplicates: false })

      if (dbError) {
        setError('Could not save. Please try again. (' + dbError.message + ')')
        setLoading(false)
        return
      }
      // Hard redirect — avoids all React Router race conditions
      window.location.replace('/profile/setup')
    } catch (err: any) {
      setError('Unexpected error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ComplianceLayout step={4} icon={CheckCircle} title="Data Privacy &amp; AI Processing Policy" subtitle="Step 4 of 4 — Final step before accessing the platform" onDisagree={async () => { await signOut(); window.location.replace('/auth/login') }} disagreeLabel="I do not consent — cancel and sign me out">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3 max-h-72 overflow-y-auto">
        <h3 className="font-bold text-gray-900">Data Privacy &amp; Processing Policy</h3>
        <p className="text-xs text-gray-400">GDPR · CCPA · India DPDP Act 2023 compliant</p>
        <h4 className="font-semibold">1. What We Collect</h4>
        <p>Account info, athlete clinical data you enter, and anonymised usage analytics (no athlete data in analytics).</p>
        <h4 className="font-semibold">2. AI Features — Groq API</h4>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <ul className="list-disc pl-4 space-y-1 text-blue-700">
            <li><strong>Provider:</strong> Groq API (Llama 3 models)</li>
            <li><strong>Zero Training:</strong> Groq does NOT train on your data</li>
            <li><strong>Transient:</strong> Data processed in memory, discarded after each call</li>
            <li><strong>Anonymisation:</strong> All PDF exports use athlete UID only — no PII</li>
          </ul>
        </div>
        <h4 className="font-semibold">3. Your Rights</h4>
        <ul className="list-disc pl-5 space-y-1"><li>Download all your data from Settings anytime</li><li>Delete your account and all data permanently from Settings</li><li>Exports in open CSV/text formats</li></ul>
        <h4 className="font-semibold">4. No Data Selling</h4>
        <p>WinMindPerform never sells, rents, or shares your data with advertisers or data brokers.</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4 hover:bg-emerald-100 transition-colors">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-0.5 w-5 h-5 rounded border-gray-300 text-emerald-600 shrink-0" />
        <span className="text-sm font-medium text-emerald-900">
          I have read and fully understand the SPPS Data Privacy Policy. I consent to data collection and processing as described, including Groq API for AI features. I confirm I am a qualified practitioner operating within my professional scope.
        </span>
      </label>
      {error && <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}
      <div className="mt-5 flex justify-end">
        <Button onClick={handleComplete} disabled={!checked} loading={loading}>
          ✓ Complete Setup &amp; Continue →
        </Button>
      </div>
    </ComplianceLayout>
  )
}
