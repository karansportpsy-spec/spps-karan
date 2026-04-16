import { useState } from 'react'
import { Plus, FileText, Sparkles, Download, Printer } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Button, Card, Badge, Modal, Select, Input, Textarea, Spinner, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAthletes } from '@/hooks/useAthletes'
import { useAuth } from '@/contexts/AuthContext'
import { fmtDate } from '@/lib/utils'
import ShareReportButton from '@/components/practitioner/ShareReportButton'
import { callGroq } from '@/lib/groq'
import type { Report, ReportType } from '@/types'

const REPORT_TYPES: ReportType[] = ['progress', 'assessment_summary', 'session_summary', 'crisis', 'custom']

const TYPE_COLORS: Record<ReportType, string> = {
  progress:           'bg-blue-100 text-blue-700',
  assessment_summary: 'bg-purple-100 text-purple-700',
  session_summary:    'bg-emerald-100 text-emerald-700',
  crisis:             'bg-red-100 text-red-700',
  custom:             'bg-gray-100 text-gray-600',
}

// ── Data fetchers ─────────────────────────────────────────────

async function fetchAthleteData(athleteId: string, practitionerId: string) {
  const [sessionsRes, checkinsRes, assessmentsRes, interventionsRes] = await Promise.all([
    supabase.from('sessions').select('*').eq('athlete_id', athleteId).eq('practitioner_id', practitionerId).order('scheduled_at', { ascending: false }).limit(10),
    supabase.from('check_ins').select('*').eq('athlete_id', athleteId).eq('practitioner_id', practitionerId).order('checked_in_at', { ascending: false }).limit(20),
    supabase.from('assessments').select('*').eq('athlete_id', athleteId).eq('practitioner_id', practitionerId).order('administered_at', { ascending: false }).limit(10),
    supabase.from('interventions').select('*').eq('athlete_id', athleteId).eq('practitioner_id', practitionerId).order('created_at', { ascending: false }).limit(10),
  ])
  return {
    sessions: sessionsRes.data ?? [],
    checkins: checkinsRes.data ?? [],
    assessments: assessmentsRes.data ?? [],
    interventions: interventionsRes.data ?? [],
  }
}

function buildAthleteContext(athlete: any, data: any): string {
  const { sessions, checkins, assessments, interventions } = data

  const completedSessions = sessions.filter((s: any) => s.status === 'completed')
  const avgMood = checkins.length > 0
    ? (checkins.reduce((a: number, c: any) => a + c.mood_score, 0) / checkins.length).toFixed(1)
    : null
  const avgStress = checkins.length > 0
    ? (checkins.reduce((a: number, c: any) => a + c.stress_score, 0) / checkins.length).toFixed(1)
    : null
  const avgSleep = checkins.length > 0
    ? (checkins.reduce((a: number, c: any) => a + c.sleep_score, 0) / checkins.length).toFixed(1)
    : null
  const recentCheckin = checkins[0]
  const flaggedCheckins = checkins.filter((c: any) => c.flags && c.flags.length > 0)

  const lines: string[] = [
    `=== ATHLETE PROFILE ===`,
    `Name: ${athlete.first_name} ${athlete.last_name}`,
    `Sport: ${athlete.sport}${athlete.team ? ` (${athlete.team})` : ''}`,
    athlete.position ? `Position/Event: ${athlete.position}` : '',
    athlete.date_of_birth ? `DOB: ${athlete.date_of_birth}` : '',
    `Risk Level: ${athlete.risk_level}`,
    `Status: ${athlete.status}`,
    athlete.notes ? `Clinical Notes: ${athlete.notes}` : '',
    ``,
    `=== SESSION SUMMARY ===`,
    `Total sessions: ${sessions.length} (${completedSessions.length} completed)`,
    sessions.slice(0, 5).map((s: any) =>
      `- ${fmtDate(s.scheduled_at)}: ${s.session_type.replace(/_/g,' ')} (${s.status})${s.notes ? ' — ' + s.notes.slice(0, 150) : ''}`
    ).join('\n'),
    ``,
    `=== CHECK-IN DATA ===`,
    checkins.length > 0 ? [
      `Check-ins recorded: ${checkins.length}`,
      `Average Mood: ${avgMood}/10 | Average Stress: ${avgStress}/10 | Average Sleep: ${avgSleep}/10`,
      recentCheckin ? `Most recent (${fmtDate(recentCheckin.checked_in_at)}): Mood ${recentCheckin.mood_score}, Stress ${recentCheckin.stress_score}, Sleep ${recentCheckin.sleep_score}, Readiness ${recentCheckin.readiness_score}${recentCheckin.notes ? ` — ${recentCheckin.notes}` : ''}` : '',
      flaggedCheckins.length > 0 ? `Flagged check-ins: ${flaggedCheckins.length} (concerns: ${flaggedCheckins.flatMap((c: any) => c.flags).join(', ')})` : '',
    ].filter(Boolean).join('\n') : 'No check-in data recorded.',
    ``,
    `=== ASSESSMENT RESULTS ===`,
    assessments.length > 0 ? assessments.slice(0, 6).map((a: any) =>
      `- ${a.tool} (${fmtDate(a.administered_at)}): Total score ${a.total_score}. Subscales: ${Object.entries(a.scores).map(([k,v]) => `${k}=${v}`).join(', ')}${a.notes ? `. Notes: ${a.notes}` : ''}`
    ).join('\n') : 'No formal assessments recorded.',
    ``,
    `=== INTERVENTIONS LOG ===`,
    interventions.length > 0 ? interventions.slice(0, 8).map((i: any) =>
      `- ${i.category}: ${i.title}${i.rating ? ` (effectiveness: ${i.rating}/5)` : ''}${i.description ? ` — ${i.description.slice(0,100)}` : ''}`
    ).join('\n') : 'No interventions recorded.',
  ]

  return lines.filter(l => l !== undefined).join('\n')
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-gray-900 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mt-5 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700 mb-1">$1</li>')
    .replace(/\[(.+?)\]/g, '<span class="bg-yellow-100 text-yellow-800 px-1 rounded text-sm">[$1]</span>')
    .replace(/\n\n/g, '</p><p class="text-gray-700 mb-3">')
}

