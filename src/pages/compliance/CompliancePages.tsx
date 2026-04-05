// src/pages/compliance/CompliancePages.tsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, FileText, Lock, CheckCircle, LogOut, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui'

// ── Layout wrapper shared by all 4 steps ─────────────────────────────────────

const STEPS = [
  { path: 'hipaa',          label: 'HIPAA' },
  { path: 'user-agreement', label: 'Agreement' },
  { path: 'terms',          label: 'Terms' },
  { path: 'data-privacy',   label: 'Privacy' },
]

function ComplianceLayout({
  step,
  icon: Icon,
  title,
  subtitle,
  children,
  onDisagree,
  disagreeLabel = 'I disagree — sign me out',
}: {
  step: 1 | 2 | 3 | 4
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
  onDisagree: () => void
  disagreeLabel?: string
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl">

        {/* Brand header */}
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

        {/* Step progress */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((s, i) => {
            const done    = i + 1 < step
            const current = i + 1 === step
            return (
              <React.Fragment key={s.path}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  done    ? 'bg-emerald-100 text-emerald-700' :
                  current ? 'bg-blue-600 text-white shadow-sm' :
                            'bg-gray-100 text-gray-400'
                }`}>
                  <span>{done ? '✓' : i + 1}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < 3 && <div className={`w-6 h-px ${done ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
              </React.Fragment>
            )
          })}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Card header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Icon size={22} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>

          {/* Card body */}
          <div className="px-6 py-5">
            {children}
          </div>

          {/* Disagree footer */}
          <div className="px-6 pb-5 pt-2">
            <button
              onClick={onDisagree}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-100"
            >
              <LogOut size={14} />
              {disagreeLabel}
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

// ── Step 1: HIPAA BAA ─────────────────────────────────────────────────────────

export function HIPAAPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleDisagree() {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <ComplianceLayout
      step={1}
      icon={Shield}
      title="HIPAA Business Associate Agreement"
      subtitle="Step 1 of 4 — Required before handling athlete health data"
      onDisagree={handleDisagree}
    >
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          <strong>Mandatory compliance.</strong> You must acknowledge this agreement before accessing any athlete records. This is required by law for handling Protected Health Information (PHI).
        </p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-4 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">HIPAA Business Associate Agreement (BAA)</h3>
        <p>This Agreement is entered into between you, the licensed sport psychology practitioner ("Covered Entity"), and WinMindPerform SPPS ("Business Associate"), in accordance with the Health Insurance Portability and Accountability Act of 1996 (HIPAA), the Health Information Technology for Economic and Clinical Health (HITECH) Act, and applicable state privacy laws.</p>

        <h4 className="font-semibold text-gray-900">1. Permitted Uses of Protected Health Information</h4>
        <p>SPPS is authorised to store, retrieve, and process PHI solely for the purpose of enabling you to provide sport psychology services. PHI includes but is not limited to: athlete psychological assessments, session notes, daily check-in scores, biofeedback data, and injury psychology records. SPPS will not use or disclose PHI for any purpose other than as permitted by this Agreement.</p>

        <h4 className="font-semibold text-gray-900">2. Data Security Safeguards</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Encryption at Rest:</strong> All database records are encrypted using AES-256 via Supabase (SOC 2 Type II certified infrastructure).</li>
          <li><strong>Encryption in Transit:</strong> All data transmission is protected by TLS 1.3.</li>
          <li><strong>Row Level Security (RLS):</strong> Database-level policies ensure your athlete data is physically inaccessible to other practitioners and SPPS staff.</li>
          <li><strong>Access Logging:</strong> All read, write, and delete operations on PHI are logged with timestamps and cannot be tampered with.</li>
        </ul>

        <h4 className="font-semibold text-gray-900">3. Breach Notification</h4>
        <p>In the event of a suspected or confirmed data breach involving unsecured PHI, SPPS will notify the affected practitioner within 72 hours of discovery, as required by the HITECH Act §13402.</p>

        <h4 className="font-semibold text-gray-900">4. Your Obligations as Covered Entity</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use strong, unique passwords and enable two-factor authentication where available.</li>
          <li>Obtain informed written consent from athletes before entering their data into SPPS.</li>
          <li>Do not access SPPS on unsecured public networks without a VPN.</li>
          <li>Immediately notify SPPS support if you suspect your account has been compromised.</li>
        </ul>

        <h4 className="font-semibold text-gray-900">5. Subcontractors</h4>
        <p>SPPS uses Supabase Inc. as its database and authentication subcontractor. Supabase is bound by a Data Processing Agreement (DPA) that mirrors the obligations in this BAA. A copy of Supabase's DPA is available at supabase.com/privacy.</p>

        <h4 className="font-semibold text-gray-900">6. Termination & Data Deletion</h4>
        <p>Upon account termination, SPPS will permanently delete all PHI within 30 days. You may also request immediate deletion at any time from the Settings panel. Deletion is irreversible.</p>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/user-agreement')}>
          I Acknowledge & Accept → Continue
        </Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 2: User Agreement ────────────────────────────────────────────────────

export function UserAgreementPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleDisagree() {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <ComplianceLayout
      step={2}
      icon={FileText}
      title="Practitioner User Agreement"
      subtitle="Step 2 of 4 — Professional conduct and clinical scope"
      onDisagree={handleDisagree}
    >
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-4 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">Professional Conduct & Scope of Practice</h3>
        <p>By using SPPS, you confirm that you are a qualified sport psychology practitioner, trainee under supervision, or allied health professional operating within your scope of practice, and that you agree to abide by the ethical codes of your relevant governing body (e.g., AASP, APA, BPS, ISSP, or equivalent national psychology council).</p>

        <h4 className="font-semibold text-gray-900">1. Clinical Responsibility</h4>
        <p>SPPS is a practitioner tool designed to support — not replace — your clinical judgment. All assessment scores, AI-generated reports, and case formulation summaries are decision-support aids. You retain full clinical and legal responsibility for every decision you make regarding an athlete's welfare.</p>

        <h4 className="font-semibold text-gray-900">2. Emergency Situations & Duty to Warn</h4>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-semibold text-red-800">⚠ SPPS is NOT an emergency response system.</p>
          <p className="text-red-700 mt-1">If an athlete discloses active suicidal ideation, intent to harm others, or flags critical risk on the IOC Mental Health Tool, you must immediately follow your jurisdiction's mandatory reporting and duty-to-warn obligations. Do not rely on SPPS alerts as a substitute for active clinical monitoring.</p>
        </div>

        <h4 className="font-semibold text-gray-900">3. Minors & Guardian Consent</h4>
        <p>Before entering data for any athlete under the age of digital consent in your jurisdiction (under 18 for most jurisdictions; under 15 for POCSO/GDPR Article 8), you agree to obtain explicit, documented written consent from a parent or legal guardian. SPPS provides a Parental Release consent form template for this purpose under the Consent Forms module.</p>

        <h4 className="font-semibold text-gray-900">4. Prohibited Uses</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>You must not use SPPS to diagnose DSM-5 clinical disorders without appropriate licensure.</li>
          <li>You must not share athlete UIDs or exported reports with unauthorised third parties.</li>
          <li>You must not use the AI features to replace a formal risk assessment in crisis situations.</li>
          <li>You must not enter data for athletes who have explicitly withdrawn their consent to data processing.</li>
        </ul>

        <h4 className="font-semibold text-gray-900">5. Supervision & Trainees</h4>
        <p>If you are a trainee or provisional registrant, you confirm that all client work conducted via SPPS is appropriately supervised by a fully qualified supervisor in accordance with your registration body's requirements.</p>

        <h4 className="font-semibold text-gray-900">6. Record Keeping</h4>
        <p>SPPS session notes and records are not a substitute for records required by your professional body. You are responsible for maintaining appropriate records in accordance with your jurisdiction's legal and ethical requirements, which may exceed what SPPS captures.</p>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/terms')}>
          I Accept the Agreement → Continue
        </Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 3: Terms of Service ──────────────────────────────────────────────────

export function TermsPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  async function handleDisagree() {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <ComplianceLayout
      step={3}
      icon={Lock}
      title="Terms of Service"
      subtitle="Step 3 of 4 — Platform rules and usage guidelines"
      onDisagree={handleDisagree}
    >
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-4 max-h-80 overflow-y-auto">
        <h3 className="font-bold text-gray-900">WinMindPerform SPPS — Terms of Service</h3>
        <p className="text-xs text-gray-400">Last updated: April 2025 · Version 1.0</p>

        <h4 className="font-semibold text-gray-900">1. Data Ownership</h4>
        <p>You retain complete ownership of all clinical notes, athlete profiles, assessment results, and reports you create within SPPS. WinMindPerform claims no intellectual property rights over your clinical data or formulations. SPPS is a tool; the clinical work is yours.</p>

        <h4 className="font-semibold text-gray-900">2. Account Security</h4>
        <p>You are responsible for maintaining the confidentiality of your login credentials. You agree to notify SPPS support immediately at support@winmindperform.com if you believe your account has been accessed without your authorisation.</p>

        <h4 className="font-semibold text-gray-900">3. Service Availability</h4>
        <p>SPPS is provided on a best-efforts basis. While we target 99.9% uptime, we are not liable for service interruptions caused by third-party infrastructure providers (Supabase, Vercel, Groq), internet outages, or force majeure events. We recommend not relying solely on SPPS during live crisis or high-risk clinical sessions.</p>

        <h4 className="font-semibold text-gray-900">4. Limitation of Liability</h4>
        <p>The Mental Performance Lab, Psychophysiology, and Neurocognitive modules provide tools for performance optimisation and psychophysiological tracking. They are not medical devices and are not intended for the diagnosis, prevention, or treatment of neurological or psychiatric disorders. Any data from these modules used in clinical decision-making is at the practitioner's professional discretion and risk.</p>

        <h4 className="font-semibold text-gray-900">5. Subscription & Fees</h4>
        <p>SPPS is currently in a beta testing phase and is provided free of charge to registered practitioners. Pricing terms, if applicable, will be communicated with a minimum of 30 days' advance notice before any paid tier is introduced. You will always have the option to export your data before any billing changes take effect.</p>

        <h4 className="font-semibold text-gray-900">6. Account Termination & Data Deletion</h4>
        <p>You may delete your account at any time from the Settings panel. Upon confirmed deletion, all associated practitioner data, athlete records, session notes, assessment results, and generated reports will be permanently and irreversibly destroyed within 30 days to comply with data minimisation principles under GDPR and DPDP Act 2023.</p>

        <h4 className="font-semibold text-gray-900">7. Updates to These Terms</h4>
        <p>We may update these Terms periodically. Material changes will be communicated via email to your registered address and will require re-acknowledgement on your next login. Continued use of SPPS after re-acknowledgement constitutes acceptance.</p>

        <h4 className="font-semibold text-gray-900">8. Governing Law</h4>
        <p>These Terms are governed by the laws of India. Any disputes shall first be attempted to be resolved through good-faith mediation before escalation to formal legal proceedings.</p>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => navigate('/compliance/data-privacy')}>
          I Accept the Terms → Continue
        </Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 4: Data Privacy (final step — critical routing fix here) ─────────────

export function DataPrivacyPage() {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const { user, refreshProfile, signOut } = useAuth()

  async function handleDisagree() {
    await signOut()
    window.location.replace('/auth/login')
  }

  async function handleComplete() {
    if (!user || !checked) return
    setLoading(true)
    setError('')

    try {
      // Step 1: Upsert (not update) so the row is created if it somehow doesn't exist
      // A plain .update() silently succeeds with 0 rows affected if the row is missing,
      // which means compliance_completed never gets set and the user loops back to step 1
      const { error: dbError } = await supabase
        .from('practitioners')
        .upsert({
          id:                   user.id,
          email:                user.email ?? '',
          compliance_completed: true,
          hipaa_acknowledged:   true,
        }, { onConflict: 'id' })

      if (dbError) {
        console.error('[SPPS Compliance] DB upsert failed:', dbError.message)
        setError('Could not save your acknowledgement. Please try again.')
        setLoading(false)
        return
      }

      // Upsert succeeded — refresh profile and navigate to profile setup.
      // The old verify SELECT used .single() which throws when row count is
      // unexpected, causing false "could not be verified" errors even when
      // compliance_completed was correctly saved.
      await refreshProfile()
      window.location.replace('/profile/setup')

    } catch (err: any) {
      console.error('[SPPS Compliance] Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ComplianceLayout
      step={4}
      icon={CheckCircle}
      title="Data Privacy & AI Processing Policy"
      subtitle="Step 4 of 4 — Final step before accessing the platform"
      onDisagree={handleDisagree}
      disagreeLabel="I do not consent — cancel and sign me out"
    >
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-4 max-h-72 overflow-y-auto">
        <h3 className="font-bold text-gray-900">Data Privacy & Processing Policy</h3>
        <p className="text-xs text-gray-400">Compliant with GDPR, CCPA, and India's Digital Personal Data Protection Act 2023 (DPDP Act)</p>

        <h4 className="font-semibold text-gray-900">1. What We Collect</h4>
        <p>SPPS collects: (a) account information you provide during registration; (b) athlete records, session notes, assessments, and clinical data you enter; (c) usage analytics such as page views and feature usage (anonymised, no athlete data is included in analytics).</p>

        <h4 className="font-semibold text-gray-900">2. Database Infrastructure (Supabase)</h4>
        <p>All data is stored in Supabase-managed PostgreSQL databases hosted on AWS. Supabase is SOC 2 Type II certified. Data is encrypted at rest and in transit. Row Level Security (RLS) policies ensure that no practitioner can access another practitioner's athlete data — not even SPPS staff.</p>

        <h4 className="font-semibold text-gray-900">3. AI Features — Powered by Groq API</h4>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="font-semibold text-blue-800">How SPPS AI works with your data:</p>
          <ul className="list-disc pl-4 space-y-1 text-blue-700 mt-1">
            <li><strong>Provider:</strong> SPPS uses the <strong>Groq API</strong> (Llama 3 models) for AI Assistant, report generation, and case formulations.</li>
            <li><strong>Zero Training:</strong> Groq does NOT use your prompts, session notes, or athlete data to train any AI models.</li>
            <li><strong>Transient Processing:</strong> Data sent to Groq is processed in memory during the request and immediately discarded upon response. No data is stored on Groq's servers after the API call completes.</li>
            <li><strong>Your Control:</strong> AI features are optional. You can use SPPS fully without ever triggering an AI call.</li>
            <li><strong>Anonymisation:</strong> All AI-powered PDF exports use only the athlete's UID code — names, dates of birth, and contact details are never included in exported documents.</li>
          </ul>
        </div>

        <h4 className="font-semibold text-gray-900">4. Your Rights</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access:</strong> Download a complete export of all your practice data (CSV/Excel) at any time from Settings.</li>
          <li><strong>Correction:</strong> Edit or update any athlete or practitioner record directly in the platform.</li>
          <li><strong>Deletion:</strong> Permanently delete your account and all associated data from Settings → Account.</li>
          <li><strong>Portability:</strong> Your data exports are in open formats (CSV, .txt) that are not locked to SPPS.</li>
        </ul>

        <h4 className="font-semibold text-gray-900">5. Data Retention</h4>
        <p>Data is retained for as long as your account is active. Upon account deletion, all data is permanently destroyed within 30 days. You will receive an email confirmation once deletion is complete.</p>

        <h4 className="font-semibold text-gray-900">6. No Data Selling</h4>
        <p>WinMindPerform does not sell, rent, or share athlete or practitioner data with advertisers, data brokers, or any third parties for commercial purposes. Full stop.</p>
      </div>

      {/* Consent checkbox */}
      <label className="flex items-start gap-3 cursor-pointer bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4 hover:bg-emerald-100 transition-colors">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => setChecked(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
        />
        <span className="text-sm font-medium text-emerald-900">
          I have read and fully understand the SPPS Data Privacy Policy. I consent to the collection and processing of data as described above, including the use of the Groq API for AI-powered features. I confirm I am a qualified practitioner operating within my professional scope.
        </span>
      </label>

      {/* Error message */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          onClick={handleComplete}
          disabled={!checked}
          loading={loading}
          className="shadow-md"
        >
          ✓ Complete Setup &amp; Enter SPPS
        </Button>
      </div>
    </ComplianceLayout>
  )
}
