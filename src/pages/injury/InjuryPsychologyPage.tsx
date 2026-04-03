// src/pages/injury/InjuryPsychologyPage.tsx
// Sport Injury Psychology Module
// Tabs: Injury Log | OSIICS Classifier | Psych Readiness | Surveillance Report

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Plus, Search, Brain, Activity, BarChart2,
  FileText, Check, X, ChevronDown, ChevronRight, Printer,
  Shield, Heart, Target, Zap, TrendingUp, Clock, ArrowLeft,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Modal, Input, Select, Textarea, Spinner, EmptyState, Avatar } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAthletes } from '@/hooks/useAthletes'
import { callGroq } from '@/lib/groq'
import { fmtDate } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'
import { searchOSIICS, lookupOSIICS, type OSIICSCode } from '@/lib/osiics_data'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InjuryRecord {
  id: string
  practitioner_id: string
  athlete_id: string
  diagnosis_text: string
  osiics_code_1?: string
  osiics_diagnosis_1?: string
  osiics_body_part_1?: string
  osiics_injury_type_1?: string
  osiics_code_2?: string
  osiics_diagnosis_2?: string
  mechanism: string
  context: 'training' | 'match' | 'gym' | 'rehab' | 'unknown'
  date_of_injury: string
  date_of_return?: string
  missed_days?: number
  missed_matches?: number
  severity: 'minimal' | 'mild' | 'moderate' | 'severe' | 'career_threatening'
  status: 'acute' | 'subacute' | 'chronic' | 'recovered' | 'reinjury'
  psych_referral_needed: boolean
  notes?: string
  created_at: string
}

interface PsychReadiness {
  id: string
  practitioner_id: string
  athlete_id: string
  injury_id?: string
  assessed_at: string
  // ACL-PSYCH adapted (13 items, 0-100 each)
  acl_psych_scores: Record<string, number>
  acl_psych_total: number
  // Scale for Kinesiophobia (SFK-11)
  sfk_scores: Record<string, number>
  sfk_total: number
  // TFSI_R items
  tfsi_r_scores: Record<string, number>
  tfsi_r_total: number
  overall_readiness: number  // 0-100
  ready_to_return: boolean
  notes?: string
  created_at: string
}

// ── Psychological Readiness Instruments ───────────────────────────────────────

const ACL_RSI_ITEMS = [
  { id: 'e1', text: 'I am confident I can perform at my previous level of sport participation', subscale: 'Emotions' },
  { id: 'e2', text: 'I am confident I can perform without concern about my injury', subscale: 'Emotions' },
  { id: 'e3', text: 'I am confident the injured area will withstand the demands of sport', subscale: 'Emotions' },
  { id: 'e4', text: 'I feel psychologically ready to fully participate in sport', subscale: 'Emotions' },
  { id: 'r1', text: 'I am frightened of re-injuring my knee/area by returning to sport', subscale: 'Risk appraisal', reversed: true },
  { id: 'r2', text: 'I think I am taking a risk if I return to sport', subscale: 'Risk appraisal', reversed: true },
  { id: 'r3', text: 'I am worried about re-injuring myself', subscale: 'Risk appraisal', reversed: true },
  { id: 'r4', text: 'I think there is a possibility I will re-injure myself', subscale: 'Risk appraisal', reversed: true },
  { id: 'c1', text: 'I do not think I will miss a step in competition', subscale: 'Confidence' },
  { id: 'c2', text: 'I am confident about performing the basic skills required for my sport', subscale: 'Confidence' },
  { id: 'c3', text: 'I am confident I can perform the technical skills required for my sport', subscale: 'Confidence' },
  { id: 'c4', text: 'I expect my sporting performance will be at the same level as before my injury', subscale: 'Confidence' },
  { id: 'c5', text: 'I am mentally prepared for full competition', subscale: 'Confidence' },
]

const TSK_ITEMS = [
  { id: 't1', text: 'I am afraid that I might injure myself if I exercise' },
  { id: 't2', text: 'If I were to try to overcome it, my pain would increase' },
  { id: 't3', text: 'My body is telling me I have something dangerously wrong' },
  { id: 't4', text: 'My pain would probably be relieved if I were to exercise' },
  { id: 't5', text: 'People are not taking my medical condition seriously enough' },
  { id: 't6', text: 'My injury has put my body at risk for the rest of my life' },
  { id: 't7', text: 'Pain always means I have injured my body' },
  { id: 't8', text: 'Just because something aggravates my pain does not mean it is dangerous' },
  { id: 't9', text: 'I am afraid that I might accidentally do something to seriously hurt myself' },
  { id: 't10', text: 'Simply being careful that I do not make any unnecessary movements is the safest thing to do' },
  { id: 't11', text: 'I would not have this much pain if there were not something potentially dangerous going on in my body' },
]

