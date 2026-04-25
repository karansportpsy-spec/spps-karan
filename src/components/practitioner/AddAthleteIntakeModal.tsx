import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ClipboardList, Loader2, Plus, CheckCircle2, X } from 'lucide-react'

import { usePractitionerData } from '@/contexts/PractitionerContext'
import { createAthleteFromIntake } from '@/services/athleteOnboardingApi'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (result: {
    athleteId: string
    portalInviteStatus?: string | null
    portalInviteDetail?: string | null
  }) => void
}

const CONCERN_ITEMS = [
  'Competition anxiety',
  'Difficulty with training demands / overtraining',
  'Difficulty with elite athlete lifestyle demands',
  'Issues within team / with teammates',
  'Communication difficulties',
  'Motivation for sport / training',
  'Performance slump',
  'Media exposure',
  'Difficulty with travel demands',
  'Concentration training',
  'Goal setting training',
  'Imagery / Visualization training',
  'Relaxation training',
  'Retirement from sport',
  'Sport confidence',
  'Schoolwork / grades',
  'Procrastination / time management',
  'Stress management',
  'Decisions about major / career',
  'Concern for welfare of another person',
  'Relationship with teammate(s)',
  'Relationship with roommate(s)',
  'Relationship with coach(es)',
  'Relationship with romantic partner',
  'Relationship with parents / family',
  'Sexuality concerns',
  'Shyness / being assertive',
  'Self-esteem / self-confidence',
  'Loneliness / homesickness',
  'Feeling down / sadness / depression',
  'Fears / worries / anxiety',
  'Irritability / anger',
  'Injury or fear of injury',
  'Chronic physical problems',
  'Physical stress',
  'Sleep difficulties',
  'Eating / body image / weight concerns',
  'Substance use (alcohol, drugs)',
  'Suicidal feelings or behaviour',
] as const

const SEVERITY_ITEMS = [
  'Feelings of sadness / crying / being down',
  'My mind feels like it is racing',
  'Unwanted thoughts in my mind',
  "Sometimes I can't control what I do",
  'Sleep problems',
  'Feeling worthless',
  'Problems with anger / temper',
  "Feeling like things aren't real",
  'Problems with my eating',
  'Things too painful to talk about',
  'Concerns about my sexuality',
  'Use of alcohol and/or drugs',
  'Doing things over and over',
  "Seeing or hearing things others don't",
  'Feeling anxious / nervous',
  'Difficulty being close to people',
  'Spiritual concerns',
  'Pain / health concerns',
] as const

const REFERRAL_OPTIONS = [
  'Myself',
  'Family/Spouse',
  'Trainer',
  'Friend',
  'Saw/Heard About It',
  'Website',
  'Teammate',
  'Coach',
  'Other',
] as const

function blankRatings<T extends readonly string[]>(items: T, initial: number) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = initial
    return acc
  }, {})
}

