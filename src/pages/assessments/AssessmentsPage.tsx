// AssessmentsPage.tsx — updated to include Offline Assessment logging
// Only the library header section changes; all other code remains identical.

import { useState, useRef } from 'react'
import { Plus, ClipboardList, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, BarChart2, FileInput, Target, TrendingUp, Users, Shield, Award, Zap } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Avatar, Modal, Select, Spinner, EmptyState } from '@/components/ui'
import { useAssessments, useCreateAssessment } from '@/hooks/useData'
import { useAthletes } from '@/hooks/useAthletes'
import { fmtDate } from '@/lib/utils'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import { INSTRUMENTS, scoreAssessment, type AssessmentInstrument } from '@/lib/assessmentInstruments'
import type { AssessmentTool } from '@/types'
import OfflineAssessmentModal from '@/components/OfflineAssessmentModal'   // ← NEW
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase as supabaseForProfiles } from '@/lib/supabase'
import { useAuth as useAuthForProfiles } from '@/contexts/AuthContext'
import { useQueryClient as useQueryClientForProfiles } from '@tanstack/react-query'

const TOOL_LIST = Object.values(INSTRUMENTS)

const DOMAIN_COLORS: Record<string, string> = {
  Anxiety:    'bg-red-100 text-red-700',
  Stress:     'bg-orange-100 text-orange-700',
  Confidence: 'bg-blue-100 text-blue-700',
  Recovery:   'bg-green-100 text-green-700',
  Flow:       'bg-purple-100 text-purple-700',
  Focus:      'bg-indigo-100 text-indigo-700',
}

const SCORE_COLORS = {
  green: 'text-green-700 bg-green-50 border-green-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  red:   'text-red-700 bg-red-50 border-red-200',
}


// ── Performance Profiling ─────────────────────────────────────────────────────

