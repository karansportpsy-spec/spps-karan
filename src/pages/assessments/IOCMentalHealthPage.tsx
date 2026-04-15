import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Heart, Brain, Moon, Wine, Shield } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Button, Card, Select, Avatar } from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import { useAuth } from '@/contexts/AuthContext'
import { saveAssessmentBundle } from '@/services/assessmentApi'

// ── Question Data ─────────────────────────────────────────────

const MHS_ITEMS = [
  'I have had difficulty concentrating during training or competition',
  'I have felt more irritable or angry than usual',
  'I have had trouble sleeping due to worries about sport or life',
  'I have experienced excessive worry that is hard to control',
  'I have withdrawn from teammates, family, or friends',
  'I have lost enjoyment or motivation for sport or daily activities',
  'I have felt unusually fatigued or lacking in energy',
  'I have had reduced confidence in my athletic abilities',
  'I have felt overwhelmed by the demands of sport or life',
  'I have struggled to cope with stress, pressure, or setbacks',
]
const MHS_OPTIONS = [
  { label: 'Not at all', value: 0 },
  { label: 'A little', value: 1 },
  { label: 'Somewhat', value: 2 },
  { label: 'Quite a bit', value: 3 },
  { label: 'Very much', value: 4 },
]

const DEPSCR_ITEMS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading or watching television',
  'Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless',
  'Thoughts that you would be better off dead, or of hurting yourself in some way',
]
const DEPSCR_OPTIONS = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
]

const GLOBAL_ANXT_ITEMS = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen',
]

const SLP_INDEX_ITEMS = [
  { text: 'How would you rate your sleep quality overall?', options: [{ label: 'Very good', value: 0 }, { label: 'Fairly good', value: 1 }, { label: 'Fairly bad', value: 2 }, { label: 'Very bad', value: 3 }] },
  { text: 'How often have you had trouble falling asleep within 30 minutes?', options: null },
  { text: 'How often have you woken in the middle of the night or early morning?', options: null },
  { text: 'How often have you felt too hot or had trouble breathing during sleep?', options: null },
  { text: 'How often have you taken medicine to help you sleep?', options: null },
  { text: 'How often have you had trouble staying awake during training or daily activities?', options: null },
  { text: 'How much of a problem has it been to keep up enough enthusiasm to get things done?', options: null },
]
const SLP_INDEX_STD = [
  { label: 'Not during the past month', value: 0 },
  { label: 'Less than once a week', value: 1 },
  { label: 'Once or twice a week', value: 2 },
  { label: 'Three or more times a week', value: 3 },
]

const AUDIT_QUESTIONS = [
  { text: 'How often do you have a drink containing alcohol?', options: [{ label: 'Never', value: 0 }, { label: 'Monthly or less', value: 1 }, { label: '2–4 times/month', value: 2 }, { label: '2–3 times/week', value: 3 }, { label: '4+ times/week', value: 4 }] },
  { text: 'How many standard drinks on a typical drinking day?', options: [{ label: '1–2', value: 0 }, { label: '3–4', value: 1 }, { label: '5–6', value: 2 }, { label: '7–9', value: 3 }, { label: '10 or more', value: 4 }] },
  { text: 'How often have you had 6 or more drinks on one occasion?', options: [{ label: 'Never', value: 0 }, { label: 'Less than monthly', value: 1 }, { label: 'Monthly', value: 2 }, { label: 'Weekly', value: 3 }, { label: 'Daily or almost daily', value: 4 }] },
]

// ── Scoring ───────────────────────────────────────────────────

function getRisk(score: number, thresholds: { max: number; level: string; color: string; bg: string }[]) {
  return thresholds.find(t => score <= t.max) ?? thresholds[thresholds.length - 1]
}

