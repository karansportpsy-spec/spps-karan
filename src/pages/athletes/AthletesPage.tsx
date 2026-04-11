// AthletesPage.tsx — enhanced export + delete athlete with cascade + i18n
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, UserRound, Download, Upload, FileText, Trash2, CheckSquare, Square, AlertTriangle, Shield } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Card, Button, Badge, Avatar, Modal, Input, Select, Spinner, EmptyState } from '@/components/ui'
import { useAthletes, useCreateAthlete, useUpdateAthlete } from '@/hooks/useAthletes'
import { riskColor, statusColor, fmtDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Athlete, RiskLevel, AthleteStatus } from '@/types'
import AthleteImportModal from '@/components/AthleteImportModal'
import EnableAthletePortal from '@/components/EnableAthletePortal'
import { generateAthleteUID, needsUID } from '@/lib/athleteUID'

const BLANK: Omit<Athlete, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'> = {
  first_name: '', last_name: '', email: '', phone: '', sport: '', team: '',
  position: '', date_of_birth: '', notes: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  status: 'active', risk_level: 'low',
  uid_code: '',
}

// ── Full data export ───────────────────────────────────────────────────────────

async function fetchFullAthleteData(athleteIds: string[], practitionerId: string) {
  const [sessionsRes, checkinsRes, assessmentsRes, interventionsRes, reportsRes] = await Promise.all([
    supabase.from('sessions').select('*').in('athlete_id', athleteIds).eq('practitioner_id', practitionerId),
    supabase.from('check_ins').select('*').in('athlete_id', athleteIds).eq('practitioner_id', practitionerId),
    supabase.from('assessments').select('*').in('athlete_id', athleteIds).eq('practitioner_id', practitionerId),
    supabase.from('interventions').select('*').in('athlete_id', athleteIds).eq('practitioner_id', practitionerId),
    supabase.from('reports').select('*').in('athlete_id', athleteIds).eq('practitioner_id', practitionerId),
  ])
  return {
    sessions:      sessionsRes.data ?? [],
    checkins:      checkinsRes.data ?? [],
    assessments:   assessmentsRes.data ?? [],
    interventions: interventionsRes.data ?? [],
    reports:       reportsRes.data ?? [],
  }
}