const PROFILING_DOMAINS = [
  {
    id: 'mental_toughness',
    label: 'Mental Toughness',
    icon: Shield,
    color: 'bg-blue-100 text-blue-700',
    accent: '#3b82f6',
    description: 'Assess resilience, control, commitment and challenge',
    dimensions: [
      { key: 'resilience', label: 'Resilience', desc: 'Ability to bounce back from setbacks', min: 0, max: 10 },
      { key: 'control_emotion', label: 'Emotional Control', desc: 'Managing emotions under pressure', min: 0, max: 10 },
      { key: 'control_life', label: 'Life Control', desc: 'Sense of control over circumstances', min: 0, max: 10 },
      { key: 'commitment', label: 'Commitment', desc: 'Goal focus and follow-through', min: 0, max: 10 },
      { key: 'challenge', label: 'Challenge', desc: 'Embracing difficulty as opportunity', min: 0, max: 10 },
      { key: 'confidence_ability', label: 'Confidence (Ability)', desc: 'Belief in own capabilities', min: 0, max: 10 },
      { key: 'confidence_interpersonal', label: 'Confidence (Interpersonal)', desc: 'Assertiveness in relationships', min: 0, max: 10 },
    ],
  },
  {
    id: 'pre_competition',
    label: 'Pre-Competition State',
    icon: Zap,
    color: 'bg-amber-100 text-amber-700',
    accent: '#f59e0b',
    description: 'Cognitive and somatic anxiety + self-confidence before performance',
    dimensions: [
      { key: 'cognitive_anxiety', label: 'Cognitive Anxiety', desc: 'Worry and negative thoughts', min: 0, max: 10 },
      { key: 'somatic_anxiety', label: 'Somatic Anxiety', desc: 'Physical symptoms of anxiety', min: 0, max: 10 },
      { key: 'self_confidence', label: 'Self-Confidence', desc: 'Belief in performance capability', min: 0, max: 10 },
      { key: 'focus_readiness', label: 'Focus Readiness', desc: 'Attentional preparedness', min: 0, max: 10 },
      { key: 'activation_level', label: 'Activation Level', desc: 'Arousal / energy level', min: 0, max: 10 },
    ],
  },
  {
    id: 'performance_capacity',
    label: 'Performance Capacity',
    icon: TrendingUp,
    color: 'bg-emerald-100 text-emerald-700',
    accent: '#10b981',
    description: 'Core performance psychology competencies',
    dimensions: [
      { key: 'goal_setting', label: 'Goal Setting', desc: 'SMART goal clarity and commitment', min: 0, max: 10 },
      { key: 'imagery', label: 'Imagery & Visualisation', desc: 'Quality and usage of mental rehearsal', min: 0, max: 10 },
      { key: 'self_talk', label: 'Self-Talk', desc: 'Quality of internal dialogue', min: 0, max: 10 },
      { key: 'attention_control', label: 'Attention Control', desc: 'Focus management during competition', min: 0, max: 10 },
      { key: 'activation_regulation', label: 'Activation Regulation', desc: 'Ability to regulate arousal', min: 0, max: 10 },
      { key: 'coping_skills', label: 'Coping Skills', desc: 'Managing adversity effectively', min: 0, max: 10 },
    ],
  },
  {
    id: 'team_cohesion',
    label: 'Team Cohesion',
    icon: Users,
    color: 'bg-purple-100 text-purple-700',
    accent: '#8b5cf6',
    description: 'Social and task cohesion within the team environment',
    dimensions: [
      { key: 'task_cohesion', label: 'Task Cohesion', desc: 'Working together toward common goals', min: 0, max: 10 },
      { key: 'social_cohesion', label: 'Social Cohesion', desc: 'Interpersonal bonds and relationships', min: 0, max: 10 },
      { key: 'role_clarity', label: 'Role Clarity', desc: 'Understanding of own role in team', min: 0, max: 10 },
      { key: 'communication', label: 'Communication', desc: 'Openness and quality of team talk', min: 0, max: 10 },
      { key: 'leadership_trust', label: 'Trust in Leadership', desc: 'Confidence in coaching/management', min: 0, max: 10 },
    ],
  },
  {
    id: 'flow_readiness',
    label: 'Flow Readiness',
    icon: Award,
    color: 'bg-rose-100 text-rose-700',
    accent: '#f43f5e',
    description: 'Conditions that enable peak performance and flow states',
    dimensions: [
      { key: 'challenge_skill', label: 'Challenge-Skill Balance', desc: 'Task demands match capability', min: 0, max: 10 },
      { key: 'clear_goals', label: 'Clear Goals', desc: 'Unambiguous performance targets', min: 0, max: 10 },
      { key: 'feedback', label: 'Feedback Clarity', desc: 'Immediate, clear performance feedback', min: 0, max: 10 },
      { key: 'concentration', label: 'Concentration', desc: 'Deep attentional absorption', min: 0, max: 10 },
      { key: 'loss_self_consciousness', label: 'Loss of Self-Consciousness', desc: 'Freedom from evaluation anxiety', min: 0, max: 10 },
      { key: 'intrinsic_motivation', label: 'Intrinsic Motivation', desc: 'Performing for its own sake', min: 0, max: 10 },
    ],
  },
]

// ── Helper: produce unique short labels for RadarChart subjects ───────────────
// d.label.split(' ')[0] caused "Confidence" to appear twice for
// "Confidence (Ability)" and "Confidence (Interpersonal)", breaking Recharts.
function getRadarLabel(label: string): string {
  const paren = label.match(/\((\w+)/)          // extract first word inside parens
  if (paren) {
    return label.split(' ')[0].slice(0, 7) + ' ' + paren[1].slice(0, 5)
  }
  const words = label.split(' ')
  return words.length === 1
    ? label.slice(0, 9)
    : words[0].slice(0, 6) + ' ' + words[1].slice(0, 5)
}
  id: string
  athlete_id: string
  domain_id: string
  scores: Record<string, number>
  notes: string
  created_at: string
}

function useProfiles(athleteId: string) {
  const { user } = useAuthForProfiles()
  return useQuery<ProfileEntry[]>({
    queryKey: ['perf_profiles', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabaseForProfiles
        .from('performance_profiles')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ProfileEntry[]
    },
  })
}

function useSaveProfile() {
  const { user } = useAuthForProfiles()
  const qc = useQueryClientForProfiles()
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabaseForProfiles
        .from('performance_profiles')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perf_profiles'] }),
  })
}

type AdminStep = 'library' | 'assign' | 'administer' | 'results' | 'profiling'

