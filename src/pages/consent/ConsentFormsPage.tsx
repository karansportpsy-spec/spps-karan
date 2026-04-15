// src/pages/consent/ConsentFormsPage.tsx
// Integrated consent & confidentiality forms + parental release
// Athletes can fill online or practitioner can upload a scanned offline copy.
// All records stored in Supabase 'consent_forms' table.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Upload, Check, AlertTriangle, Download,
  Shield, User, Users, ChevronDown, ChevronUp, Eye,
  Calendar, Printer, Trash2,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Modal, Input, Select, Spinner, EmptyState, Avatar } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import { createConsent, deleteConsent, listConsents } from '@/services/consentApi'

// ── Types ─────────────────────────────────────────────────────────────────────

type FormType = 'consent_confidentiality' | 'parental_release' | 'photo_media' | 'emergency_medical'
type FormStatus = 'pending' | 'signed' | 'expired' | 'uploaded'

interface ConsentForm {
  id: string
  practitioner_id: string
  athlete_id: string
  form_type: FormType
  status: FormStatus
  signed_by: string
  signed_at?: string
  valid_until?: string
  guardian_name?: string
  guardian_relationship?: string
  guardian_email?: string
  guardian_phone?: string
  notes?: string
  file_url?: string
  form_data?: Record<string, any>
  created_at: string
}

// ── Form templates ────────────────────────────────────────────────────────────

const FORM_TYPES = [
  {
    type: 'consent_confidentiality' as FormType,
    label: 'Consent & Confidentiality',
    icon: Shield,
    color: 'bg-blue-100 text-blue-700',
    description: 'Informed consent for psychological services and confidentiality agreement',
  },
  {
    type: 'parental_release' as FormType,
    label: 'Parental / Guardian Release',
    icon: Users,
    color: 'bg-purple-100 text-purple-700',
    description: 'For athletes under 18 — parent/guardian consent required',
  },
  {
    type: 'photo_media' as FormType,
    label: 'Photo & Media Release',
    icon: User,
    color: 'bg-amber-100 text-amber-700',
    description: 'Permission for use of images/videos in educational or promotional material',
  },
  {
    type: 'emergency_medical' as FormType,
    label: 'Emergency Medical Authority',
    icon: AlertTriangle,
    color: 'bg-red-100 text-red-700',
    description: 'Authorisation to seek emergency medical treatment if required',
  },
]

// ── Consent form text ─────────────────────────────────────────────────────────

const CONSENT_TEXT = {
  consent_confidentiality: {
    title: 'Informed Consent and Confidentiality Agreement',
    sections: [
      {
        heading: 'Nature of Services',
        text: 'Sport psychology services may include psychological assessment, performance enhancement, mental skills training, counselling, and related services. I understand that these services are provided by a qualified sport psychologist operating under the WinMindPerform platform.',
      },
      {
        heading: 'Confidentiality',
        text: 'All information disclosed during sessions is confidential and will not be shared without written consent, except where required by law, including: (1) imminent risk of harm to self or others; (2) court order; (3) suspected child abuse or neglect; (4) certain public health requirements. Session notes are kept securely and only accessible to the treating practitioner.',
      },
      {
        heading: 'Records and Data',
        text: 'Assessment results, session notes, and check-in data are stored securely in compliance with the Digital Personal Data Protection Act 2023 (DPDP Act). You have the right to access, correct, or request deletion of your personal data at any time.',
      },
      {
        heading: 'Voluntary Participation',
        text: 'Participation in sport psychology services is entirely voluntary. You may withdraw consent at any time without penalty or explanation. Withdrawal of consent will not affect your selection or participation in sport.',
      },
      {
        heading: 'Limits of Service',
        text: 'Sport psychology is not a substitute for medical or psychiatric treatment. If clinical issues arise beyond the scope of sport psychology, referral to appropriate services will be recommended.',
      },
    ],
  },
  parental_release: {
    title: 'Parental / Guardian Consent and Release Form',
    sections: [
      {
        heading: 'Consent for Minor Athlete',
        text: 'As parent or legal guardian, I consent to my child receiving sport psychology services including assessment, performance consultation, and mental skills support. I understand the nature of these services as described in the Consent and Confidentiality Agreement.',
      },
      {
        heading: 'Confidentiality for Minors',
        text: 'While parents/guardians have a general right to know about services provided, the sport psychologist may, in the interests of building a therapeutic relationship, keep certain session content confidential. The practitioner will discuss with you what information will and will not be shared routinely.',
      },
      {
        heading: 'Emergency Authority',
        text: 'In the event of psychological emergency, I authorise the practitioner to contact appropriate emergency services or mental health professionals. I will be notified as soon as practicable.',
      },
      {
        heading: 'Communication',
        text: 'I consent to the practitioner communicating with coaches, medical staff, and other relevant personnel regarding general wellbeing and performance-related information, where appropriate and in the best interests of my child.',
      },
    ],
  },
  photo_media: {
    title: 'Photo and Media Release',
    sections: [
      {
        heading: 'Permission',
        text: 'I grant permission for photographs, video recordings, and other media of myself or my child to be used for educational, research, or promotional purposes by WinMindPerform.',
      },
      {
        heading: 'Usage',
        text: 'Media may be used in presentations, publications, websites, or social media in the context of sport psychology education and promotion. No personally identifying information will be shared without additional consent.',
      },
    ],
  },
  emergency_medical: {
    title: 'Emergency Medical Treatment Authority',
    sections: [
      {
        heading: 'Authority',
        text: 'I authorise the attending sport psychologist or team medical staff to seek emergency medical treatment, including hospitalisation and surgery, in the event that I cannot be contacted or it is not possible to wait for consent without endangering the athlete\'s life or health.',
      },
      {
        heading: 'Medical Information',
        text: 'I consent to sharing relevant medical history with treating medical staff in the case of emergency, for the purpose of providing appropriate care.',
      },
    ],
  },
}