const SIRSI_ITEMS = [
  { id: 's1', text: 'I feel capable of returning to my sport' },
  { id: 's2', text: 'My injury will not hold me back in sport', reversed: true },
  { id: 's3', text: 'I am prepared to push through discomfort to return to sport' },
  { id: 's4', text: 'I trust my body to handle the demands of training again' },
  { id: 's5', text: 'I feel motivated to complete my rehabilitation' },
  { id: 's6', text: 'I believe I will return to my pre-injury level of performance' },
  { id: 's7', text: 'I am anxious about returning to the sport environment', reversed: true },
]

// ── Supabase hooks ────────────────────────────────────────────────────────────

function useInjuries(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<InjuryRecord[]>({
    queryKey: ['injuries', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('injury_records')
        .select('*, athlete:athletes(id,first_name,last_name,sport)')
        .eq('practitioner_id', user!.id)
        .order('date_of_injury', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as InjuryRecord[]
    },
  })
}

function useCreateInjury() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<InjuryRecord, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('injury_records')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['injuries'] }),
  })
}

function usePsychReadiness(injuryId?: string, athleteId?: string) {
  const { user } = useAuth()
  return useQuery<PsychReadiness[]>({
    queryKey: ['psych_readiness', user?.id, injuryId, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('psych_readiness')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('assessed_at', { ascending: false })
      if (injuryId) q = q.eq('injury_id', injuryId)
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PsychReadiness[]
    },
  })
}

function useCreatePsychReadiness() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<PsychReadiness, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('psych_readiness')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['psych_readiness'] }),
  })
}

// ── OSIICS Search Component ───────────────────────────────────────────────────