function toCSVRow(values: (string | number | boolean | null | undefined)[]) {
  return values.map(v => {
    if (v === null || v === undefined) return ''
    const str = String(v).replace(/"/g, '""').replace(/\n/g, ' ')
    return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
  }).join(',')
}

async function exportFullCSV(athletes: Athlete[], practitionerId: string) {
  const ids = athletes.map(a => a.id)
  if (!ids.length) return

  const { sessions, checkins, assessments, interventions, reports } = await fetchFullAthleteData(ids, practitionerId)

  const athleteById = Object.fromEntries(athletes.map(a => [a.id, a]))

  const lines: string[] = [
    '=== SPPS FULL EXPORT ===',
    `Generated: ${new Date().toLocaleString()}`,
    `Athletes: ${athletes.length}`,
    '',
    // ── Athletes sheet
    '=== ATHLETES ===',
    toCSVRow(['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'DOB', 'Sport', 'Team', 'Position', 'Status', 'Risk Level', 'Emergency Contact', 'Emergency Phone', 'Clinical Notes', 'Added']),
    ...athletes.map(a => toCSVRow([
      a.id, a.first_name, a.last_name, a.email, a.phone,
      a.date_of_birth, a.sport, a.team, a.position,
      a.status, a.risk_level,
      a.emergency_contact_name, a.emergency_contact_phone,
      a.notes, fmtDate(a.created_at),
    ])),
    '',
    // ── Sessions sheet
    '=== SESSIONS ===',
    toCSVRow(['Athlete', 'Date', 'Type', 'Status', 'Duration (min)', 'Location', 'Risk Assessment', 'Goals', 'Notes', 'Follow-up Required']),
    ...sessions.map((s: any) => {
      const a = athleteById[s.athlete_id]
      return toCSVRow([
        a ? `${a.first_name} ${a.last_name}` : s.athlete_id,
        fmtDate(s.scheduled_at), s.session_type, s.status,
        s.duration_minutes, s.location,
        s.risk_assessment, s.goals, s.notes,
        s.follow_up_required ? 'Yes' : 'No',
      ])
    }),
    '',
    // ── Check-ins sheet
    '=== DAILY CHECK-INS ===',
    toCSVRow(['Athlete', 'Date', 'Mood', 'Stress', 'Sleep', 'Motivation', 'Readiness', 'Energy', 'Confidence', 'Focus', 'Recovery', 'Flags', 'Notes']),
    ...checkins.map((c: any) => {
      const a = athleteById[c.athlete_id]
      return toCSVRow([
        a ? `${a.first_name} ${a.last_name}` : c.athlete_id,
        fmtDate(c.checked_in_at),
        c.mood_score, c.stress_score, c.sleep_score,
        c.motivation_score, c.readiness_score,
        c.energy_score ?? '', c.confidence_score ?? '', c.focus_score ?? '', c.recovery_score ?? '',
        (c.flags ?? []).join('; '), c.notes,
      ])
    }),
    '',
    // ── Assessments sheet
    '=== ASSESSMENTS ===',
    toCSVRow(['Athlete', 'Tool', 'Date', 'Total Score', 'Subscale Scores', 'Notes']),
    ...assessments.map((a: any) => {
      const ath = athleteById[a.athlete_id]
      return toCSVRow([
        ath ? `${ath.first_name} ${ath.last_name}` : a.athlete_id,
        a.tool, fmtDate(a.administered_at), a.total_score,
        Object.entries(a.scores ?? {}).map(([k, v]) => `${k}=${v}`).join(' | '),
        a.notes,
      ])
    }),
    '',
    // ── Interventions sheet
    '=== INTERVENTIONS ===',
    toCSVRow(['Athlete', 'Category', 'Title', 'Description', 'Effectiveness (1-5)', 'Outcome', 'Date']),
    ...interventions.map((i: any) => {
      const ath = athleteById[i.athlete_id]
      return toCSVRow([
        ath ? `${ath.first_name} ${ath.last_name}` : i.athlete_id,
        i.category, i.title, i.description, i.rating, i.outcome,
        fmtDate(i.created_at),
      ])
    }),
    '',
    // ── Reports sheet
    '=== REPORTS ===',
    toCSVRow(['Athlete', 'Title', 'Type', 'Date', 'AI Generated', 'Content Preview']),
    ...reports.map((r: any) => {
      const ath = athleteById[r.athlete_id ?? '']
      return toCSVRow([
        ath ? `${ath.first_name} ${ath.last_name}` : r.athlete_id ?? 'N/A',
        r.title, r.report_type, fmtDate(r.generated_at),
        r.is_ai_generated ? 'Yes' : 'No',
        (r.content ?? '').slice(0, 200),
      ])
    }),
  ]

  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `SPPS_Full_Export_${athletes.length}athletes_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ── Delete athlete with cascade ───────────────────────────────────────────────

async function deleteAthleteWithCascade(athleteId: string) {
  // Delete in dependency order
  await supabase.from('reports').delete().eq('athlete_id', athleteId)
  await supabase.from('interventions').delete().eq('athlete_id', athleteId)
  await supabase.from('assessments').delete().eq('athlete_id', athleteId)
  await supabase.from('check_ins').delete().eq('athlete_id', athleteId)
  await supabase.from('sessions').delete().eq('athlete_id', athleteId)
  const { error } = await supabase.from('athletes').delete().eq('id', athleteId)
  if (error) throw error
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AthletesPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { data: athletes = [], isLoading, refetch } = useAthletes()
  const createAthlete = useCreateAthlete()
  const updateAthlete = useUpdateAthlete()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<AthleteStatus | 'all'>('all')
  const [filterRisk, setFilterRisk] = useState<RiskLevel | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Athlete | null>(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Selection state for bulk export
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Athlete | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Export state
  const [exporting, setExporting] = useState(false)

  function openCreate() { setEditing(null); setForm(BLANK); setModalOpen(true) }
  function openEdit(a: Athlete) { setEditing(a); setForm({ ...a }); setModalOpen(true) }
  function set(k: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function handleSave() {
    setSaving(true)
    try {
      if (editing) await updateAthlete.mutateAsync({ id: editing.id, ...form })
      else await createAthlete.mutateAsync(form)
      setModalOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteAthleteWithCascade(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      console.error(err)
      alert('Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleExport(mode: 'all' | 'selected') {
    if (!user) return
    setExporting(true)
    try {
      const toExport = mode === 'all' ? filtered : filtered.filter(a => selectedIds.has(a.id))
      if (!toExport.length) { alert('No athletes to export.'); return }
      await exportFullCSV(toExport, user.id)
    } finally {
      setExporting(false)
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)))
    }
  }

  const filtered = athletes.filter(a => {
    const q = search.toLowerCase()
    const match = !q || `${a.first_name} ${a.last_name} ${a.sport} ${a.team ?? ''}`.toLowerCase().includes(q)
    const st = filterStatus === 'all' || a.status === filterStatus
    const rk = filterRisk === 'all' || a.risk_level === filterRisk
    return match && st && rk
  })

  function calcAge(dob?: string) {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  }

  return (
    <AppShell>
      <PageHeader
        title={t.ath_title}
        subtitle={`${athletes.length} ${t.total.toLowerCase()}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {selectionMode ? (
              <>
                <Button variant="secondary" onClick={toggleAll}>
                  {selectedIds.size === filtered.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedIds.size > 0 && (
                  <Button variant="secondary" onClick={() => handleExport('selected')} loading={exporting}>
                    <Download size={16} /> {t.ath_exportSelected} ({selectedIds.size})
                  </Button>
                )}
                <Button variant="secondary" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()) }}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => handleExport('all')} loading={exporting}>
                  <Download size={16} /> {t.ath_exportAll}
                </Button>
                <Button variant="secondary" onClick={() => setSelectionMode(true)}>
                  <CheckSquare size={16} /> Select & Export
                </Button>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> {t.ath_importFromFile}
                </Button>
                <Button onClick={openCreate}>
                  <Plus size={16} /> {t.ath_addAthlete}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Export + UID note */}
      <div className="mb-4 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
        <p className="flex items-center gap-1.5 font-semibold text-amber-700">
          <Shield size={11} /> Confidentiality — Athlete UID System
        </p>
        <p className="text-amber-600 leading-relaxed">
          Each athlete is assigned a <strong>WMP-YYYY-XXXXXX</strong> UID at onboarding.
          All <strong>PDF and .txt exports</strong> use only the UID — no names, DOB, or contact details.
          <strong>CSV exports</strong> include full details and are for internal practitioner use only.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`${t.search} athletes…`}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="all">{t.ath_allStatuses}</option>
          <option value="active">{t.ath_status_active}</option>
          <option value="inactive">{t.ath_status_inactive}</option>
          <option value="on_hold">{t.ath_status_on_hold}</option>
        </select>
        <select value={filterRisk} onChange={e => setFilterRisk(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="all">{t.ath_allRisks}</option>
          <option value="low">{t.ath_risk_low}</option>
          <option value="moderate">{t.ath_risk_moderate}</option>
          <option value="high">{t.ath_risk_high}</option>
          <option value="critical">{t.ath_risk_critical}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserRound size={48} />}
          title={t.ath_noAthletes}
          description={search ? 'Try adjusting your search or filters' : 'Add your first athlete to get started'}
          action={!search ? <Button onClick={openCreate}><Plus size={16} /> {t.ath_addAthlete}</Button> : undefined}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a => {
            const age = calcAge(a.date_of_birth)
            const isSelected = selectedIds.has(a.id)
            return (
              <Card
                key={a.id}
                onClick={() => selectionMode ? toggleSelection(a.id) : openEdit(a)}
                className={`p-5 transition-all ${selectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  {selectionMode && (
                    <div className="mt-1 shrink-0">
                      {isSelected
                        ? <CheckSquare size={18} className="text-blue-500" />
                        : <Square size={18} className="text-gray-300" />
                      }
                    </div>
                  )}
                  <Avatar firstName={a.first_name} lastName={a.last_name} src={a.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{a.first_name} {a.last_name}</p>
                    {a.uid_code && (
                      <p className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mb-0.5">
                        {a.uid_code}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 truncate">
                      {a.sport}{a.team ? ` · ${a.team}` : ''}{age ? ` · ${t.age} ${age}` : ''}
                    </p>
                    {a.position && <p className="text-xs text-gray-400 truncate">{a.position}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={a.status.replace('_', ' ')} className={statusColor(a.status)} />
                  <Badge label={a.risk_level} className={riskColor(a.risk_level)} />
                </div>

                {a.created_at && <p className="text-xs text-gray-400 mt-3">{t.added} {fmtDate(a.created_at)}</p>}

                {!selectionMode && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/athletes/${a.id}/case`) }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors border border-violet-200"
                    >
                      <FileText size={13} />
                      {t.ath_caseFormulation}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(a) }}
                      className="flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200"
                      title={t.ath_deleteAthlete}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* New / Edit Athlete Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `${t.edit} Athlete` : t.ath_addAthlete} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={form.first_name} onChange={set('first_name')} required />
            <Input label="Last name" value={form.last_name} onChange={set('last_name')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date of Birth" type="date" value={form.date_of_birth ?? ''} onChange={set('date_of_birth')} />
            <Input label="Email" type="email" value={form.email ?? ''} onChange={set('email')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone" value={form.phone ?? ''} onChange={set('phone')} />
            <Input label="Sport" value={form.sport} onChange={set('sport')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Team" value={form.team ?? ''} onChange={set('team')} />
            <Input label="Position / Event" value={form.position ?? ''} onChange={set('position')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Status" value={form.status} onChange={set('status') as any}
              options={[{ value: 'active', label: t.ath_status_active }, { value: 'inactive', label: t.ath_status_inactive }, { value: 'on_hold', label: t.ath_status_on_hold }]} />
            <Select label="Risk Level" value={form.risk_level} onChange={set('risk_level') as any}
              options={[{ value: 'low', label: t.ath_risk_low }, { value: 'moderate', label: t.ath_risk_moderate }, { value: 'high', label: t.ath_risk_high }, { value: 'critical', label: t.ath_risk_critical }]} />
          </div>
          <div className="border-t pt-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Contact Name" value={form.emergency_contact_name ?? ''} onChange={set('emergency_contact_name')} />
              <Input label="Contact Phone" value={form.emergency_contact_phone ?? ''} onChange={set('emergency_contact_phone')} />
            </div>
          </div>
          <div className="border-t pt-3">
            <label className="text-sm font-medium text-gray-700">Clinical Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={set('notes')}
              rows={3}
              placeholder="Any relevant clinical notes..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Athlete Portal — only when editing an existing athlete */}
          {editing && (
            <div className="border-t pt-3">
              <EnableAthletePortal
                athleteId={editing.id}
                athleteFirstName={editing.first_name}
                athleteEmail={editing.email}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t.cancel}</Button>
            <Button onClick={handleSave} loading={saving}>{t.save} Athlete</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t.ath_deleteAthlete}
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {/* Athlete preview */}
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <Avatar firstName={deleteTarget.first_name} lastName={deleteTarget.last_name} size="md" />
              <div>
                <p className="font-semibold text-gray-900">{deleteTarget.first_name} {deleteTarget.last_name}</p>
                <p className="text-sm text-gray-500">{deleteTarget.sport}{deleteTarget.team ? ` · ${deleteTarget.team}` : ''}</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">{t.ath_deleteAthlete}</p>
                  <p className="text-sm text-red-700 mt-1">{t.ath_deleteConfirm}</p>
                  <p className="text-xs text-red-500 mt-2 font-medium">{t.ath_deleteWarning}</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
              The following data will be permanently deleted:
              <br />• All sessions & session notes
              <br />• All daily check-in records
              <br />• All assessment results
              <br />• All intervention logs
              <br />• All generated reports
              <br />• Athlete profile
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>{t.cancel}</Button>
              <Button
                onClick={handleDelete}
                loading={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 size={15} />
                {t.delete} Permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <AthleteImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => setImportOpen(false)}
      />
    </AppShell>
  )
}