// ── Supabase hooks ────────────────────────────────────────────────────────────

function useConsentForms(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<ConsentForm[]>({
    queryKey: ['consent_forms', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => (await listConsents(athleteId)) as ConsentForm[],
  })
}

function useCreateConsentForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => {
      return createConsent({
        athleteId: payload.athlete_id ?? payload.athleteId,
        formType: payload.form_type ?? payload.formType,
        status: payload.status,
        signedBy: payload.signed_by ?? payload.signedBy,
        signedAt: payload.signed_at ?? payload.signedAt,
        validUntil: payload.valid_until ?? payload.validUntil,
        notes: payload.notes,
        digitalSignature:
          payload.digital_signature ??
          payload.digitalSignature ??
          payload.signed_by ??
          payload.signedBy,
        guardianName: payload.guardian_name ?? payload.guardianName,
        guardianRelationship: payload.guardian_relationship ?? payload.guardianRelationship,
        guardianEmail: payload.guardian_email ?? payload.guardianEmail,
        guardianPhone: payload.guardian_phone ?? payload.guardianPhone,
        formData: payload.form_data ?? payload.formData,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent_forms'] }),
  })
}

function useDeleteConsentForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteConsent(id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent_forms'] }),
  })
}

// ── Online form filler ────────────────────────────────────────────────────────

