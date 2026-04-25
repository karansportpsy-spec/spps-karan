import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, FileSignature, Loader2 } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import {
  getAthleteOnboardingStatus,
  submitAthleteOnboarding,
  type AthleteOnboardingStatus,
} from '@/services/athleteOnboardingApi'

interface Props {
  hasActivePractitioners: boolean
}

const CONCERN_ITEMS = [
  'Competition anxiety',
  'Motivation for sport / training',
  'Performance slump',
  'Concentration training',
  'Goal setting training',
  'Stress management',
  'Relationship with coach(es)',
  'Relationship with parents / family',
  'Feeling down / sadness / depression',
  'Fears / worries / anxiety',
  'Injury or fear of injury',
  'Sleep difficulties',
] as const

function blankConcernRatings() {
  return CONCERN_ITEMS.reduce<Record<string, number>>((acc, item) => {
    acc[item] = 0
    return acc
  }, {})
}

export default function AthleteOnboardingModal({ hasActivePractitioners }: Props) {
  const { athlete } = useAuth()
  const [form, setForm] = useState({
    experience: '',
    streetAddress: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    referralSource: '',
    referralName: '',
    referralPhone: '',
    familyRelationships: '',
    priorPreparation: false,
    priorWorkWithPsychologist: false,
    priorWorkDetails: '',
    sportBackground: '',
    presentingConcerns: '',
    additionalConcerns: '',
    injuryHistory: '',
    medicationsAndTreatment: '',
    mentalHealthHospitalization: '',
    signedBy: '',
    guardianName: '',
    guardianRelationship: '',
    guardianEmail: '',
    guardianPhone: '',
    confidentialityAccepted: true,
    consultationAccepted: true,
    mediaReleaseAccepted: true,
  })
  const [concernRatings, setConcernRatings] = useState<Record<string, number>>(blankConcernRatings)

  const statusQuery = useQuery<AthleteOnboardingStatus>({
    queryKey: ['athlete-onboarding-status'],
    enabled: hasActivePractitioners,
    queryFn: getAthleteOnboardingStatus,
    staleTime: 15000,
  })

  const firstPending = useMemo(
    () => statusQuery.data?.practitioners.find(practitioner => !practitioner.complete) ?? null,
    [statusQuery.data]
  )

  const submitMutation = useMutation({
    mutationFn: async () => submitAthleteOnboarding({
      practitionerId: firstPending?.practitionerId,
      signedBy: form.signedBy.trim() || `${athlete?.first_name ?? ''} ${athlete?.last_name ?? ''}`.trim() || 'Athlete',
      guardianName: form.guardianName,
      guardianRelationship: form.guardianRelationship,
      guardianEmail: form.guardianEmail,
      guardianPhone: form.guardianPhone,
      confidentialityAccepted: form.confidentialityAccepted,
      consultationAccepted: form.consultationAccepted,
      mediaReleaseAccepted: form.mediaReleaseAccepted,
      intake: {
        personal_information: {
          experience: form.experience,
          street_address: form.streetAddress,
          city: form.city,
          state_province: form.stateProvince,
          postal_code: form.postalCode,
        },
        referral_information: {
          source: form.referralSource,
          name: form.referralName,
          phone: form.referralPhone,
        },
        family_relationships: form.familyRelationships,
        sport_psychology_history: {
          priorPreparation: form.priorPreparation,
          priorWorkWithPsychologist: form.priorWorkWithPsychologist,
          details: form.priorWorkDetails,
        },
        sport_background: form.sportBackground,
        presenting_concerns: form.presentingConcerns,
        concern_ratings: concernRatings,
        additional_concerns: form.additionalConcerns,
        health_and_medical: {
          injury_history: form.injuryHistory,
          medications_and_treatment: form.medicationsAndTreatment,
          mental_health_hospitalization: form.mentalHealthHospitalization,
        },
      },
    }),
    onSuccess: async () => {
      await statusQuery.refetch()
    },
  })

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateConcern(item: string, value: number) {
    setConcernRatings(prev => ({ ...prev, [item]: value }))
  }

  if (!hasActivePractitioners) return null

  if (statusQuery.isLoading) {
    return (
      <BlockingShell>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 size={24} className="animate-spin text-teal-600" />
          <p className="text-sm text-gray-600">Checking your onboarding requirements…</p>
        </div>
      </BlockingShell>
    )
  }

  if (statusQuery.isError) {
    return (
      <BlockingShell>
        <div className="space-y-3 py-6 text-center">
          <AlertCircle size={24} className="mx-auto text-red-500" />
          <p className="text-sm font-semibold text-gray-900">We couldn’t load your required forms</p>
          <p className="text-xs text-gray-500">
            {(statusQuery.error as Error)?.message ?? 'Please refresh and try again.'}
          </p>
        </div>
      </BlockingShell>
    )
  }

  if (!statusQuery.data?.requiresOnboarding || !firstPending) {
    return null
  }

  if (submitMutation.isSuccess && !statusQuery.data.requiresOnboarding) {
    return null
  }

  return (
    <BlockingShell>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-100">
            <FileSignature size={20} className="text-teal-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Complete your onboarding forms</h3>
            <p className="mt-1 text-sm text-gray-600">
              {firstPending.practitionerName} linked your account. Before you continue in the athlete portal,
              please complete your intake packet and sign the required forms.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Required now: {firstPending.missing.join(', ').replace(/_/g, ' ')}.
        </div>

        {submitMutation.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(submitMutation.error as Error)?.message ?? 'Failed to submit onboarding forms.'}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <Field label="Sport / experience">
            <input value={form.experience} onChange={e => setField('experience', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Referral source">
            <input value={form.referralSource} onChange={e => setField('referralSource', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Street address" className="md:col-span-2">
            <input value={form.streetAddress} onChange={e => setField('streetAddress', e.target.value)} className={inputCls} />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={e => setField('city', e.target.value)} className={inputCls} />
          </Field>
          <Field label="State / province">
            <input value={form.stateProvince} onChange={e => setField('stateProvince', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Zip / postal code">
            <input value={form.postalCode} onChange={e => setField('postalCode', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Referrer name">
            <input value={form.referralName} onChange={e => setField('referralName', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Referrer phone">
            <input value={form.referralPhone} onChange={e => setField('referralPhone', e.target.value)} className={inputCls} />
          </Field>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ToggleField
            label="I have used sport psychology in my preparation before."
            checked={form.priorPreparation}
            onChange={checked => setField('priorPreparation', checked)}
          />
          <ToggleField
            label="I have worked with a sport psychologist / psychologist before."
            checked={form.priorWorkWithPsychologist}
            onChange={checked => setField('priorWorkWithPsychologist', checked)}
          />
          <Field label="If yes, please explain" className="md:col-span-2">
            <textarea value={form.priorWorkDetails} onChange={e => setField('priorWorkDetails', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Family & primary relationships" className="md:col-span-2">
            <textarea value={form.familyRelationships} onChange={e => setField('familyRelationships', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Sport background / experience" className="md:col-span-2">
            <textarea value={form.sportBackground} onChange={e => setField('sportBackground', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Why are you seeking support?" className="md:col-span-2">
            <textarea value={form.presentingConcerns} onChange={e => setField('presentingConcerns', e.target.value)} rows={4} className={textareaCls} />
          </Field>
        </section>

        <section className="rounded-2xl border border-gray-200">
          <div className="border-b border-gray-100 px-4 py-3">
            <h4 className="text-sm font-semibold text-gray-900">AASP concern ratings (0 = N/A, 3 = Very high)</h4>
          </div>
          <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
            {CONCERN_ITEMS.map(item => (
              <label key={item} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{item}</span>
                <select value={concernRatings[item]} onChange={e => updateConcern(item, Number(e.target.value))} className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm">
                  {[0, 1, 2, 3].map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Field label="Additional concerns" className="md:col-span-2">
            <textarea value={form.additionalConcerns} onChange={e => setField('additionalConcerns', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Injury history" className="md:col-span-2">
            <textarea value={form.injuryHistory} onChange={e => setField('injuryHistory', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Medications / treatment" className="md:col-span-2">
            <textarea value={form.medicationsAndTreatment} onChange={e => setField('medicationsAndTreatment', e.target.value)} rows={3} className={textareaCls} />
          </Field>
          <Field label="Mental health hospitalization" className="md:col-span-2">
            <textarea value={form.mentalHealthHospitalization} onChange={e => setField('mentalHealthHospitalization', e.target.value)} rows={3} className={textareaCls} />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border border-gray-200 px-4 py-4">
          <h4 className="text-sm font-semibold text-gray-900">Required acknowledgements</h4>
          <ToggleField
            label="I have read and accept the confidentiality statement."
            checked={form.confidentialityAccepted}
            onChange={checked => setField('confidentialityAccepted', checked)}
          />
          <ToggleField
            label="I willingly consent to sport psychology consultation under my practitioner's stated policies."
            checked={form.consultationAccepted}
            onChange={checked => setField('consultationAccepted', checked)}
          />
          <ToggleField
            label="I agree to the photo / media release."
            checked={form.mediaReleaseAccepted}
            onChange={checked => setField('mediaReleaseAccepted', checked)}
          />

          {statusQuery.data.isMinor && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Parent / guardian name">
                <input value={form.guardianName} onChange={e => setField('guardianName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Relationship">
                <input value={form.guardianRelationship} onChange={e => setField('guardianRelationship', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Guardian email">
                <input type="email" value={form.guardianEmail} onChange={e => setField('guardianEmail', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Guardian phone">
                <input value={form.guardianPhone} onChange={e => setField('guardianPhone', e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}

          <Field label="Signed by">
            <input
              value={form.signedBy}
              onChange={e => setField('signedBy', e.target.value)}
              placeholder={`${athlete?.first_name ?? ''} ${athlete?.last_name ?? ''}`.trim() || 'Full name'}
              className={inputCls}
            />
          </Field>
        </section>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Your practitioner will receive these forms automatically in the practitioner records.
          </p>
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !form.confidentialityAccepted || !form.consultationAccepted || !form.mediaReleaseAccepted}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {submitMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {submitMutation.isPending ? 'Submitting…' : 'Submit onboarding'}
          </button>
        </div>
      </div>
    </BlockingShell>
  )
}

function BlockingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1" />
      <span>{label}</span>
    </label>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'
const textareaCls = `${inputCls} min-h-[96px]`