const MHS_T = [
  { max: 10, level: 'Low Risk', color: 'text-green-700', bg: 'bg-green-50', action: 'Continue monitoring. No immediate intervention required.' },
  { max: 20, level: 'Moderate Risk', color: 'text-amber-700', bg: 'bg-amber-50', action: 'Clinical review recommended within 2 weeks.' },
  { max: 40, level: 'High Risk', color: 'text-red-700', bg: 'bg-red-50', action: 'Urgent clinical review required. Consider referral.' },
]
const DEPSCR_T = [
  { max: 4, level: 'Minimal', color: 'text-green-700', bg: 'bg-green-50', action: 'Monitor. No active treatment required.' },
  { max: 9, level: 'Mild', color: 'text-teal-700', bg: 'bg-teal-50', action: 'Watchful waiting; repeat DEPSCR at follow-up.' },
  { max: 14, level: 'Moderate', color: 'text-amber-700', bg: 'bg-amber-50', action: 'Treatment plan; consider counselling.' },
  { max: 19, level: 'Moderately Severe', color: 'text-orange-700', bg: 'bg-orange-50', action: 'Active treatment and close follow-up.' },
  { max: 27, level: 'Severe', color: 'text-red-700', bg: 'bg-red-50', action: 'Immediate referral to mental health professional.' },
]
const GLOBAL_ANXT_T = [
  { max: 4, level: 'Minimal', color: 'text-green-700', bg: 'bg-green-50', action: 'Monitor. Reassure.' },
  { max: 9, level: 'Mild', color: 'text-teal-700', bg: 'bg-teal-50', action: 'Watchful waiting; relaxation strategies.' },
  { max: 14, level: 'Moderate', color: 'text-amber-700', bg: 'bg-amber-50', action: 'Consider CBT or anxiety management.' },
  { max: 21, level: 'Severe', color: 'text-red-700', bg: 'bg-red-50', action: 'Referral to mental health professional.' },
]
const SLP_INDEX_T = [
  { max: 5, level: 'Good Sleep', color: 'text-green-700', bg: 'bg-green-50', action: 'Maintain current sleep hygiene practices.' },
  { max: 10, level: 'Poor Sleep', color: 'text-amber-700', bg: 'bg-amber-50', action: 'Sleep hygiene education and behavioural strategies.' },
  { max: 21, level: 'Significant Disturbance', color: 'text-red-700', bg: 'bg-red-50', action: 'Clinical sleep assessment recommended.' },
]
const AUDIT_T = [
  { max: 2, level: 'Low Risk', color: 'text-green-700', bg: 'bg-green-50', action: 'No intervention required.' },
  { max: 5, level: 'Hazardous', color: 'text-amber-700', bg: 'bg-amber-50', action: 'Brief intervention and advice recommended.' },
  { max: 12, level: 'Harmful', color: 'text-red-700', bg: 'bg-red-50', action: 'Brief counselling and monitoring required.' },
]

// ── Steps ─────────────────────────────────────────────────────
const STEPS = [
  { id: 'mhs',    label: 'AMHS',   icon: Shield, desc: 'Mental Health Screening Tool', items: 10 },
  { id: 'depscr', label: 'DEPSCR', icon: Brain,  desc: 'Depression screening', items: 9 },
  { id: 'anxscr', label: 'ANXSCR', icon: Heart,  desc: 'Anxiety screening', items: 7 },
  { id: 'sqi',    label: 'SQI',    icon: Moon,   desc: 'Sleep quality index', items: 7 },
  { id: 'ausc',   label: 'AUSC',   icon: Wine,   desc: 'Alcohol use screening', items: 3 },
]

type StepId = 'mhs' | 'depscr' | 'anxscr' | 'sqi' | 'ausc' | 'results'

