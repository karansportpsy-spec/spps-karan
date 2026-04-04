import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, FileText, Lock, CheckCircle, LogOut, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Card } from '@/components/ui'

function ComplianceLayout({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-2xl">
        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['HIPAA', 'Agreement', 'Terms', 'Privacy'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">{i + 1}</div>
              <span className="text-xs text-gray-500 hidden sm:inline">{s}</span>
              {i < 3 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>
        <Card className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Icon size={24} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          {children}
        </Card>
      </div>
    </div>
  )
}

// ── Step 1: HIPAA BAA ─────────────────────────────────────────────────────────

export function HIPAAPage() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const { user, refreshProfile } = useAuth()

  async function handleNext() {
    if (!checked || !user) return
    setLoading(true)
    await supabase.from('practitioners').update({ hipaa_acknowledged: true }).eq('id', user.id)
    await refreshProfile()
    navigate('/compliance/user-agreement')
    setLoading(false)
  }

  return (
    <ComplianceLayout icon={Shield} title="HIPAA Acknowledgement" subtitle="Step 1 of 4 — Required for all practitioners">
      <div className="bg-blue-50 rounded-xl p-5 text-sm text-blue-800 mb-6 space-y-3">
        <p><strong>Protected Health Information (PHI):</strong> As a sport psychology practitioner, you handle sensitive client data protected under HIPAA. You must safeguard all PHI with appropriate technical, physical, and administrative controls.</p>
        <p><strong>Data Security:</strong> SPPS uses AES-256 encryption at rest and TLS 1.3 in transit. Session notes and athlete records are stored in HIPAA-eligible infrastructure.</p>
        <p><strong>Breach Notification:</strong> You agree to notify affected individuals and relevant authorities within 60 days of discovering a breach.</p>
        <p><strong>Minimum Necessary:</strong> Access only the minimum amount of PHI necessary to perform your duties.</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">
          I have read and understand the HIPAA requirements. I agree to handle all Protected Health Information in compliance with HIPAA regulations.
        </span>
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={handleNext} disabled={!checked} loading={loading}>Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 2: User Agreement ────────────────────────────────────────────────────

export function UserAgreementPage() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  return (
    <ComplianceLayout icon={FileText} title="User Agreement" subtitle="Step 2 of 4">
      <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 mb-6 space-y-3 max-h-64 overflow-y-auto">
        <p><strong>1. Acceptable Use.</strong> SPPS is provided exclusively for licensed sport psychology practitioners and mental health professionals working with athletes. You agree not to use the platform for any unlawful purpose.</p>
        <p><strong>2. Clinical Responsibility.</strong> SPPS is a tool to assist practitioners — it does not replace clinical judgment. You remain solely responsible for all clinical decisions.</p>
        <p><strong>3. AI Features.</strong> AI-generated reports and suggestions are for informational purposes only and must be reviewed and approved by a licensed practitioner before use.</p>
        <p><strong>4. Account Security.</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>
        <p><strong>5. Data Ownership.</strong> You retain ownership of all athlete and session data you enter. Anthropic retains no rights to your clinical data.</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">I agree to the SPPS User Agreement and understand my responsibilities as a practitioner.</span>
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => navigate('/compliance/terms')} disabled={!checked}>Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 3: Terms of Service ──────────────────────────────────────────────────

export function TermsPage() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  return (
    <ComplianceLayout icon={Lock} title="Terms of Service" subtitle="Step 3 of 4">
      <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 mb-6 space-y-3 max-h-64 overflow-y-auto">
        <p><strong>Subscription.</strong> SPPS is offered on a subscription basis. Free trials are available for 14 days. Continued use requires a paid plan.</p>
        <p><strong>Limitation of Liability.</strong> SPPS shall not be liable for any indirect, incidental, or consequential damages arising from use of the platform.</p>
        <p><strong>Modifications.</strong> We reserve the right to modify these terms. Continued use after notification of changes constitutes acceptance.</p>
        <p><strong>Termination.</strong> Either party may terminate this agreement with 30 days notice. Upon termination, you may export your data within 30 days.</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">I accept the SPPS Terms of Service.</span>
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => navigate('/compliance/data-privacy')} disabled={!checked}>Continue</Button>
      </div>
    </ComplianceLayout>
  )
}

// ── Step 4: Data Privacy (final step — critical routing fix here) ─────────────

export function DataPrivacyPage() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const { user, refreshProfile } = useAuth()

  async function handleComplete() {
    if (!checked || !user) return
    setLoading(true)
    await supabase.from('practitioners').update({ compliance_completed: true }).eq('id', user.id)
    await refreshProfile()
    navigate('/dashboard', { replace: true })
    setLoading(false)
  }

  return (
    <ComplianceLayout icon={CheckCircle} title="Data Privacy Policy" subtitle="Step 4 of 4 — Final step">
      <div className="bg-gray-50 rounded-xl p-5 text-sm text-gray-700 mb-6 space-y-3 max-h-64 overflow-y-auto">
        <p><strong>Data Collection.</strong> We collect account information, session metadata, and usage analytics to provide and improve SPPS. We do not sell your data.</p>
        <p><strong>Athlete Data.</strong> Athlete records are stored in encrypted, HIPAA-eligible storage. Access is restricted to your account only.</p>
        <p><strong>Third-Party Services.</strong> SPPS uses Supabase for database and auth, and groq for AI features. Both are bound by data processing agreements.</p>
        <p><strong>Your Rights.</strong> You have the right to access, correct, and delete your data at any time from the Settings page.</p>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">I acknowledge the SPPS Data Privacy Policy and consent to data processing as described.</span>
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={handleComplete} disabled={!checked} loading={loading}>Complete Setup →</Button>
      </div>
    </ComplianceLayout>
  )
}