export default function AddAthleteIntakeModal({ open, onClose, onCreated }: Props) {
  const { refresh } = usePractitionerData()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    sport: '',
    team: '',
    position: '',
    experience: '',
    streetAddress: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    referralSource: '',
    referralMayThank: true,
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
    intakeSignedBy: '',
    sendPortalInvite: false,
  })
  const [concernRatings, setConcernRatings] = useState<Record<string, number>>(() => blankRatings(CONCERN_ITEMS, 0))
  const [severityRatings, setSeverityRatings] = useState<Record<string, number>>(() => blankRatings(SEVERITY_ITEMS, 1))

  const createMutation = useMutation({
    mutationFn: async () => createAthleteFromIntake({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      dateOfBirth: form.dateOfBirth,
      sport: form.sport,
      team: form.team,
      position: form.position,
      experience: form.experience,
      streetAddress: form.streetAddress,
      city: form.city,
      stateProvince: form.stateProvince,
      postalCode: form.postalCode,
      referral: {
        source: form.referralSource,
        mayThankReferrer: form.referralMayThank,
        name: form.referralName,
        phone: form.referralPhone,
      },
      familyRelationships: form.familyRelationships,
      sportPsychologyHistory: {
        priorPreparation: form.priorPreparation,
        priorWorkWithPsychologist: form.priorWorkWithPsychologist,
        details: form.priorWorkDetails,
      },
      sportBackground: form.sportBackground,
      presentingConcerns: form.presentingConcerns,
      concernRatings,
      severityRatings,
      additionalConcerns: form.additionalConcerns,
      injuryHistory: form.injuryHistory,
      medicationsAndTreatment: form.medicationsAndTreatment,
      mentalHealthHospitalization: form.mentalHealthHospitalization,
      intakeSignedBy: form.intakeSignedBy || `${form.firstName} ${form.lastName}`.trim(),
      sendPortalInvite: Boolean(form.email.trim()) && form.sendPortalInvite,
    }),
    onSuccess: async (result) => {
      await refresh()
      if (result?.athlete?.id) {
        onCreated?.({
          athleteId: result.athlete.id,
          portalInviteStatus: result.portalInviteStatus ?? null,
          portalInviteDetail: result.portalInviteDetail ?? null,
        })
      }
      handleClose()
    },
  })

  const isReady = useMemo(
    () => Boolean(
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.sport.trim() &&
      (!form.sendPortalInvite || form.email.trim())
    ),
    [form.email, form.firstName, form.lastName, form.sendPortalInvite, form.sport]
  )

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleClose() {
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      sport: '',
      team: '',
      position: '',
      experience: '',
      streetAddress: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      referralSource: '',
      referralMayThank: true,
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
      intakeSignedBy: '',
      sendPortalInvite: false,
    })
    setConcernRatings(blankRatings(CONCERN_ITEMS, 0))
    setSeverityRatings(blankRatings(SEVERITY_ITEMS, 1))
    createMutation.reset()
    onClose()
  }

  function updateConcern(item: string, value: number) {
    setConcernRatings(prev => ({ ...prev, [item]: value }))
  }

  function updateSeverity(item: string, value: number) {
    setSeverityRatings(prev => ({ ...prev, [item]: value }))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose()
      }}
    >
      <div className="relative w-full max-w-5xl rounded-3xl bg-white shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close add athlete modal"
        >
          <X size={16} />
        </button>

        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100">
              <ClipboardList size={20} className="text-blue-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Add athlete with AASP intake</h3>
              <p className="mt-1 text-sm text-gray-600">
                This follows the uploaded intake packet: personal information, referral source,
                sport psychology history, presenting concerns, severity ratings, and health information.
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[78vh] space-y-6 overflow-y-auto px-6 py-6">
          {createMutation.isSuccess && (
            <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 size={16} className="text-green-600" />
              Athlete added successfully.
            </div>
          )}

          {createMutation.isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(createMutation.error as Error)?.message ?? 'Failed to add athlete.'}
            </div>
          )}

          {form.sendPortalInvite && !form.email.trim() && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Enter the athlete email that should receive the portal invite before saving.
            </div>
          )}

          <section className="space-y-4">
            <SectionTitle title="A. Personal Information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name *">
                <input value={form.firstName} onChange={e => setField('firstName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Last name *">
                <input value={form.lastName} onChange={e => setField('lastName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Sport *">
                <input value={form.sport} onChange={e => setField('sport', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Experience">
                <input value={form.experience} onChange={e => setField('experience', e.target.value)} placeholder="Years / level / notable background" className={inputCls} />
              </Field>
              <Field label="Date of birth">
                <input type="date" value={form.dateOfBirth} onChange={e => setField('dateOfBirth', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone number">
                <input value={form.phone} onChange={e => setField('phone', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Email address">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="Used for athlete portal login and practitioner communication"
                  className={inputCls}
                />
              </Field>
              <Field label="Team / organization">
                <input value={form.team} onChange={e => setField('team', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Position / event">
                <input value={form.position} onChange={e => setField('position', e.target.value)} className={inputCls} />
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
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Referral Information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Who referred you?">
                <select value={form.referralSource} onChange={e => setField('referralSource', e.target.value)} className={inputCls}>
                  <option value="">Select referral source</option>
                  {REFERRAL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="May I thank the person who referred you?">
                <select value={form.referralMayThank ? 'yes' : 'no'} onChange={e => setField('referralMayThank', e.target.value === 'yes')} className={inputCls}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Referrer name">
                <input value={form.referralName} onChange={e => setField('referralName', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Referrer phone">
                <input value={form.referralPhone} onChange={e => setField('referralPhone', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Family & primary relationships" className="md:col-span-2">
                <textarea
                  value={form.familyRelationships}
                  onChange={e => setField('familyRelationships', e.target.value)}
                  rows={4}
                  placeholder="Names, ages, relationships, and how those relationships are going."
                  className={textareaCls}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Sport Psychology History" />
            <div className="grid gap-4 md:grid-cols-2">
              <ToggleField
                label="Included sport psychology in preparation before?"
                checked={form.priorPreparation}
                onChange={checked => setField('priorPreparation', checked)}
              />
              <ToggleField
                label="Worked with a sport psychologist / psychologist before?"
                checked={form.priorWorkWithPsychologist}
                onChange={checked => setField('priorWorkWithPsychologist', checked)}
              />
              <Field label="If yes, please explain" className="md:col-span-2">
                <textarea value={form.priorWorkDetails} onChange={e => setField('priorWorkDetails', e.target.value)} rows={3} className={textareaCls} />
              </Field>
              <Field label="Sport background / experience" className="md:col-span-2">
                <textarea
                  value={form.sportBackground}
                  onChange={e => setField('sportBackground', e.target.value)}
                  rows={4}
                  placeholder="Training history, competitive level, achievements, and relevant details."
                  className={textareaCls}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="B. Presenting Concerns" />
            <Field label="Why are you seeking sport psychology support?">
              <textarea value={form.presentingConcerns} onChange={e => setField('presentingConcerns', e.target.value)} rows={4} className={textareaCls} />
            </Field>
            <RatingsGrid
              title="Concern / issue ratings (0 = N/A, 1 = Low, 2 = High, 3 = Very High)"
              items={CONCERN_ITEMS}
              min={0}
              max={3}
              values={concernRatings}
              onChange={updateConcern}
            />
            <RatingsGrid
              title="Current concern severity (1 = Not a concern, 5 = Serious concern)"
              items={SEVERITY_ITEMS}
              min={1}
              max={5}
              values={severityRatings}
              onChange={updateSeverity}
            />
            <Field label="Additional concerns or areas of interest">
              <textarea value={form.additionalConcerns} onChange={e => setField('additionalConcerns', e.target.value)} rows={3} className={textareaCls} />
            </Field>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Health & Medical Information" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Injury history" className="md:col-span-2">
                <textarea value={form.injuryHistory} onChange={e => setField('injuryHistory', e.target.value)} rows={3} className={textareaCls} />
              </Field>
              <Field label="Medications / treatment" className="md:col-span-2">
                <textarea value={form.medicationsAndTreatment} onChange={e => setField('medicationsAndTreatment', e.target.value)} rows={3} className={textareaCls} />
              </Field>
              <Field label="Mental health hospitalization details" className="md:col-span-2">
                <textarea value={form.mentalHealthHospitalization} onChange={e => setField('mentalHealthHospitalization', e.target.value)} rows={3} className={textareaCls} />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle title="Portal & Signature" />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Athlete portal email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="same email the athlete will use to sign in and communicate"
                  className={inputCls}
                />
              </Field>
              <Field label="Signed by">
                <input
                  value={form.intakeSignedBy}
                  onChange={e => setField('intakeSignedBy', e.target.value)}
                  placeholder="Athlete name or athlete + guardian"
                  className={inputCls}
                />
              </Field>
              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.sendPortalInvite}
                  onChange={e => setField('sendPortalInvite', e.target.checked)}
                  disabled={!form.email.trim()}
                  className="mt-1"
                />
                <span>
                  Send athlete portal invite after save
                  <span className="mt-1 block text-xs text-gray-500">
                    Requires a valid athlete email. After they accept the invite, they’ll be prompted to complete confidentiality, consultation, parental release if needed, and media release in their own portal.
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-gray-500">
            The intake packet is saved for practitioner review, and linked athletes will be prompted to sign their required forms in the athlete portal.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!isReady || createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {createMutation.isPending ? 'Saving intake…' : 'Add athlete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <h4 className="text-sm font-bold uppercase tracking-wide text-gray-900">{title}</h4>
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

function RatingsGrid({
  title,
  items,
  min,
  max,
  values,
  onChange,
}: {
  title: string
  items: readonly string[]
  min: number
  max: number
  values: Record<string, number>
  onChange: (item: string, value: number) => void
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index)

  return (
    <div className="rounded-2xl border border-gray-200">
      <div className="border-b border-gray-100 px-4 py-3">
        <h5 className="text-sm font-semibold text-gray-900">{title}</h5>
      </div>
      <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
        {items.map(item => (
          <label key={item} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-700">{item}</span>
            <select
              value={values[item]}
              onChange={e => onChange(item, Number(e.target.value))}
              className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
            >
              {options.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const textareaCls = `${inputCls} min-h-[96px]`