function OnlineFormModal({
  open, onClose, athletes, formTypeDef, onSave
}: {
  open: boolean
  onClose: () => void
  athletes: any[]
  formTypeDef: typeof FORM_TYPES[0]
  onSave: (athleteId: string, data: any) => Promise<void>
}) {
  const template = CONSENT_TEXT[formTypeDef.type]
  const isParental = formTypeDef.type === 'parental_release'

  // Step 0 — athlete selection (always shown first)
  const [pickedAthleteId, setPickedAthleteId] = useState('')
  const athlete = athletes.find(a => a.id === pickedAthleteId) ?? null
  const isMinor = athlete?.date_of_birth
    ? Math.floor((Date.now() - new Date(athlete.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) < 18
    : false

  const [step, setStep] = useState<'select' | 'read' | 'sign'>('select')
  const [agreed, setAgreed] = useState(false)
  const [signedBy, setSignedBy] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianRel, setGuardianRel] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [validMonths, setValidMonths] = useState('12')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function handleClose() {
    setPickedAthleteId('')
    setStep('select')
    setAgreed(false)
    setSignedBy('')
    setGuardianName('')
    setGuardianRel('')
    setGuardianEmail('')
    setGuardianPhone('')
    setSubmitError('')
    onClose()
  }

  async function handleSubmit() {
    if (!agreed || !signedBy || !pickedAthleteId) return
    setSaving(true)
    setSubmitError('')
    try {
      const validUntil = new Date()
      validUntil.setMonth(validUntil.getMonth() + parseInt(validMonths))
      await onSave(pickedAthleteId, {
        form_type: formTypeDef.type,
        status: 'signed',
        signed_by: signedBy,
        signed_at: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
        guardian_name: guardianName || undefined,
        guardian_relationship: guardianRel || undefined,
        guardian_email: guardianEmail || undefined,
        guardian_phone: guardianPhone || undefined,
        form_data: { agreed: true, sections_acknowledged: template.sections.length },
      })
      handleClose()
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Failed to save consent form.')
    } finally { setSaving(false) }
  }

  // Step indicator
  const stepLabels = ['Select Athlete', 'Read Form', 'Sign']
  const stepIndex = step === 'select' ? 0 : step === 'read' ? 1 : 2

  return (
    <Modal open={open} onClose={handleClose} title={formTypeDef.label} maxWidth="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              i < stepIndex ? 'bg-green-500 text-white' :
              i === stepIndex ? 'bg-blue-500 text-white' :
              'bg-gray-100 text-gray-400'
            }`}>
              {i < stepIndex ? <Check size={12} /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${i === stepIndex ? 'text-gray-900' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < stepLabels.length - 1 && (
              <div className={`flex-1 h-px w-6 ${i < stepIndex ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Select Athlete ── */}
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Select the athlete this <strong>{formTypeDef.label}</strong> is for, then review and complete the form.
          </p>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Select Athlete *</label>
            <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {athletes.map(a => {
                const age = a.date_of_birth
                  ? Math.floor((Date.now() - new Date(a.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                  : null
                const minor = age !== null && age < 18
                const selected = pickedAthleteId === a.id
                return (
                  <button
                    key={a.id}
                    onClick={() => setPickedAthleteId(a.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all w-full ${
                      selected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                    }`}
                  >
                    <Avatar firstName={a.first_name} lastName={a.last_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {a.first_name} {a.last_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {a.sport}{a.team ? ` · ${a.team}` : ''}{age ? ` · Age ${age}` : ''}
                        {minor && <span className="text-amber-600 ml-1">· Minor</span>}
                      </p>
                    </div>
                    {selected && <Check size={16} className="text-blue-500 shrink-0" />}
                  </button>
                )
              })}
            </div>
            {athletes.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                No athletes found. Add athletes first from the Athletes page.
              </p>
            )}
          </div>

          {pickedAthleteId && isMinor && formTypeDef.type !== 'parental_release' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                This athlete is under 18. A <strong>Parental / Guardian Release</strong> form is also required.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => setStep('read')} disabled={!pickedAthleteId}>
              Next: Read Form →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Read Form ── */}
      {step === 'read' && (
        <div className="space-y-4">
          {/* Selected athlete banner */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
            <Avatar firstName={athlete?.first_name} lastName={athlete?.last_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900">
                {athlete?.first_name} {athlete?.last_name}
              </p>
              <p className="text-xs text-gray-500">
                {athlete?.sport}{isMinor ? ' · Under 18' : ''}
              </p>
            </div>
            {isMinor && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">
                Minor — parental consent required
              </span>
            )}
            <button
              onClick={() => setStep('select')}
              className="text-xs text-blue-500 hover:text-blue-700 underline shrink-0"
            >
              Change
            </button>
          </div>

          <p className="text-sm font-semibold text-gray-800">{template.title}</p>

          {/* Form sections */}
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {template.sections.map((sec, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4">
                <p className="font-semibold text-sm text-gray-900 mb-1.5">{i + 1}. {sec.heading}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{sec.text}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded"
              id="agree-check"
            />
            <label htmlFor="agree-check" className="text-sm text-gray-700 leading-relaxed cursor-pointer">
              I have read and understood all sections of this {formTypeDef.label} and agree to the terms.
            </label>
          </div>

          <div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setStep('select')}>← Back</Button>
            <Button onClick={() => setStep('sign')} disabled={!agreed}>
              Proceed to Sign →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Sign ── */}
      {step === 'sign' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
            ✓ All {template.sections.length} sections acknowledged for{' '}
            <strong>{athlete?.first_name} {athlete?.last_name}</strong>. Complete signature details below.
          </p>

          <Input
            label={isParental ? "Athlete's Full Name (print)" : 'Full Name (print)'}
            value={signedBy}
            onChange={e => setSignedBy((e.target as HTMLInputElement).value)}
            placeholder={athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Full name'}
            required
          />

          {(isParental || formTypeDef.type === 'parental_release') && (
            <div className="border border-purple-100 rounded-xl p-4 space-y-3 bg-purple-50">
              <p className="text-xs font-semibold text-purple-700">Parent / Guardian Details</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Guardian Full Name" value={guardianName}
                  onChange={e => setGuardianName((e.target as HTMLInputElement).value)} />
                <Input label="Relationship to Athlete" value={guardianRel}
                  onChange={e => setGuardianRel((e.target as HTMLInputElement).value)}
                  placeholder="e.g. Mother, Father" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Guardian Email" type="email" value={guardianEmail}
                  onChange={e => setGuardianEmail((e.target as HTMLInputElement).value)} />
                <Input label="Guardian Phone" value={guardianPhone}
                  onChange={e => setGuardianPhone((e.target as HTMLInputElement).value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Date Signed</label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-50">
                {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <Select
              label="Valid for"
              value={validMonths}
              onChange={e => setValidMonths((e.target as HTMLSelectElement).value)}
              options={[
                { value: '6',  label: '6 months' },
                { value: '12', label: '12 months (recommended)' },
                { value: '24', label: '24 months' },
                { value: '36', label: '3 years' },
              ]}
            />
          </div>

          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            By clicking "Submit & Sign", you confirm the above details are accurate and consent was obtained with the individual's full understanding.
          </p>

          {submitError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setStep('read')}>Back</Button>
            <Button onClick={handleSubmit} loading={saving} disabled={!signedBy}>
              <Check size={16} /> Submit & Sign
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Upload offline form ───────────────────────────────────────────────────────

function UploadFormModal({
  open, onClose, athletes, onSave
}: {
  open: boolean
  onClose: () => void
  athletes: any[]
  onSave: (data: any) => Promise<void>
}) {
  const [pickedAthleteId, setPickedAthleteId] = useState('')
  const [formType, setFormType] = useState<FormType>('consent_confidentiality')
  const [signedBy, setSignedBy] = useState('')
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function handleClose() {
    setPickedAthleteId('')
    setFormType('consent_confidentiality')
    setSignedBy('')
    setSignedAt(new Date().toISOString().slice(0, 10))
    setNotes('')
    setSaveError('')
    onClose()
  }

  async function handleSave() {
    if (!pickedAthleteId || !signedBy) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave({
        athlete_id: pickedAthleteId,
        form_type: formType,
        status: 'uploaded',
        signed_by: signedBy,
        signed_at: new Date(signedAt).toISOString(),
        notes: notes || 'Offline form uploaded by practitioner',
      })
      handleClose()
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save uploaded form record.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Upload Offline / Signed Form" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2">
          <Upload size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            Use this when a consent form was signed on paper. Log it here to keep a complete digital record.
          </p>
        </div>

        {/* Athlete selector */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Select Athlete *</label>
          <select
            value={pickedAthleteId}
            onChange={e => setPickedAthleteId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— Select athlete —</option>
            {athletes.map(a => (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name}{a.sport ? ` · ${a.sport}` : ''}
              </option>
            ))}
          </select>
        </div>

        <Select
          label="Form Type"
          value={formType}
          onChange={e => setFormType((e.target as HTMLSelectElement).value as FormType)}
          options={FORM_TYPES.map(f => ({ value: f.type, label: f.label }))}
        />

        <Input label="Signed By (full name)" value={signedBy}
          onChange={e => setSignedBy((e.target as HTMLInputElement).value)} required />

        <Input label="Date Signed" type="date" value={signedAt}
          onChange={e => setSignedAt((e.target as HTMLInputElement).value)} />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Reference number, where original is stored, etc."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <p className="text-xs text-gray-400">
          Store the original physical document securely. This record serves as a log that the form was obtained.
        </p>

        {saveError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!pickedAthleteId || !signedBy}>
            <Check size={16} /> Log Form
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function statusBadge(status: FormStatus, validUntil?: string) {
  if (status === 'signed' && validUntil) {
    const expired = new Date(validUntil) < new Date()
    if (expired) return { label: 'Expired', cls: 'bg-red-100 text-red-700' }
    const daysLeft = Math.floor((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft < 30) return { label: `Expires in ${daysLeft}d`, cls: 'bg-amber-100 text-amber-700' }
  }
  const map: Record<FormStatus, { label: string; cls: string }> = {
    pending:  { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
    signed:   { label: 'Signed', cls: 'bg-green-100 text-green-700' },
    expired:  { label: 'Expired', cls: 'bg-red-100 text-red-700' },
    uploaded: { label: 'Uploaded (offline)', cls: 'bg-blue-100 text-blue-700' },
  }
  return map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
}

// ── Print a consent form ──────────────────────────────────────────────────────

function printConsentForm(formType: FormType, athleteName: string, signedBy: string, signedAt?: string) {
  const template = CONSENT_TEXT[formType]
  const win = window.open('', '_blank')
  if (!win) return
  const sectionsHtml = template.sections.map(s => `
    <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px">
      <strong>${s.heading}</strong>
      <p style="margin:8px 0 0;color:#374151;line-height:1.6">${s.text}</p>
    </div>
  `).join('')

  win.document.write(`<html><head><title>${template.title}</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#111}
    h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;color:#6b7280;font-weight:normal}
    .sig{margin-top:40px;padding-top:20px;border-top:2px solid #e5e7eb}
    </style></head><body>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb">
      <div>
        <p style="margin:0;font-size:20px;font-weight:700"><span style="color:#1A2D4A">WIN</span><span style="color:#2D7DD2">MIND</span><span style="color:#1A2D4A">PERFORM</span></p>
        <p style="margin:0;font-size:10px;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase">Sport Psychology Practitioner Suite</p>
      </div>
    </div>
    <h1>${template.title}</h1>
    <h2>Athlete: ${athleteName}</h2>
    <div style="margin:20px 0">${sectionsHtml}</div>
    <div class="sig">
      <table style="width:100%"><tr>
        <td><strong>Signed by:</strong> ${signedBy}<br><strong>Date:</strong> ${signedAt ? new Date(signedAt).toLocaleDateString() : new Date().toLocaleDateString()}</td>
        <td style="text-align:right"><div style="border-bottom:1px solid #111;width:200px;margin-left:auto;padding-top:30px">Signature</div></td>
      </tr></table>
      <p style="margin-top:24px;font-size:11px;color:#9ca3af">SPPS — WinMindPerform · Confidential Document · DPDP Act 2023 Compliant</p>
    </div>
    </body></html>`)
  win.document.close()
  win.print()
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsentFormsPage() {
  const { user } = useAuth()
  const { data: athletes = [] } = useAthletes()
  const { data: forms = [], isLoading } = useConsentForms()
  const createForm = useCreateConsentForm()
  const deleteForm = useDeleteConsentForm()

  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [filterType, setFilterType] = useState<FormType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<FormStatus | 'all'>('all')
  const [onlineModalOpen, setOnlineModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedFormType, setSelectedFormType] = useState<typeof FORM_TYPES[0]>(FORM_TYPES[0])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteForm.mutateAsync(deleteTarget)
      setDeleteTarget(null)
    } catch (err: any) {
      setDeleteError('Delete failed: ' + (err?.message ?? 'unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const filtered = forms.filter(f => {
    const byAthlete = !selectedAthleteId || f.athlete_id === selectedAthleteId
    const byType = filterType === 'all' || f.form_type === filterType
    const byStat = filterStatus === 'all' || f.status === filterStatus
    return byAthlete && byType && byStat
  })

  // Check coverage per athlete
  const coverageByAthlete = athletes.map(a => {
    const athleteForms = forms.filter(f => f.athlete_id === a.id && f.status !== 'expired')
    const hasConsent = athleteForms.some(f => f.form_type === 'consent_confidentiality')
    const isMinor = a.date_of_birth
      ? Math.floor((Date.now() - new Date(a.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) < 18
      : false
    const hasParental = !isMinor || athleteForms.some(f => f.form_type === 'parental_release')
    return { athlete: a, hasConsent, hasParental, isMinor, complete: hasConsent && hasParental }
  })
  const missing = coverageByAthlete.filter(c => !c.complete)

  async function handleOnlineSave(athleteId: string, data: any) {
    await createForm.mutateAsync({ athlete_id: athleteId, ...data })
  }

  const selectedAthlete = athletes.find(a => a.id === selectedAthleteId)

  return (
    <AppShell>
      <PageHeader
        title="Consent & Release Forms"
        subtitle={`${forms.filter(f => f.status === 'signed' || f.status === 'uploaded').length} active forms`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setUploadModalOpen(true)}>
              <Upload size={15} /> Upload Offline Form
            </Button>
          </div>
        }
      />

      {/* Alert: missing consent */}
      {missing.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm font-semibold text-red-800">
              {missing.length} athlete{missing.length > 1 ? 's' : ''} missing required consent
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {missing.map(m => (
              <span key={m.athlete.id} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                {m.athlete.first_name} {m.athlete.last_name}
                {!m.hasConsent ? ' (consent)' : ''}
                {!m.hasParental ? ' (parental)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Form type quick-add buttons */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {FORM_TYPES.map(ft => {
          const Icon = ft.icon
          return (
            <Card key={ft.type} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ft.color}`}>
                  {ft.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">{ft.description}</p>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  setSelectedFormType(ft)
                  setOnlineModalOpen(true)
                }}
              >
                <Plus size={13} /> Fill Online
              </Button>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={selectedAthleteId} onChange={e => setSelectedAthleteId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="">All athletes</option>
          {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="all">All form types</option>
          {FORM_TYPES.map(f => <option key={f.type} value={f.type}>{f.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="all">All statuses</option>
          <option value="signed">Signed</option>
          <option value="uploaded">Uploaded</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title="No consent forms yet"
          description="Add consent forms above or upload offline forms"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(f => {
            const athlete = athletes.find(a => a.id === f.athlete_id)
            const ft = FORM_TYPES.find(t => t.type === f.form_type)
            const { label: statusLabel, cls: statusCls } = statusBadge(f.status, f.valid_until)
            const expanded = expandedId === f.id
            const Icon = ft?.icon ?? FileText

            return (
              <Card key={f.id} className="p-4">
                <div className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : f.id)}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ft?.color ?? 'bg-gray-100'}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Unknown'} — {ft?.label ?? f.form_type}
                    </p>
                    <p className="text-xs text-gray-400">
                      Signed by: {f.signed_by}
                      {f.signed_at ? ` · ${fmtDate(f.signed_at)}` : ''}
                      {f.valid_until ? ` · Valid until ${fmtDate(f.valid_until)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge label={statusLabel} className={statusCls} />
                    <button
                      onClick={e => { e.stopPropagation(); printConsentForm(f.form_type, athlete ? `${athlete.first_name} ${athlete.last_name}` : '', f.signed_by, f.signed_at) }}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors"
                      title="Print"
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(f.id) }}
                      className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid sm:grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-500">Form Type:</span> <span className="text-gray-800 font-medium">{ft?.label}</span></div>
                    <div><span className="text-gray-500">Status:</span> <span className="text-gray-800 font-medium">{statusLabel}</span></div>
                    <div><span className="text-gray-500">Signed by:</span> <span className="text-gray-800">{f.signed_by}</span></div>
                    {f.guardian_name && <div><span className="text-gray-500">Guardian:</span> <span className="text-gray-800">{f.guardian_name} ({f.guardian_relationship})</span></div>}
                    {f.signed_at && <div><span className="text-gray-500">Signed:</span> <span className="text-gray-800">{fmtDate(f.signed_at)}</span></div>}
                    {f.valid_until && <div><span className="text-gray-500">Expires:</span> <span className="text-gray-800">{fmtDate(f.valid_until)}</span></div>}
                    {f.notes && <div className="sm:col-span-2"><span className="text-gray-500">Notes:</span> <span className="text-gray-800">{f.notes}</span></div>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Online form modal */}
      {onlineModalOpen && (
        <OnlineFormModal
          open={onlineModalOpen}
          onClose={() => setOnlineModalOpen(false)}
          athletes={athletes}
          formTypeDef={selectedFormType}
          onSave={async (athleteId, data) => {
            await handleOnlineSave(athleteId, data)
          }}
        />
      )}

      {/* Upload offline modal */}
      <UploadFormModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        athletes={athletes}
        onSave={async (data) => {
          await createForm.mutateAsync(data)
        }}
      />

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError('') }} title="Delete Form Record" maxWidth="max-w-sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this consent form record? This cannot be undone.</p>
        {deleteError && <p className="text-xs text-red-600 mb-3 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Cancel</Button>
          <Button
            onClick={handleDelete}
            loading={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </Modal>
    </AppShell>
  )
}