function QuestionCard({ num, total, text, options, value, onChange, timeframe }: any) {
  return (
    <div className="mb-6">
      <div className="flex gap-3 mb-3">
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{num}</span>
        <p className="text-sm text-gray-800 leading-relaxed">
          {timeframe && <span className="text-gray-400 italic">{timeframe} </span>}
          {text}
        </p>
      </div>
      <div className={`grid gap-2 pl-10`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((opt: any) => {
          const sel = value === opt.value
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)}
              className={`p-2 rounded-xl border-2 text-center transition-all ${sel ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}>
              <div className={`text-base font-bold mb-0.5 ${sel ? 'text-blue-700' : 'text-gray-700'}`}>{opt.value}</div>
              <div className={`text-xs leading-tight ${sel ? 'text-blue-600' : 'text-gray-400'}`}>{opt.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function IOCMentalHealthPage() {
  const { user } = useAuth()
  const { data: athletes = [] } = useAthletes()

  const [athleteId, setAthleteId] = useState('')
  const [step, setStep] = useState<StepId>('mhs')
  const [mhs, setMhs] = useState<Record<number, number>>({})
  const [depscr, setDepscr] = useState<Record<number, number>>({})
  const [anxscr, setAnxscr] = useState<Record<number, number>>({})
  const [sqi, setSqi] = useState<Record<number, number>>({})
  const [ausc, setAusc] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const selectedAthlete = athletes.find(a => a.id === athleteId)

  function sum(r: Record<number, number>) {
    return Object.values(r).reduce((a, b) => a + b, 0)
  }

  function allAnswered(r: Record<number, number>, count: number) {
    return Object.keys(r).length >= count
  }

  const stepOrder: StepId[] = ['mhs', 'depscr', 'anxscr', 'sqi', 'ausc', 'results']

  function nextStep() {
    const idx = stepOrder.indexOf(step)
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1])
  }
  function prevStep() {
    const idx = stepOrder.indexOf(step)
    if (idx > 0) setStep(stepOrder[idx - 1])
  }

  async function saveResults() {
    if (!user || !athleteId) return
    setSaving(true)
    try {
      const scores = {
        AMHS: sum(mhs), DEPSCR: sum(depscr), ANXSCR: sum(anxscr),
        SQI: sum(sqi), AUSC: sum(ausc),
      }
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
      await saveAssessmentBundle({
        athleteId,
        mentalHealth: {
          tool: 'MentalHealthScreening',
          scores,
          totalScore,
          interpretation: `AMHS ${scores.AMHS}/40 · DEPSCR ${scores.DEPSCR}/27 · ANXSCR ${scores.ANXSCR}/21 · SQI ${scores.SQI}/21 · AUSC ${scores.AUSC}/12`,
          notes: 'Mental health bundle saved from IOC screening flow.',
        },
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const athleteOptions = [
    { value: '', label: '— Select athlete —' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  // Header progress
  const stepIdx = stepOrder.indexOf(step)
  const progress = step === 'results' ? 100 : Math.round((stepIdx / 5) * 100)

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-gray-900">Athlete Mental Health Screening</h1>
            <span className="text-sm text-gray-400">AMHS · DEPSCR · ANXSCR · SQI · AUSC</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          {/* Step tabs */}
          <div className="flex gap-1 mt-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const current = step === s.id
              const done = stepOrder.indexOf(step) > i
              return (
                <button key={s.id} onClick={() => setStep(s.id as StepId)}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-0.5 ${
                    current ? 'bg-blue-600 text-white' : done ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                  <Icon size={14} />
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Athlete selector */}
        {step !== 'results' && (
          <Card className="p-4 mb-4">
            <Select label="Athlete" value={athleteId} onChange={e => setAthleteId(e.target.value)} options={athleteOptions} />
            {!athleteId && <p className="text-xs text-amber-600 mt-1">⚠ Select an athlete before administering</p>}
          </Card>
        )}

        {step === 'mhs' && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={18} className="text-blue-600" />
              <h2 className="font-semibold text-gray-900">AMHS — Athlete Mental Health Screening</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">10 items · Over the past 2 weeks</p>
            {MHS_ITEMS.map((text, i) => (
              <QuestionCard key={i} num={i + 1} total={10} text={text}
                options={MHS_OPTIONS} value={mhs[i]}
                onChange={(v: number) => setMhs(r => ({ ...r, [i]: v }))}
                timeframe="Over the past 2 weeks:" />
            ))}
            <div className="flex justify-between mt-4">
              <span className="text-sm text-gray-400">{Object.keys(mhs).length}/10 answered</span>
              <Button onClick={nextStep} disabled={!allAnswered(mhs, 10)}>
                Next: DEPSCR <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── DEPSCR ─────────────────────────────────────────── */}
        {step === 'depscr' && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={18} className="text-purple-600" />
              <h2 className="font-semibold text-gray-900">DEPSCR — Depression Screening</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">Over the last 2 weeks, how often have you been bothered by the following?</p>
            {DEPSCR_ITEMS.map((text, i) => (
              <QuestionCard key={i} num={i + 1} total={9} text={text}
                options={DEPSCR_OPTIONS} value={depscr[i]}
                onChange={(v: number) => setDepscr(r => ({ ...r, [i]: v }))} />
            ))}
            {depscr[8] >= 1 && (
              <div className="p-4 bg-red-50 rounded-xl border border-red-200 mb-4">
                <p className="text-red-700 font-medium text-sm flex items-center gap-2">
                  <AlertTriangle size={16} /> Item 9 flagged — Suicidal ideation indicator
                </p>
                <p className="text-red-600 text-xs mt-1">Immediate clinical assessment required. Follow your organisation's crisis protocol.</p>
              </div>
            )}
            <div className="flex justify-between mt-4">
              <Button variant="secondary" onClick={prevStep}><ChevronLeft size={16} /> Back</Button>
              <Button onClick={nextStep} disabled={!allAnswered(depscr, 9)}>
                Next: ANXSCR <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── ANXSCR ─────────────────────────────────────────── */}
        {step === 'anxscr' && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Heart size={18} className="text-rose-600" />
              <h2 className="font-semibold text-gray-900">ANXSCR — Anxiety Screening</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">Over the last 2 weeks, how often have you been bothered by the following?</p>
            {GLOBAL_ANXT_ITEMS.map((text, i) => (
              <QuestionCard key={i} num={i + 1} total={7} text={text}
                options={DEPSCR_OPTIONS} value={anxscr[i]}
                onChange={(v: number) => setAnxscr(r => ({ ...r, [i]: v }))} />
            ))}
            <div className="flex justify-between mt-4">
              <Button variant="secondary" onClick={prevStep}><ChevronLeft size={16} /> Back</Button>
              <Button onClick={nextStep} disabled={!allAnswered(anxscr, 7)}>
                Next: SQI <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── SQI ──────────────────────────────────────────── */}
        {step === 'sqi' && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Moon size={18} className="text-indigo-600" />
              <h2 className="font-semibold text-gray-900">SQI — Sleep Quality Index</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">During the past month…</p>
            {SLP_INDEX_ITEMS.map((q, i) => (
              <QuestionCard key={i} num={i + 1} total={7} text={q.text}
                options={q.options ?? SLP_INDEX_STD} value={sqi[i]}
                onChange={(v: number) => setSqi(r => ({ ...r, [i]: v }))} />
            ))}
            <div className="flex justify-between mt-4">
              <Button variant="secondary" onClick={prevStep}><ChevronLeft size={16} /> Back</Button>
              <Button onClick={nextStep} disabled={!allAnswered(sqi, 7)}>
                Next: AUSC <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── AUSC ───────────────────────────────────────── */}
        {step === 'ausc' && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Wine size={18} className="text-amber-600" />
              <h2 className="font-semibold text-gray-900">AUSC — Alcohol Use Screening</h2>
            </div>
            <p className="text-xs text-gray-400 mb-5">Thinking about the past year…</p>
            {AUDIT_QUESTIONS.map((q, i) => (
              <QuestionCard key={i} num={i + 1} total={3} text={q.text}
                options={q.options} value={ausc[i]}
                onChange={(v: number) => setAusc(r => ({ ...r, [i]: v }))} />
            ))}
            <div className="flex justify-between mt-4">
              <Button variant="secondary" onClick={prevStep}><ChevronLeft size={16} /> Back</Button>
              <Button onClick={nextStep} disabled={!allAnswered(ausc, 3)}>
                View Results <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── RESULTS ───────────────────────────────────────── */}
        {step === 'results' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle size={24} className="text-green-500" />
              <div>
                <p className="font-bold text-gray-900">Athlete Mental Health Screening Complete</p>
                {selectedAthlete && <p className="text-sm text-gray-500">{selectedAthlete.first_name} {selectedAthlete.last_name} · {new Date().toLocaleDateString()}</p>}
              </div>
            </div>

            {/* Score cards */}
            {[
              { label: 'AMHS',   score: sum(mhs),    max: 40, thresholds: MHS_T,          desc: 'Athlete Mental Health' },
              { label: 'DEPSCR', score: sum(depscr), max: 27, thresholds: DEPSCR_T,        desc: 'Depression' },
              { label: 'ANXSCR', score: sum(anxscr), max: 21, thresholds: GLOBAL_ANXT_T,   desc: 'Anxiety' },
              { label: 'SQI',    score: sum(sqi),    max: 21, thresholds: SLP_INDEX_T,     desc: 'Sleep Quality' },
              { label: 'AUSC',   score: sum(ausc),   max: 12, thresholds: AUDIT_T,         desc: 'Alcohol Use' },
            ].map(({ label, score, max, thresholds, desc }) => {
              const risk = getRisk(score, thresholds as any)
              const pct = Math.round((score / max) * 100)
              return (
                <Card key={label} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-900">{score}</span>
                      <span className="text-sm text-gray-400">/{max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${risk.color} ${risk.bg}`}>
                    {risk.level}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{(risk as any).action}</p>
                </Card>
              )
            })}

            {/* DEPSCR item 9 flag */}
            {depscr[8] >= 1 && (
              <div className="p-4 bg-red-100 rounded-xl border-2 border-red-300">
                <p className="text-red-800 font-bold flex items-center gap-2">
                  <AlertTriangle size={18} /> ⚠ CRITICAL FLAG: Suicidal ideation reported (DEPSCR Item 9)
                </p>
                <p className="text-red-700 text-sm mt-1">Immediate clinical assessment is required. Follow your organisation's crisis protocol. Do not leave athlete alone.</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep('mhs')}>Restart</Button>
              <Button
                className="flex-1"
                onClick={saveResults}
                loading={saving}
                disabled={!athleteId || saved}
              >
                {saved ? '✓ Saved to Profile' : 'Save to Athlete Profile'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