function OSIICSSearchField({
  label, value, onChange, onSelect, placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSelect: (code: OSIICSCode) => void
  placeholder?: string
}) {
  const [suggestions, setSuggestions] = useState<OSIICSCode[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  function handleChange(v: string) {
    onChange(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const results = searchOSIICS(v, 8)
      setSuggestions(results)
      setShowDrop(results.length > 0)
    }, 200)
  }

  function handleSelect(code: OSIICSCode) {
    onSelect(code)
    setShowDrop(false)
    onChange(code.diagnosis)
  }

  const injuryTypeColor: Record<string, string> = {
    'Fracture': 'bg-red-100 text-red-700',
    'Ligament': 'bg-orange-100 text-orange-700',
    'Muscle injury': 'bg-amber-100 text-amber-700',
    'Nerve injury': 'bg-purple-100 text-purple-700',
    'Joint sprain': 'bg-blue-100 text-blue-700',
    'Tendon injury': 'bg-teal-100 text-teal-700',
    'Bone stress injury': 'bg-yellow-100 text-yellow-700',
    'Contusion/vascular': 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => value && setSuggestions(searchOSIICS(value, 8)) && setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 200)}
          placeholder={placeholder ?? 'Type diagnosis, body part, or code…'}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {showDrop && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400">OSIICS v16 — {suggestions.length} matches</p>
          </div>
          {suggestions.map(s => (
            <button
              key={s.code}
              onMouseDown={() => handleSelect(s)}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
            >
              <div className="shrink-0">
                <span className="inline-block text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                  {s.code}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight truncate">{s.diagnosis}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{s.body_part}</span>
                  {s.injury_type && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${injuryTypeColor[s.injury_type] ?? 'bg-gray-100 text-gray-500'}`}>
                      {s.injury_type}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Severity & status helpers ─────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  minimal: 'bg-green-100 text-green-700',
  mild: 'bg-teal-100 text-teal-700',
  moderate: 'bg-amber-100 text-amber-700',
  severe: 'bg-orange-100 text-orange-700',
  career_threatening: 'bg-red-100 text-red-700',
}
const STATUS_COLORS: Record<string, string> = {
  acute: 'bg-red-100 text-red-700',
  subacute: 'bg-amber-100 text-amber-700',
  chronic: 'bg-orange-100 text-orange-700',
  recovered: 'bg-green-100 text-green-700',
  reinjury: 'bg-purple-100 text-purple-700',
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'log',       label: 'Injury Log',        icon: FileText },
  { id: 'classifier',label: 'OSIICS Classifier',  icon: Search },
  { id: 'readiness', label: 'Psych Readiness',    icon: Brain },
  { id: 'report',    label: 'Surveillance Report',icon: BarChart2 },
] as const
type TabId = typeof TABS[number]['id']

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InjuryPsychologyPage() {
  const { user } = useAuth()
  const { data: athletes = [] } = useAthletes()
  const { data: injuries = [], isLoading: loadI } = useInjuries()
  const { data: readiness = [] } = usePsychReadiness()
  const createInjury = useCreateInjury()
  const createReadiness = useCreatePsychReadiness()

  const [tab, setTab] = useState<TabId>('log')
  const [filterAthleteId, setFilterAthleteId] = useState('')
  const [injuryModalOpen, setInjuryModalOpen] = useState(false)
  const [readinessModalOpen, setReadinessModalOpen] = useState(false)
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false)
  const [selectedInjury, setSelectedInjury] = useState<InjuryRecord | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [generatingAI, setGeneratingAI] = useState(false)

  // ── Injury log form ──────────────────────────────────────────────────────
  const [injForm, setInjForm] = useState({
    athlete_id: '',
    diagnosis_text: '',
    osiics_code_1: '', osiics_diagnosis_1: '', osiics_body_part_1: '', osiics_injury_type_1: '',
    osiics_code_2: '', osiics_diagnosis_2: '',
    mechanism: 'Contact',
    context: 'training' as const,
    date_of_injury: new Date().toISOString().slice(0, 10),
    date_of_return: '',
    missed_days: '',
    missed_matches: '',
    severity: 'moderate' as const,
    status: 'acute' as const,
    psych_referral_needed: false,
    notes: '',
  })

  // ── Psych readiness form ─────────────────────────────────────────────────
  const [prForm, setPrForm] = useState({
    athlete_id: '',
    injury_id: '',
    acl_rsi: {} as Record<string, number>,
    tsk: {} as Record<string, number>,
    sirsi: {} as Record<string, number>,
    notes: '',
    ready_to_return: false,
  })
  const [prStep, setPrStep] = useState<'acl' | 'tsk' | 'sirsi' | 'result'>('acl')
  const [savingInj, setSavingInj] = useState(false)
  const [savingPr, setSavingPr] = useState(false)
  const [injSaveError, setInjSaveError] = useState('')
  const [prSaveError, setPrSaveError] = useState('')

  async function handleSaveInjury() {
    setSavingInj(true)
    setInjSaveError('')
    try {
      await createInjury.mutateAsync({
        athlete_id: injForm.athlete_id,
        diagnosis_text: injForm.diagnosis_text,
        osiics_code_1: injForm.osiics_code_1 || undefined,
        osiics_diagnosis_1: injForm.osiics_diagnosis_1 || undefined,
        osiics_body_part_1: injForm.osiics_body_part_1 || undefined,
        osiics_injury_type_1: injForm.osiics_injury_type_1 || undefined,
        osiics_code_2: injForm.osiics_code_2 || undefined,
        osiics_diagnosis_2: injForm.osiics_diagnosis_2 || undefined,
        mechanism: injForm.mechanism,
        context: injForm.context,
        date_of_injury: new Date(injForm.date_of_injury).toISOString(),
        date_of_return: injForm.date_of_return ? new Date(injForm.date_of_return).toISOString() : undefined,
        missed_days: injForm.missed_days ? parseInt(injForm.missed_days) : undefined,
        missed_matches: injForm.missed_matches ? parseInt(injForm.missed_matches) : undefined,
        severity: injForm.severity,
        status: injForm.status,
        psych_referral_needed: injForm.psych_referral_needed,
        notes: injForm.notes || undefined,
      })
      setInjuryModalOpen(false)
    } catch (err: any) {
      setInjSaveError('Save failed: ' + (err?.message ?? 'unknown error'))
    } finally { setSavingInj(false) }
  }

  function calcACLRSI() {
    const vals = ACL_RSI_ITEMS.map(item => {
      const raw = prForm.acl_rsi[item.id] ?? 0
      return item.reversed ? 100 - raw : raw
    })
    return Math.round(vals.reduce((a, b) => a + b, 0) / ACL_RSI_ITEMS.length)
  }

  function calcTSK() {
    return Object.values(prForm.tsk).reduce((a, b) => a + b, 0)
  }

  function calcSIRSI() {
    const vals = SIRSI_ITEMS.map(item => {
      const raw = prForm.sirsi[item.id] ?? 0
      return (item as any).reversed ? 8 - raw : raw
    })
    return Math.round(vals.reduce((a, b) => a + b, 0) / SIRSI_ITEMS.length * 20) // normalize to 100
  }

  async function handleSaveReadiness() {
    setSavingPr(true)
    setPrSaveError('')
    const aclTotal = calcACLRSI()
    const tskTotal = calcTSK()
    const sirsiTotal = calcSIRSI()
    const overall = Math.round((aclTotal * 0.4) + (sirsiTotal * 0.4) + (Math.max(0, 100 - (tskTotal / 44) * 100) * 0.2))

    try {
      await createReadiness.mutateAsync({
        athlete_id: prForm.athlete_id,
        injury_id: prForm.injury_id || undefined,
        assessed_at: new Date().toISOString(),
        acl_rsi_scores: prForm.acl_rsi,
        acl_rsi_total: aclTotal,
        tsk_scores: prForm.tsk,
        tsk_total: tskTotal,
        sirsi_scores: prForm.sirsi,
        sirsi_total: sirsiTotal,
        overall_readiness: overall,
        ready_to_return: overall >= 65 && tskTotal <= 28,
        notes: prForm.notes || undefined,
      })
      setReadinessModalOpen(false)
      setPrStep('acl')
    } catch (err: any) {
      setPrSaveError('Save failed: ' + (err?.message ?? 'unknown error'))
    } finally { setSavingPr(false) }
  }

  async function generateAIAnalysis(injury: InjuryRecord) {
    setSelectedInjury(injury)
    setAiAnalysisOpen(true)
    setGeneratingAI(true)
    const athlete = athletes.find(a => a.id === injury.athlete_id)
    const prRecords = readiness.filter(r => r.injury_id === injury.id || r.athlete_id === injury.athlete_id).slice(0, 3)

    const prompt = `You are a specialist sport psychologist providing a psychological analysis of an injured athlete.

INJURY DATA:
Athlete: ${athlete?.first_name} ${athlete?.last_name} (${athlete?.sport})
Diagnosis: ${injury.diagnosis_text}
OSIICS Code: ${injury.osiics_code_1 || 'Not coded'} — ${injury.osiics_diagnosis_1 || ''}
Body Part: ${injury.osiics_body_part_1 || 'Unknown'}
Injury Type: ${injury.osiics_injury_type_1 || 'Unknown'}
Mechanism: ${injury.mechanism}
Context: ${injury.context}
Severity: ${injury.severity}
Status: ${injury.status}
Date of Injury: ${fmtDate(injury.date_of_injury)}
Missed Days: ${injury.missed_days ?? 'Not recorded'}
${injury.notes ? `Notes: ${injury.notes}` : ''}
Psych Referral Needed: ${injury.psych_referral_needed ? 'Yes' : 'No'}

${prRecords.length > 0 ? `PSYCHOLOGICAL READINESS ASSESSMENTS (${prRecords.length} on record):
${prRecords.map(r => `  - ${fmtDate(r.assessed_at)}: ACL-RSI ${r.acl_rsi_total}%, TSK ${r.tsk_total}/44, SIRSI ${r.sirsi_total}%, Overall Readiness ${r.overall_readiness}% — ${r.ready_to_return ? 'CLEARED' : 'NOT CLEARED'}`).join('\n')}` : 'No psychological readiness assessments recorded yet.'}

Please provide a professional psychological analysis including:

## Psychological Impact Assessment
How this injury type and severity typically affects athletes psychologically.

## Key Psychological Concerns
Based on the mechanism, sport, and severity, identify likely psychological barriers.

## Fear of Re-injury Profile
Expected kinesiophobia and fear avoidance patterns for this injury type.

## Recommended Psychological Interventions
Specific evidence-based interventions (with rationale) appropriate for this case.

## Return-to-Sport Psychological Readiness Framework
Stage-specific psychological readiness targets and milestones.

## Red Flags to Monitor
Specific warning signs that would indicate need for clinical escalation.

Write in professional clinical language. Be specific to this injury type and athlete's sport.`

    try {
      const text = await callGroq({ messages: [{ role: 'user', content: prompt }], max_tokens: 2500 })
      setAiAnalysis(text)
    } catch (err: any) {
      setAiAnalysis(`Error generating analysis: ${err.message}`)
    } finally {
      setGeneratingAI(false)
    }
  }

  // ── Filtered data ────────────────────────────────────────────────────────
  const filteredInjuries = filterAthleteId
    ? injuries.filter(i => i.athlete_id === filterAthleteId)
    : injuries

  // ── Surveillance data ────────────────────────────────────────────────────
  const bodyPartCounts = injuries.reduce((acc: Record<string, number>, i) => {
    const bp = i.osiics_body_part_1 || 'Unclassified'
    acc[bp] = (acc[bp] ?? 0) + 1
    return acc
  }, {})
  const bodyPartData = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }))

  const severityData = ['minimal', 'mild', 'moderate', 'severe', 'career_threatening'].map(s => ({
    name: s.replace('_', ' '),
    value: injuries.filter(i => i.severity === s).length,
  })).filter(d => d.value > 0)

  const contextData = ['training', 'match', 'gym', 'rehab', 'unknown'].map(c => ({
    name: c,
    value: injuries.filter(i => i.context === c).length,
  })).filter(d => d.value > 0)

  const PIE_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

  function renderMd(md: string) {
    return md
      .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-gray-900 mt-4 mb-1.5 pb-1 border-b border-gray-100">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="text-xs font-bold text-gray-700 mt-3 mb-1">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-3 text-xs text-gray-600 mb-1 list-disc">$1</li>')
      .replace(/\n\n/g, '</p><p class="text-xs text-gray-600 mb-2 leading-relaxed">')
  }

  return (
    <AppShell>
      <PageHeader
        title="Sport Injury Psychology"
        subtitle={`${injuries.length} injuries · ${readiness.length} readiness assessments`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setReadinessModalOpen(true)}>
              <Brain size={15} /> Psych Readiness
            </Button>
            <Button onClick={() => setInjuryModalOpen(true)}>
              <Plus size={15} /> Log Injury
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Injury Log ────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div>
          <div className="flex gap-3 mb-4">
            <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
              <option value="">All athletes</option>
              {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
            </select>
          </div>

          {loadI ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            : filteredInjuries.length === 0 ? (
              <EmptyState icon={<AlertTriangle size={48} />} title="No injuries logged"
                action={<Button onClick={() => setInjuryModalOpen(true)}><Plus size={15} /> Log Injury</Button>} />
            ) : (
              <div className="space-y-3">
                {filteredInjuries.map(inj => {
                  const athlete = athletes.find(a => a.id === inj.athlete_id)
                  const prCount = readiness.filter(r => r.injury_id === inj.id).length
                  return (
                    <Card key={inj.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-semibold text-sm text-gray-900 truncate">
                              {athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Unknown'}
                            </p>
                            <Badge label={inj.severity.replace('_', ' ')} className={SEVERITY_COLORS[inj.severity]} />
                            <Badge label={inj.status} className={STATUS_COLORS[inj.status]} />
                            {inj.psych_referral_needed && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle size={10} /> Psych referral
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800">{inj.diagnosis_text}</p>
                          {inj.osiics_code_1 && (
                            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span className="font-mono font-bold">{inj.osiics_code_1}</span> — {inj.osiics_diagnosis_1}
                              <span className="text-gray-400">({inj.osiics_body_part_1})</span>
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {fmtDate(inj.date_of_injury)} · {inj.mechanism} · {inj.context}
                            {inj.missed_days ? ` · ${inj.missed_days} days missed` : ''}
                            {prCount > 0 ? ` · ${prCount} readiness assessment${prCount > 1 ? 's' : ''}` : ''}
                          </p>
                        </div>
                        <Button variant="secondary" size="sm"
                          onClick={() => generateAIAnalysis(inj)}>
                          <Brain size={13} /> AI Analysis
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
        </div>
      )}

      {/* ── Tab: OSIICS Classifier ─────────────────────────────────────────── */}
      {tab === 'classifier' && (
        <div className="max-w-3xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Search size={18} className="text-blue-500" />
              <h2 className="font-bold text-gray-900">OSIICS v16 Classifier</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">1,763 codes</span>
            </div>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              Type any diagnosis, symptom, body part, or injury description below. The classifier will automatically suggest relevant OSIICS v16 codes ranked by relevance.
            </p>

            <OSIICSSearchField
              label="Enter diagnosis or description"
              value={injForm.diagnosis_text}
              onChange={v => setInjForm(f => ({ ...f, diagnosis_text: v }))}
              onSelect={code => setInjForm(f => ({
                ...f,
                osiics_code_1: code.code,
                osiics_diagnosis_1: code.diagnosis,
                osiics_body_part_1: code.body_part,
                osiics_injury_type_1: code.injury_type,
              }))}
              placeholder="e.g. ACL tear, hamstring strain, concussion, stress fracture…"
            />

            {injForm.osiics_code_1 && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-semibold text-blue-500 mb-2 uppercase tracking-wide">Selected OSIICS Code</p>
                <div className="flex items-start gap-3">
                  <span className="text-lg font-black font-mono text-blue-700">{injForm.osiics_code_1}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{injForm.osiics_diagnosis_1}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-xs bg-white text-gray-600 border px-2 py-0.5 rounded-full">📍 {injForm.osiics_body_part_1}</span>
                      <span className="text-xs bg-white text-gray-600 border px-2 py-0.5 rounded-full">🔬 {injForm.osiics_injury_type_1}</span>
                    </div>
                  </div>
                  <button onClick={() => setInjForm(f => ({ ...f, osiics_code_1: '', osiics_diagnosis_1: '', osiics_body_part_1: '', osiics_injury_type_1: '' }))}
                    className="ml-auto text-gray-400 hover:text-red-500"><X size={16} /></button>
                </div>
              </div>
            )}

            <div className="mt-6 border-t pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Browse by Body Part</p>
              <div className="flex flex-wrap gap-2">
                {['Head', 'Neck', 'Shoulder', 'Upper Arm', 'Elbow', 'Forearm', 'Hand', 'Chest', 'Thoracic Spine', 'Lumbar Spine', 'Abdomen', 'Groin/hip', 'Thigh', 'Knee', 'Lower leg', 'Ankle', 'Foot'].map(bp => (
                  <button key={bp}
                    onClick={() => setInjForm(f => ({ ...f, diagnosis_text: bp }))}
                    className="text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 px-2.5 py-1 rounded-full transition-colors">
                    {bp}
                  </button>
                ))}
              </div>
            </div>

            {/* Live results for current query */}
            {injForm.diagnosis_text.length >= 2 && (
              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  Results for "{injForm.diagnosis_text}"
                </p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {searchOSIICS(injForm.diagnosis_text, 15).map(c => (
                    <button key={c.code}
                      onClick={() => setInjForm(f => ({ ...f, osiics_code_1: c.code, osiics_diagnosis_1: c.diagnosis, osiics_body_part_1: c.body_part, osiics_injury_type_1: c.injury_type }))}
                      className="w-full flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors text-left">
                      <span className="text-xs font-bold font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">{c.code}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{c.diagnosis}</p>
                        <p className="text-xs text-gray-400">{c.body_part} · {c.injury_type}</p>
                      </div>
                      {injForm.osiics_code_1 === c.code && <Check size={14} className="text-blue-500 shrink-0 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Tab: Psych Readiness History ───────────────────────────────────── */}
      {tab === 'readiness' && (
        <div>
          <div className="flex gap-3 mb-5">
            <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
              <option value="">All athletes</option>
              {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
            </select>
          </div>

          {readiness.length === 0 ? (
            <EmptyState icon={<Brain size={48} />} title="No readiness assessments yet"
              action={<Button onClick={() => setReadinessModalOpen(true)}><Plus size={15} /> Assess Readiness</Button>} />
          ) : (
            <div className="space-y-4">
              {(filterAthleteId ? readiness.filter(r => r.athlete_id === filterAthleteId) : readiness).map(r => {
                const athlete = athletes.find(a => a.id === r.athlete_id)
                const injury = injuries.find(i => i.id === r.injury_id)
                return (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {athlete?.first_name} {athlete?.last_name}
                        </p>
                        {injury && <p className="text-xs text-gray-500 mt-0.5">{injury.diagnosis_text}</p>}
                        <p className="text-xs text-gray-400">{fmtDate(r.assessed_at)}</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-black ${r.overall_readiness >= 65 ? 'text-green-600' : r.overall_readiness >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                          {r.overall_readiness}%
                        </div>
                        <p className="text-xs text-gray-400">Overall</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.ready_to_return ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {r.ready_to_return ? '✓ Cleared' : '✗ Not cleared'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'ACL-RSI', value: r.acl_rsi_total, max: 100, desc: 'Psychological readiness' },
                        { label: 'TSK-11', value: r.tsk_total, max: 44, desc: 'Kinesiophobia (lower=better)', lower_better: true },
                        { label: 'SIRSI', value: r.sirsi_total, max: 100, desc: 'Sport injury readiness' },
                      ].map(m => {
                        const pct = (m.value / m.max) * 100
                        const good = m.lower_better ? pct < 65 : pct >= 65
                        return (
                          <div key={m.label} className={`p-3 rounded-xl border ${good ? 'border-green-100 bg-green-50' : 'border-amber-100 bg-amber-50'}`}>
                            <p className="text-xs font-semibold text-gray-600">{m.label}</p>
                            <p className={`text-xl font-black ${good ? 'text-green-700' : 'text-amber-700'}`}>{m.value}<span className="text-xs font-normal text-gray-400">/{m.max}</span></p>
                            <p className="text-xs text-gray-500">{m.desc}</p>
                          </div>
                        )
                      })}
                    </div>
                    {r.notes && <p className="text-xs text-gray-500 mt-3 italic">{r.notes}</p>}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Surveillance Report ───────────────────────────────────────── */}
      {tab === 'report' && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Injuries', value: injuries.length, icon: AlertTriangle, color: 'text-red-500' },
              { label: 'Active Injuries', value: injuries.filter(i => i.status !== 'recovered').length, icon: Activity, color: 'text-amber-500' },
              { label: 'Psych Referrals', value: injuries.filter(i => i.psych_referral_needed).length, icon: Brain, color: 'text-purple-500' },
              { label: 'Avg Days Missed', value: injuries.filter(i => i.missed_days).length > 0 ? Math.round(injuries.filter(i => i.missed_days).reduce((a, i) => a + (i.missed_days ?? 0), 0) / injuries.filter(i => i.missed_days).length) : '—', icon: Clock, color: 'text-blue-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <Icon size={18} className={`${color} mb-2`} />
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Injuries by body part */}
            {bodyPartData.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Injuries by Body Part (OSIICS)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bodyPartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Severity distribution */}
            {severityData.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Injury Severity Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                      label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                      {severityData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Training vs Match */}
            {contextData.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Injury Context (Training vs Match)</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={contextData} margin={{ left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Psych readiness trend */}
            {readiness.length > 1 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Psychological Readiness Trend</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={[...readiness].reverse().slice(0, 12).map(r => ({
                    date: fmtDate(r.assessed_at),
                    'Overall %': r.overall_readiness,
                    'ACL-RSI': r.acl_rsi_total,
                  }))} margin={{ left: -20 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Overall %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="ACL-RSI" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>

          {/* Recent OSIICS coded injuries table */}
          {injuries.filter(i => i.osiics_code_1).length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-gray-900 mb-4">OSIICS Coded Injuries</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Athlete', 'Date', 'OSIICS Code', 'Diagnosis', 'Body Part', 'Type', 'Severity', 'Days Lost'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {injuries.filter(i => i.osiics_code_1).map(inj => {
                      const athlete = athletes.find(a => a.id === inj.athlete_id)
                      return (
                        <tr key={inj.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-2 px-3 text-xs font-medium text-gray-900">{athlete?.first_name} {athlete?.last_name}</td>
                          <td className="py-2 px-3 text-xs text-gray-500">{fmtDate(inj.date_of_injury)}</td>
                          <td className="py-2 px-3"><span className="font-mono font-bold text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{inj.osiics_code_1}</span></td>
                          <td className="py-2 px-3 text-xs text-gray-700 max-w-40 truncate">{inj.osiics_diagnosis_1}</td>
                          <td className="py-2 px-3 text-xs text-gray-500">{inj.osiics_body_part_1}</td>
                          <td className="py-2 px-3 text-xs text-gray-500">{inj.osiics_injury_type_1}</td>
                          <td className="py-2 px-3"><Badge label={inj.severity.replace('_', ' ')} className={SEVERITY_COLORS[inj.severity]} /></td>
                          <td className="py-2 px-3 text-xs text-gray-500">{inj.missed_days ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Log Injury Modal ────────────────────────────────────────────────── */}
      <Modal open={injuryModalOpen} onClose={() => setInjuryModalOpen(false)} title="Log Sport Injury" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Select label="Athlete" value={injForm.athlete_id}
            onChange={e => setInjForm(f => ({ ...f, athlete_id: (e.target as HTMLSelectElement).value }))}
            options={[{ value: '', label: '— Select athlete —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]} />

          {/* OSIICS-powered diagnosis field */}
          <OSIICSSearchField
            label="Diagnosis / Injury Description"
            value={injForm.diagnosis_text}
            onChange={v => setInjForm(f => ({ ...f, diagnosis_text: v }))}
            onSelect={code => setInjForm(f => ({
              ...f,
              diagnosis_text: code.diagnosis,
              osiics_code_1: code.code,
              osiics_diagnosis_1: code.diagnosis,
              osiics_body_part_1: code.body_part,
              osiics_injury_type_1: code.injury_type,
            }))}
          />

          {injForm.osiics_code_1 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm">
              <span className="font-mono font-bold text-blue-700">{injForm.osiics_code_1}</span>
              <span className="text-gray-600">{injForm.osiics_diagnosis_1}</span>
              <span className="text-gray-400 text-xs ml-auto">{injForm.osiics_body_part_1} · {injForm.osiics_injury_type_1}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Mechanism" value={injForm.mechanism}
              onChange={e => setInjForm(f => ({ ...f, mechanism: (e.target as HTMLSelectElement).value }))}
              options={['Contact', 'Non-contact', 'Overuse/Gradual', 'Unknown'].map(v => ({ value: v, label: v }))} />
            <Select label="Context" value={injForm.context}
              onChange={e => setInjForm(f => ({ ...f, context: (e.target as HTMLSelectElement).value as any }))}
              options={['training', 'match', 'gym', 'rehab', 'unknown'].map(v => ({ value: v, label: v }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date of Injury" type="date" value={injForm.date_of_injury}
              onChange={e => setInjForm(f => ({ ...f, date_of_injury: (e.target as HTMLInputElement).value }))} />
            <Input label="Date of Return (if known)" type="date" value={injForm.date_of_return}
              onChange={e => setInjForm(f => ({ ...f, date_of_return: (e.target as HTMLInputElement).value }))} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="Days Missed" type="number" value={injForm.missed_days}
              onChange={e => setInjForm(f => ({ ...f, missed_days: (e.target as HTMLInputElement).value }))} />
            <Input label="Matches Missed" type="number" value={injForm.missed_matches}
              onChange={e => setInjForm(f => ({ ...f, missed_matches: (e.target as HTMLInputElement).value }))} />
            <Select label="Severity" value={injForm.severity}
              onChange={e => setInjForm(f => ({ ...f, severity: (e.target as HTMLSelectElement).value as any }))}
              options={['minimal', 'mild', 'moderate', 'severe', 'career_threatening'].map(v => ({ value: v, label: v.replace('_', ' ') }))} />
          </div>

          <Select label="Status" value={injForm.status}
            onChange={e => setInjForm(f => ({ ...f, status: (e.target as HTMLSelectElement).value as any }))}
            options={['acute', 'subacute', 'chronic', 'recovered', 'reinjury'].map(v => ({ value: v, label: v }))} />

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={injForm.psych_referral_needed}
              onChange={e => setInjForm(f => ({ ...f, psych_referral_needed: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <label className="text-sm text-gray-700">Psychological referral/support needed</label>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Clinical Notes</label>
            <textarea value={injForm.notes} onChange={e => setInjForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              placeholder="Mechanism details, psychological observations, treatment plan…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            {injSaveError && <p className="text-xs text-red-600 flex-1 flex items-center">{injSaveError}</p>}
            <Button variant="secondary" onClick={() => { setInjuryModalOpen(false); setInjSaveError('') }}>Cancel</Button>
            <Button onClick={handleSaveInjury} loading={savingInj} disabled={!injForm.athlete_id || !injForm.diagnosis_text}>
              Save Injury
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Psych Readiness Modal ───────────────────────────────────────────── */}
      <Modal open={readinessModalOpen} onClose={() => setReadinessModalOpen(false)}
        title="Psychological Readiness Assessment" maxWidth="max-w-xl">
        {prStep === 'acl' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-blue-800">ACL-RSI (Adapted) — Psychological Readiness</p>
              <p className="text-xs text-blue-600">Rate 0–100: 0 = Not at all, 100 = Completely</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select label="Athlete" value={prForm.athlete_id}
                onChange={e => setPrForm(f => ({ ...f, athlete_id: (e.target as HTMLSelectElement).value }))}
                options={[{ value: '', label: '— Select —' }, ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]} />
              <Select label="Related Injury (optional)" value={prForm.injury_id}
                onChange={e => setPrForm(f => ({ ...f, injury_id: (e.target as HTMLSelectElement).value }))}
                options={[{ value: '', label: '— None —' }, ...injuries.filter(i => !prForm.athlete_id || i.athlete_id === prForm.athlete_id).map(i => ({ value: i.id, label: i.diagnosis_text.slice(0, 40) }))]} />
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {ACL_RSI_ITEMS.map(item => (
                <div key={item.id} className="p-3 border border-gray-100 rounded-xl">
                  <p className="text-sm text-gray-800 mb-2">{item.text}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-12">0 — No</span>
                    <input type="range" min={0} max={100} step={10}
                      value={prForm.acl_rsi[item.id] ?? 50}
                      onChange={e => setPrForm(f => ({ ...f, acl_rsi: { ...f.acl_rsi, [item.id]: parseInt(e.target.value) } }))}
                      className="flex-1 h-2 accent-blue-500" />
                    <span className="text-xs text-gray-400 w-16 text-right">Yes — 100</span>
                    <span className="w-8 text-center text-sm font-bold text-blue-700">{prForm.acl_rsi[item.id] ?? 50}</span>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.subscale}{item.reversed ? ' (reversed)' : ''}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="secondary" onClick={() => setReadinessModalOpen(false)}>Cancel</Button>
              <Button onClick={() => setPrStep('tsk')} disabled={!prForm.athlete_id}>Next: TSK →</Button>
            </div>
          </div>
        )}

        {prStep === 'tsk' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">Tampa Scale for Kinesiophobia (TSK-11)</p>
              <p className="text-xs text-amber-600">1 = Strongly disagree, 4 = Strongly agree. Score ≥ 28 indicates high kinesiophobia.</p>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {TSK_ITEMS.map((item, idx) => (
                <div key={item.id} className="p-3 border border-gray-100 rounded-xl">
                  <p className="text-sm text-gray-800 mb-2">{idx + 1}. {item.text}</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(v => (
                      <button key={v} onClick={() => setPrForm(f => ({ ...f, tsk: { ...f.tsk, [item.id]: v } }))}
                        className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                          prForm.tsk[item.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 border-t pt-3">
              <Button variant="secondary" onClick={() => setPrStep('acl')}>← Back</Button>
              <Button onClick={() => setPrStep('sirsi')}>Next: SIRSI →</Button>
            </div>
          </div>
        )}

        {prStep === 'sirsi' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-green-800">SIRSI — Sport Injury Rehabilitation Scale</p>
              <p className="text-xs text-green-600">1 = Strongly disagree, 7 = Strongly agree</p>
            </div>
            <div className="space-y-3">
              {SIRSI_ITEMS.map((item, idx) => (
                <div key={item.id} className="p-3 border border-gray-100 rounded-xl">
                  <p className="text-sm text-gray-800 mb-2">{idx + 1}. {item.text}</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map(v => (
                      <button key={v} onClick={() => setPrForm(f => ({ ...f, sirsi: { ...f.sirsi, [item.id]: v } }))}
                        className={`flex-1 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                          prForm.sirsi[item.id] === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 text-gray-500'
                        }`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Clinician Notes</label>
              <textarea value={prForm.notes} onChange={e => setPrForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                placeholder="Observed behaviour, clinical impressions, recommendations…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div className="flex justify-between gap-2 border-t pt-3">
              <Button variant="secondary" onClick={() => setPrStep('tsk')}>← Back</Button>
              <div className="flex items-center gap-3">
                {prSaveError && <p className="text-xs text-red-600">{prSaveError}</p>}
                <Button onClick={handleSaveReadiness} loading={savingPr}>
                  <Check size={15} /> Save Assessment
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── AI Analysis Modal ───────────────────────────────────────────────── */}
      <Modal open={aiAnalysisOpen} onClose={() => { setAiAnalysisOpen(false); setAiAnalysis('') }}
        title="AI Psychological Analysis" maxWidth="max-w-2xl">
        {selectedInjury && (
          <div className="mb-3 p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 font-semibold">Injury: {selectedInjury.diagnosis_text}</p>
            {selectedInjury.osiics_code_1 && (
              <p className="text-xs text-blue-600 mt-0.5">OSIICS {selectedInjury.osiics_code_1} — {selectedInjury.osiics_body_part_1}</p>
            )}
          </div>
        )}
        {generatingAI ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-gray-400">Generating psychological analysis…</p>
          </div>
        ) : aiAnalysis ? (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="prose prose-sm max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: `<p class="text-xs text-gray-600 mb-2 leading-relaxed">${renderMd(aiAnalysis)}</p>` }} />
          </div>
        ) : null}
      </Modal>
    </AppShell>
  )
}

function renderMd(md: string): string {
  return md
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-gray-900 mt-4 mb-1.5 pb-1 border-b border-gray-100">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-xs font-bold text-gray-700 mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 text-xs text-gray-600 mb-1 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-xs text-gray-600 mb-2 leading-relaxed">')
}