function useReports() {
  const { user } = useAuth()
  return useQuery<Report[]>({
    queryKey: ['reports', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, athlete:athletes(id,first_name,last_name,sport)')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Report[]
    },
  })
}

function useCreateReport() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Report, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('reports')
        .insert({ ...payload, practitioner_id: user!.id })
        .select().single()
      if (error) throw error
      return data as Report
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })
}

function exportReportTxt(report: Report) {
  const blob = new Blob([report.title + '\n\n' + report.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report.title.replace(/\s+/g, '-').toLowerCase()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function printReport(report: Report) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<html><head><title>${report.title}</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1f2937}
    h1,h2,h3{color:#111827}p{line-height:1.6}li{margin-left:20px}</style>
    </head><body>
    <h1>${report.title}</h1>
    <p style="color:#6b7280;font-size:14px">${fmtDate(report.generated_at)}${report.is_ai_generated ? ' · AI-generated' : ''}</p>
    <hr style="margin:20px 0">
    <div>${renderMarkdown(report.content)}</div>
    </body></html>`)
  win.document.close()
  win.print()
}

export default function ReportsPage() {
  const { user } = useAuth()
  const { data: reports = [], isLoading } = useReports()
  const { data: athletes = [] } = useAthletes()
  const createReport = useCreateReport()

  const [modalOpen, setModalOpen] = useState(false)
  const [viewReport, setViewReport] = useState<Report | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [filterAthleteId, setFilterAthleteId] = useState('')
  const [generatingStatus, setGeneratingStatus] = useState('')

  const [form, setForm] = useState({
    athlete_id: '',
    report_type: 'progress' as ReportType,
    title: '',
    content: '',
  })

  function openCreate() {
    setForm({ athlete_id: '', report_type: 'progress', title: '', content: '' })
    setAiGenerated(false)
    setModalOpen(true)
  }

  const athleteOptions = [
    { value: '', label: '— All athletes —' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]
  const filterOptions = [
    { value: '', label: 'All athletes' },
    ...athletes.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` })),
  ]
  const selectedAthlete = athletes.find(a => a.id === form.athlete_id)

  const filteredReports = filterAthleteId
    ? reports.filter(r => r.athlete_id === filterAthleteId)
    : reports

  async function generateContent() {
    if (!user) return
    setGenerating(true)
    setAiGenerated(false)
    setGeneratingStatus('Fetching athlete data…')
    try {
      // Pull real athlete data
      let athleteContext = ''
      if (selectedAthlete && form.athlete_id) {
        setGeneratingStatus('Loading sessions, assessments, check-ins…')
        const data = await fetchAthleteData(form.athlete_id, user.id)
        athleteContext = buildAthleteContext(selectedAthlete, data)
      }

      setGeneratingStatus('Generating report with AI…')
      const prompt = athleteContext
        ? `You are a sport psychology practitioner writing a professional ${form.report_type.replace(/_/g, ' ')} report.

Use ONLY the real athlete data below. Do NOT use placeholders or say "data not available" — use the actual numbers and clinical information provided.

${athleteContext}

Write a comprehensive, professional ${form.report_type.replace(/_/g, ' ')} report using this real data. Use markdown headings. Include:
- Brief summary of the athlete and presenting situation
- Key findings from assessments with actual scores
- Wellbeing trends from check-in data with actual averages
- Session progress and therapeutic work completed
- Interventions used and their effectiveness
- Clinical recommendations and next steps

Write in third person, professional clinical language. Use the real scores and dates from the data above.`
        : `Generate a professional sport psychology ${form.report_type.replace(/_/g, ' ')} report template. Include relevant sections with placeholder text in [brackets]. Format in markdown.`

      const text = await callGroq({ messages: [{ role: 'user', content: prompt }], max_tokens: 2000 })

      const athleteName = selectedAthlete ? `${selectedAthlete.first_name} ${selectedAthlete.last_name}` : ''
      setForm(f => ({
        ...f,
        content: text,
        title: f.title || `${form.report_type.replace(/_/g, ' ')} Report${athleteName ? ` — ${athleteName}` : ''} · ${new Date().toLocaleDateString()}`,
      }))
      setAiGenerated(true)
    } finally {
      setGenerating(false)
      setGeneratingStatus('')
    }
  }

  async function handleSave() {
    if (!form.title || !form.content) return
    setSaving(true)
    try {
      await createReport.mutateAsync({
        ...form,
        generated_at: new Date().toISOString(),
        is_ai_generated: aiGenerated,
      })
      setModalOpen(false)
    } catch (err: any) {
      alert(err?.message ?? 'Failed to save report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        subtitle={`${reports.length} generated`}
        action={<Button onClick={openCreate}><Plus size={16} />New Report</Button>}
      />

      <div className="mb-4">
        <select value={filterAthleteId} onChange={e => setFilterAthleteId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filteredReports.length === 0 ? (
        <EmptyState icon={<FileText size={48} />} title="No reports yet"
          action={<Button onClick={openCreate}><Plus size={16} />New Report</Button>} />
      ) : (
        <div className="space-y-3">
          {filteredReports.map(r => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewReport(r)}>
                  <p className="font-medium text-gray-900 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(r.generated_at)}{r.is_ai_generated ? ' · AI-generated' : ''}
                    {(r as any).athlete ? ` · ${(r as any).athlete.first_name} ${(r as any).athlete.last_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge label={r.report_type.replace(/_/g,' ')} className={TYPE_COLORS[r.report_type] ?? 'bg-gray-100'} />
                  <button onClick={() => exportReportTxt(r)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Download">
                    <Download size={15} />
                  </button>
                  <button onClick={() => printReport(r)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" title="Print / PDF">
                    <Printer size={15} />
                  </button>
                  {(r as any).athlete?.id && (
                    <ShareReportButton
                      reportId={r.id}
                      reportTitle={r.title}
                      reportType={r.report_type}
                      reportContent={r.content}
                      athleteId={(r as any).athlete.id}
                      athleteName={`${(r as any).athlete.first_name} ${(r as any).athlete.last_name}`}
                    />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Report" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Athlete (optional)" value={form.athlete_id}
              onChange={e => setForm(f => ({ ...f, athlete_id: e.target.value }))}
              options={athleteOptions} />
            <Select label="Report Type" value={form.report_type}
              onChange={e => setForm(f => ({ ...f, report_type: e.target.value as ReportType }))}
              options={REPORT_TYPES.map(t => ({ value: t, label: t.replace(/_/g,' ') }))} />
          </div>
          <Input label="Title" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Report title…" />

          {form.athlete_id && (
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              ✓ AI will pull real data: sessions, check-ins, assessments, and interventions for {selectedAthlete?.first_name} {selectedAthlete?.last_name}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Content</p>
            <Button variant="secondary" size="sm" onClick={generateContent} loading={generating}>
              <Sparkles size={13} />
              {generating ? generatingStatus || 'Generating…' : 'AI Generate'}
            </Button>
          </div>
          <Textarea value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={12} placeholder="Write or AI-generate report content…" />
          {aiGenerated && (
            <p className="text-xs text-blue-600 flex items-center gap-1">
              <Sparkles size={11} /> Generated using real athlete data — review before saving
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.title || !form.content}>
              Save Report
            </Button>
          </div>
        </div>
      </Modal>

      {/* View modal */}
      <Modal open={!!viewReport} onClose={() => setViewReport(null)} title={viewReport?.title ?? ''} maxWidth="max-w-2xl">
        {viewReport && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => exportReportTxt(viewReport)}>
                <Download size={13} /> Download
              </Button>
              <Button variant="secondary" size="sm" onClick={() => printReport(viewReport)}>
                <Printer size={13} /> Print / PDF
              </Button>
              {(viewReport as any).athlete?.id && (
                <ShareReportButton
                  reportId={viewReport.id}
                  reportTitle={viewReport.title}
                  reportType={viewReport.report_type}
                  reportContent={viewReport.content}
                  athleteId={(viewReport as any).athlete.id}
                  athleteName={`${(viewReport as any).athlete.first_name} ${(viewReport as any).athlete.last_name}`}
                />
              )}
            </div>
            <div className="prose prose-sm max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewReport.content) }} />
          </div>
        )}
      </Modal>
    </AppShell>
  )
}