export default function AssessmentsPage() {
  const { data: assessments = [], isLoading } = useAssessments()
  const { data: athletes = [] } = useAthletes()
  const createAssessment = useCreateAssessment()

  const [filterAthleteId, setFilterAthleteId] = useState('')
  const [filterTool, setFilterTool] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [step, setStep] = useState<AdminStep>('library')
  const [selectedInstrument, setSelectedInstrument] = useState<AssessmentInstrument | null>(null)
  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [currentItem, setCurrentItem] = useState(0)
  const [responses, setResponses] = useState<Record<number, number>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastResult, setLastResult] = useState<ReturnType<typeof scoreAssessment> | null>(null)

  // ── NEW: offline modal state ──────────────────────────────────────────────
  const [offlineOpen, setOfflineOpen] = useState(false)

  // ── Performance Profiling state ───────────────────────────────────────────
  const [profilingOpen, setProfilingOpen] = useState(false)
  const [profDomain, setProfDomain] = useState(PROFILING_DOMAINS[0])
  const [profAthleteId, setProfAthleteId] = useState('')
  const [profScores, setProfScores] = useState<Record<string, number>>({})
  const [profNotes, setProfNotes] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profFilterAthlete, setProfFilterAthlete] = useState('')
  const { data: perfProfiles = [] } = useProfiles(profFilterAthlete)
  const saveProfile = useSaveProfile()
  const [mainTab, setMainTab] = useState<'instruments' | 'profiling'>('instruments')

  async function handleSaveProfile() {
    if (!profAthleteId) return
    setSavingProfile(true)
    try {
      await saveProfile.mutateAsync({
        athlete_id: profAthleteId,
        domain_id: profDomain.id,
        scores: profScores,
        notes: profNotes,
      })
      setProfilingOpen(false)
      setProfScores({})
      setProfNotes('')
    } finally {
      setSavingProfile(false)
    }
  }

  const athleteOptions = [
    { value: '', label: '— Select athlete —' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]

  const filtered = assessments.filter(a => {
    const byAthlete = !filterAthleteId || a.athlete_id === filterAthleteId
    const byTool = !filterTool || a.tool === filterTool
    return byAthlete && byTool
  })

  function startAssessment(instrument: AssessmentInstrument) {
    setSelectedInstrument(instrument)
    setSelectedAthleteId('')
    setCurrentItem(0)
    setResponses({})
    setNotes('')
    setStep('assign')
  }

  function beginAdministration() {
    if (!selectedAthleteId) return
    setCurrentItem(0)
    setStep('administer')
  }

  function answerItem(itemId: number, value: number) {
    setResponses(r => ({ ...r, [itemId]: value }))
    if (selectedInstrument && currentItem < selectedInstrument.questions.length - 1) {
      setTimeout(() => setCurrentItem(c => c + 1), 250)
    }
  }

  async function finishAssessment() {
    if (!selectedInstrument || !selectedAthleteId) return
    setSaving(true)
    try {
      const result = scoreAssessment(selectedInstrument, responses)
      setLastResult(result)
      await createAssessment.mutateAsync({
        athlete_id: selectedAthleteId,
        tool: selectedInstrument.code as AssessmentTool,
        administered_at: new Date().toISOString(),
        scores: result.subscaleScores,
        total_score: result.totalScore,
        notes,
      })
      setStep('results')
    } finally {
      setSaving(false)
    }
  }

  function resetToLibrary() {
    setStep('library')
    setSelectedInstrument(null)
    setLastResult(null)
  }

  // ── LIBRARY ───────────────────────────────────────────────────────────────
  if (step === 'library') {
    return (
      <AppShell>
        <PageHeader
          title="Assessments"
          subtitle="SPPS Custom Assessment Library · WINMINDPERFORM Proprietary"
          action={
            // ── NEW button ────────────────────────────────────────────────
            <Button variant="secondary" onClick={() => setOfflineOpen(true)}>
              <FileInput size={15} /> Log Offline Assessment
            </Button>
          }
        />

        {/* ── Main tab switcher ──────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5 w-fit">
          <button onClick={() => setMainTab('instruments')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === 'instruments' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="flex items-center gap-1.5"><ClipboardList size={14} /> Instruments</span>
          </button>
          <button onClick={() => setMainTab('profiling')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mainTab === 'profiling' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="flex items-center gap-1.5"><Target size={14} /> Performance Profiling</span>
          </button>
        </div>

        {mainTab === 'profiling' && (
          <PerformanceProfilingSection
            athletes={athletes}
            profiles={perfProfiles}
            filterAthleteId={profFilterAthlete}
            onFilterChange={setProfFilterAthlete}
            onNew={() => setProfilingOpen(true)}
            onDomainSelect={(d) => { setProfDomain(d); setProfilingOpen(true) }}
          />
        )}

        {mainTab === 'instruments' && (
        <>
        {/* ── INSTRUMENTS section label ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-700">SPPS Proprietary Instruments</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Administer in-app · Auto-scored</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {TOOL_LIST.map(inst => (
            <Card key={inst.code} className="p-5 hover:shadow-md transition-shadow">
              <div className="mb-3">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${DOMAIN_COLORS[inst.domain] ?? 'bg-gray-100 text-gray-600'}`}>
                  {inst.domain}
                </span>
                <p className="font-bold text-gray-900 text-lg">{inst.code}</p>
                <p className="text-xs text-gray-500">{inst.name}</p>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5 mb-3">
                <p>{inst.items} items · {inst.adminTime} · {inst.subscales.length} sub-scales</p>
                <p className="italic text-gray-300">{inst.version} · No external licence required</p>
              </div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">{inst.timing}</p>
              <Button className="w-full" onClick={() => startAssessment(inst)}>
                <Plus size={14} /> Assign & Administer
              </Button>
            </Card>
          ))}

          {/* ── NEW: Offline tile ──────────────────────────────────────────── */}
          <Card className="p-5 hover:shadow-md transition-shadow border-dashed border-2 border-gray-200 flex flex-col justify-between">
            <div className="mb-3">
              <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 bg-gray-100 text-gray-600">
                External / Offline
              </span>
              <p className="font-bold text-gray-900 text-lg">+ Other Tool</p>
              <p className="text-xs text-gray-500">Big Five · OMSAT · ACSI-28 · MTQ48 · CSAI-2 · and 10+ more</p>
            </div>
            <div className="text-xs text-gray-400 mb-3">
              <p>Log results from any offline or third-party validated instrument.</p>
              <p className="mt-1 text-gray-300 italic">Results appear in Case Formulation & Reports.</p>
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setOfflineOpen(true)}>
              <FileInput size={14} /> Log Offline Assessment
            </Button>
          </Card>
        </div>

        {/* Past assessments ─────────────────────────────────────────────────── */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Past Assessments ({assessments.length})</h2>
            <div className="flex gap-2">
              <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                <option value="">All athletes</option>
                {athletes.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
              </select>
              <select value={filterTool} onChange={e => setFilterTool(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                <option value="">All tools</option>
                {TOOL_LIST.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                <option disabled>──────────</option>
                <option value="EXTERNAL">External / Offline</option>
              </select>
            </div>
          </div>

          {isLoading ? <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            : filtered.length === 0 ? <EmptyState icon={<ClipboardList size={48} />} title="No assessments yet" description="Select an instrument above or log an offline assessment" />
            : (
              <div className="space-y-3">
                {filtered.map(a => {
                  const isExpanded = expandedId === a.id
                  const isExternal = String(a.tool).startsWith('EXTERNAL:')
                  const radarData = Object.entries(a.scores).map(([subject, value]) => ({ subject: subject.split(' ')[0], value }))
                  return (
                    <Card key={a.id} className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                      <div className="flex items-center gap-4">
                        {a.athlete && <Avatar firstName={a.athlete.first_name} lastName={a.athlete.last_name} size="sm" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 truncate">
                              {a.athlete ? `${a.athlete.first_name} ${a.athlete.last_name}` : 'Unknown'}
                            </p>
                            {isExternal && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">offline</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {isExternal ? String(a.tool).replace('EXTERNAL:', '') : a.tool} · {fmtDate(a.administered_at)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold text-gray-900">{a.total_score}</p>
                          <p className="text-xs text-gray-400">total</p>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              {Object.entries(a.scores).map(([sub, val]) => (
                                <div key={sub}>
                                  <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                                    <span className="truncate pr-2">{sub}</span>
                                    <span className="font-semibold shrink-0">{val as number}</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full">
                                    <div className="h-full bg-blue-500 rounded-full"
                                      style={{ width: `${Math.min(((val as number) / 30) * 100, 100)}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                            {radarData.length >= 3 && (
                              <ResponsiveContainer width="100%" height={160}>
                                <RadarChart data={radarData}>
                                  <PolarGrid />
                                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                                  <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                                  <Tooltip />
                                </RadarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                          {a.notes && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{a.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
        </div>

        </>
        )}

        {/* ── Performance Profile entry modal ───────────────────────────────── */}
        {profilingOpen && (
          <ProfileEntryModal
            domain={profDomain}
            domains={PROFILING_DOMAINS}
            athletes={athletes}
            athleteId={profAthleteId}
            scores={profScores}
            notes={profNotes}
            saving={savingProfile}
            onDomainChange={(d) => { setProfDomain(d); setProfScores({}) }}
            onAthleteChange={setProfAthleteId}
            onScoreChange={(key, val) => setProfScores(s => ({ ...s, [key]: val }))}
            onNotesChange={setProfNotes}
            onSave={handleSaveProfile}
            onClose={() => setProfilingOpen(false)}
          />
        )}

        {/* ── NEW: Offline modal ───────────────────────────────────────────── */}
        <OfflineAssessmentModal
          open={offlineOpen}
          onClose={() => setOfflineOpen(false)}
        />
      </AppShell>
    )
  }

  // ── ASSIGN ────────────────────────────────────────────────────────────────
  if (step === 'assign' && selectedInstrument) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto">
          <button onClick={resetToLibrary} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ChevronLeft size={16} /> Back to Library
          </button>
          <Card className="p-6">
            <div className="mb-4">
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${DOMAIN_COLORS[selectedInstrument.domain] ?? 'bg-gray-100 text-gray-600'}`}>
                {selectedInstrument.domain}
              </span>
              <p className="font-bold text-gray-900 text-xl">{selectedInstrument.code}</p>
              <p className="text-sm text-gray-500 mb-1">{selectedInstrument.name}</p>
              <p className="text-xs text-gray-400">{selectedInstrument.items} items · {selectedInstrument.adminTime}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 mb-5">
              <p className="text-sm text-blue-800 leading-relaxed">{selectedInstrument.instructions}</p>
            </div>
            <Select label="Select Athlete" value={selectedAthleteId}
              onChange={e => setSelectedAthleteId((e.target as HTMLSelectElement).value)}
              options={athleteOptions} />
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" onClick={resetToLibrary} className="flex-1">Cancel</Button>
              <Button onClick={beginAdministration} disabled={!selectedAthleteId} className="flex-1">
                Begin Assessment <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        </div>
      </AppShell>
    )
  }

  // ── ADMINISTER ────────────────────────────────────────────────────────────
  if (step === 'administer' && selectedInstrument) {
    const questions = selectedInstrument.questions
    const q = questions[currentItem]
    const allAnswered = questions.every(qi => responses[qi.id] !== undefined)
    const answeredCount = Object.keys(responses).length
    const selectedAthlete = athletes.find(a => a.id === selectedAthleteId)

    return (
      <AppShell>
        <div className="max-w-xl mx-auto">
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-600">{selectedInstrument.code} · {selectedAthlete?.first_name} {selectedAthlete?.last_name}</p>
              <p className="text-sm text-gray-400">{answeredCount}/{questions.length} answered</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
            </div>
          </div>

          <Card className="p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-gray-400">Item {currentItem + 1} of {questions.length}</p>
              {q.reversed && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Reverse-scored</span>}
            </div>
            <p className="text-base font-medium text-gray-900 mb-6 leading-relaxed">{q.text}</p>
            <div className="space-y-2">
              {selectedInstrument.ratingScale.map((label, idx) => {
                const val = idx + 1
                const selected = responses[q.id] === val
                return (
                  <button key={val} onClick={() => answerItem(q.id, val)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                    }`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      selected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>{val}</span>
                    <span className="text-sm font-medium">{label}</span>
                    {selected && <CheckCircle size={16} className="ml-auto text-blue-500" />}
                  </button>
                )
              })}
            </div>
          </Card>

          <div className="flex gap-2 mb-5">
            <Button variant="secondary" onClick={() => setCurrentItem(c => Math.max(0, c - 1))} disabled={currentItem === 0}>
              <ChevronLeft size={16} />
            </Button>
            {currentItem < questions.length - 1 ? (
              <Button className="flex-1" onClick={() => setCurrentItem(c => c + 1)} disabled={!responses[q.id]}>
                Next <ChevronRight size={16} />
              </Button>
            ) : (
              <Button className="flex-1" disabled={!allAnswered || saving} loading={saving} onClick={finishAssessment}>
                <CheckCircle size={16} /> Score Assessment
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-5">
            {questions.map((qi, idx) => (
              <button key={qi.id} onClick={() => setCurrentItem(idx)}
                className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                  idx === currentItem ? 'bg-blue-500 text-white' :
                  responses[qi.id] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>{idx + 1}</button>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600">Clinical Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any clinical observations..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </AppShell>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────
  if (step === 'results' && selectedInstrument && lastResult) {
    const selectedAthlete = athletes.find(a => a.id === selectedAthleteId)
    const radarData = Object.entries(lastResult.subscaleScores).map(([subject, value]) => ({ subject: subject.split(' ')[0], value }))
    const interp = lastResult.interpretation

    return (
      <AppShell>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle size={28} className="text-green-500" />
            <div>
              <p className="font-bold text-gray-900 text-lg">{selectedInstrument.code} Complete</p>
              <p className="text-sm text-gray-500">{selectedAthlete?.first_name} {selectedAthlete?.last_name} · {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {interp && (
            <div className={`rounded-xl p-4 mb-5 border ${SCORE_COLORS[interp.color]}`}>
              <div className="flex items-center gap-2 mb-1">
                {interp.color === 'red' && <AlertTriangle size={16} />}
                <p className="font-bold text-base">{interp.level}</p>
                <span className="text-sm opacity-70">— Total: {lastResult.totalScore} / {selectedInstrument.totalRange[1]}</span>
              </div>
              <p className="text-sm leading-relaxed">{interp.interpretation}</p>
            </div>
          )}

          <Card className="p-5 mb-4">
            <p className="font-semibold text-gray-900 mb-4">Sub-scale Scores</p>
            <div className="space-y-3 mb-5">
              {selectedInstrument.subscales.map(sub => {
                const score = lastResult.subscaleScores[sub.name] ?? 0
                const pct = Math.min(((score - sub.range[0]) / (sub.range[1] - sub.range[0])) * 100, 100)
                return (
                  <div key={sub.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">{sub.name}</span>
                      <span className="text-gray-900 font-bold">{score} <span className="text-xs text-gray-400 font-normal">/ {sub.range[1]}</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div className={`h-full rounded-full ${sub.interpretation === 'high_bad' ? 'bg-red-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {sub.note && <p className="text-xs text-gray-400 mt-0.5">{sub.note}</p>}
                  </div>
                )
              })}
            </div>
            {radarData.length >= 3 && (
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Tooltip formatter={(v: number) => [v, 'Score']} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-5 mb-6">
            <p className="font-semibold text-gray-900 mb-3">Clinician Guidance</p>
            <ul className="space-y-2">
              {selectedInstrument.clinicianNotes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={resetToLibrary}>Library</Button>
            <Button className="flex-1" onClick={() => startAssessment(selectedInstrument)}>Administer Again</Button>
          </div>
        </div>
      </AppShell>
    )
  }

  return null
}

// ── Performance Profiling Components ─────────────────────────────────────────

function PerformanceProfilingSection({ athletes, profiles, filterAthleteId, onFilterChange, onNew, onDomainSelect }: any) {
  const byDomain = PROFILING_DOMAINS.reduce((acc: Record<string, any[]>, d) => {
    acc[d.id] = profiles.filter((p: any) => p.domain_id === d.id)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Performance Profiling</h2>
          <p className="text-xs text-gray-400 mt-0.5">Rate key psychological dimensions across 5 sport-performance domains · No licence required</p>
        </div>
        <div className="flex gap-2">
          <select value={filterAthleteId} onChange={e => onFilterChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All athletes</option>
            {athletes.map((a: any) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
          </select>
          <Button onClick={onNew}><Plus size={14} /> New Profile</Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROFILING_DOMAINS.map(domain => {
          const DomainIcon = domain.icon
          const domainProfiles = byDomain[domain.id] ?? []
          const latest = domainProfiles[0]
          const radarData = latest ? domain.dimensions.map(d => ({
            subject: getRadarLabel(d.label),
            value: latest.scores[d.key] ?? 0,
            fullMark: 10,
          })) : []

          return (
            <Card key={domain.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onDomainSelect(domain)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${domain.color}`}>
                    <DomainIcon size={11} /> {domain.label}
                  </span>
                  <p className="text-xs text-gray-400 leading-relaxed">{domain.description}</p>
                </div>
              </div>

              {latest && radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <RadarChart data={radarData} margin={{ top: 5, right: 15, bottom: 5, left: 15 }}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#6b7280' }} />
                    <Radar dataKey="value" stroke={domain.accent} fill={domain.accent} fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip formatter={(v: number) => [v + '/10', 'Score']} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-xl">
                  <p className="text-xs text-gray-400">No profiles yet</p>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">{domainProfiles.length} entries</span>
                <span className="text-xs font-medium text-blue-600 hover:text-blue-800">
                  + Add profile →
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Profile history */}
      {profiles.length > 0 && (
        <div className="border-t pt-5">
          <h3 className="font-semibold text-gray-900 mb-3">Profile History</h3>
          <div className="space-y-2">
            {profiles.slice(0, 20).map((p: any) => {
              const domain = PROFILING_DOMAINS.find(d => d.id === p.domain_id)
              if (!domain) return null
              const DomainIcon = domain.icon
              const avg = Object.values(p.scores as Record<string, number>).length
                ? (Object.values(p.scores as Record<string, number>).reduce((a, b) => a + b, 0) / Object.values(p.scores as Record<string, number>).length).toFixed(1)
                : '—'
              const DimScores = domain.dimensions.map(d => ({ name: getRadarLabel(d.label), score: p.scores[d.key] ?? 0 }))
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${domain.color}`}>
                      <DomainIcon size={10} /> {domain.label}
                    </span>
                    <span className="text-xs text-gray-400">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
                    <span className="ml-auto text-sm font-bold text-gray-900">{avg}<span className="text-xs font-normal text-gray-400">/10 avg</span></span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {DimScores.map(ds => (
                      <div key={ds.name} className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-lg">
                        <span className="text-gray-400 truncate max-w-24">{ds.name.split(' ')[0]}</span>
                        <span className="font-bold" style={{ color: ds.score >= 7 ? '#16a34a' : ds.score >= 4 ? '#d97706' : '#dc2626' }}>
                          {ds.score}
                        </span>
                      </div>
                    ))}
                  </div>
                  {p.notes && <p className="text-xs text-gray-400 mt-2 italic">{p.notes}</p>}
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileEntryModal({ domain, domains, athletes, athleteId, scores, notes, saving, onDomainChange, onAthleteChange, onScoreChange, onNotesChange, onSave, onClose }: any) {
  const radarData = domain.dimensions.map((d: any) => ({
    subject: getRadarLabel(d.label),
    value: scores[d.key] ?? 0,
    fullMark: 10,
  }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900">Performance Profile Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Domain selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Domain</p>
            <div className="flex flex-wrap gap-2">
              {domains.map((d: any) => {
                const DIcon = d.icon
                return (
                  <button key={d.id} onClick={() => onDomainChange(d)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                      domain.id === d.id ? `border-current ${d.color}` : 'border-gray-100 text-gray-500 hover:border-gray-200'
                    }`}>
                    <DIcon size={12} /> {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Athlete */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Athlete *</label>
            <select value={athleteId} onChange={e => onAthleteChange(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">— Select athlete —</option>
              {athletes.map((a: any) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
            </select>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Sliders */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{domain.label} — Rate each dimension 0–10</p>
              {domain.dimensions.map((dim: any) => {
                const val = scores[dim.key] ?? 0
                const color = val >= 7 ? '#16a34a' : val >= 4 ? '#d97706' : '#dc2626'
                return (
                  <div key={dim.key} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{dim.label}</p>
                        <p className="text-xs text-gray-400">{dim.desc}</p>
                      </div>
                      <span className="text-lg font-black ml-3" style={{ color }}>{val}</span>
                    </div>
                    <input type="range" min={0} max={10} step={1} value={val}
                      onChange={e => onScoreChange(dim.key, parseInt(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: domain.accent }} />
                    <div className="flex justify-between text-xs text-gray-300 mt-0.5">
                      <span>0 — Low</span><span>5 — Moderate</span><span>10 — Excellent</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Live radar preview */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Live Profile Preview</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Radar dataKey="value" stroke={domain.accent} fill={domain.accent} fillOpacity={0.3} strokeWidth={2} />
                  <Tooltip formatter={(v: number) => [v + '/10', 'Score']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Clinical Notes</label>
            <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={2}
              placeholder="Context, observations, comparison to baseline…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-xl">Cancel</button>
            <button onClick={onSave} disabled={!athleteId || saving}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 flex items-center gap-2"
              style={{ background: domain.accent }}>
              {saving ? 'Saving…' : <><CheckCircle size={14} /> Save Profile</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
