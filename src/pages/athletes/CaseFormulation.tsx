import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Download, Printer, ArrowLeft, AlertTriangle, Activity, Brain,
  Target, Calendar, CheckCircle, FileText, Sparkles, User,
  Phone, Mail, Shield, TrendingUp, TrendingDown, Clock,
  ChevronRight, BarChart2, Heart, Zap, FileDown, Folder,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Button, Card, Badge, Avatar, Spinner } from '@/components/ui'
import { useAthletes } from '@/hooks/useAthletes'
import { useSessions, useCheckIns, useAssessments, useInterventions } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { callGroq } from '@/lib/groq'
import { riskColor, statusColor, fmtDate } from '@/lib/utils'
import { anonymise, redactNote, ANONYMISATION_DISCLAIMER } from '@/lib/athleteUID'
import AthleteDocumentsPanel, { useAthleteDocuments } from '@/components/AthleteDocumentsPanel'
import { FlaskConical, Watch, Dumbbell, Eye } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, CartesianGrid, Legend,
} from 'recharts'
import type { Report, ReportType } from '@/types'

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',      label: 'Overview',      icon: User },
  { id: 'sessions',      label: 'Sessions',       icon: Calendar },
  { id: 'checkins',      label: 'Check-ins',      icon: Activity },
  { id: 'assessments',   label: 'Assessments',    icon: Brain },
  { id: 'interventions', label: 'Interventions',  icon: Target },
  { id: 'reports',       label: 'Reports',        icon: FileText },
  { id: 'documents',     label: 'Documents',      icon: Folder },
  { id: 'physio',        label: 'Physio & Wearables', icon: Activity },
  { id: 'lab',           label: 'Lab Technology',  icon: FlaskConical },
  { id: 'neuro',         label: 'Neurocognitive',  icon: Eye },
  { id: 'profiling',     label: 'Performance Profile', icon: Target },
  { id: 'ai',            label: 'AI Summary',     icon: Sparkles },
] as const

type TabId = typeof TABS[number]['id']  // includes 'documents'

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useAthleteNeuro(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['neuro', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('neurocognitive')
        .select('*, athlete:athletes(first_name,last_name,sport)')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

function useAthletePhysio(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['physio', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('psychophysiology')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

function useAthleteLabSessions(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lab_sessions', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_sessions')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('session_date', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

function useAthletePerfProfiles(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['perf_profiles', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_profiles')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

function useAthleteReports(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Report[]>({
    queryKey: ['reports', 'athlete', athleteId, user?.id],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Report[]
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dob?: string) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
}

function ScorePill({ value, max = 10 }: { value: number; max?: number }) {
  const pct = value / max
  const cls = pct >= 0.7 ? 'text-emerald-700 bg-emerald-50' : pct >= 0.5 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {value}<span className="opacity-50">/{max}</span>
    </span>
  )
}

function SectionHeader({ icon: Icon, title, count, color = 'blue' }: { icon: any; title: string; count?: number; color?: string }) {
  const clr: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
  }
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border mb-4 ${clr[color]}`}>
      <Icon size={16} />
      <span className="font-semibold text-sm">{title}</span>
      {count !== undefined && (
        <span className="ml-auto text-xs font-medium opacity-70">{count} records</span>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, trend, color = 'gray' }: { label: string; value: string | number; sub?: string; trend?: 'up' | 'down'; color?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <div className="flex items-end gap-1">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {trend && (trend === 'up'
          ? <TrendingUp size={14} className="text-emerald-500 mb-1" />
          : <TrendingDown size={14} className="text-red-400 mb-1" />
        )}
      </div>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyData({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
        <BarChart2 size={18} className="text-gray-300" />
      </div>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ athlete, sessions, checkins, assessments, interventions, reports }: any) {
  const age = calcAge(athlete.date_of_birth)
  const completedSessions = sessions.filter((s: any) => s.status === 'completed')
  const avgMood = checkins.length > 0
    ? (checkins.reduce((a: number, c: any) => a + c.mood_score, 0) / checkins.length).toFixed(1)
    : '—'
  const avgStress = checkins.length > 0
    ? (checkins.reduce((a: number, c: any) => a + c.stress_score, 0) / checkins.length).toFixed(1)
    : '—'
  const recentCheckin = checkins[0]
  const flaggedCount = checkins.filter((c: any) => c.flags?.length > 0).length
  const activeInterventions = interventions.filter((i: any) => i.status === 'active' || !i.status)

  return (
    <div className="space-y-6">
      {/* Athlete Bio */}
      <div>
        <SectionHeader icon={User} title="Athlete Profile" color="blue" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <Avatar firstName={athlete.first_name} lastName={athlete.last_name} src={athlete.avatar_url} size="lg" />
              <div>
                <p className="text-lg font-bold text-gray-900">{athlete.first_name} {athlete.last_name}</p>
                <p className="text-sm text-gray-500">{athlete.sport}{athlete.team ? ` · ${athlete.team}` : ''}</p>
                {athlete.position && <p className="text-xs text-gray-400">{athlete.position}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge label={athlete.status.replace('_', ' ')} className={statusColor(athlete.status)} />
              <Badge label={`Risk: ${athlete.risk_level}`} className={riskColor(athlete.risk_level)} />
              {age && <Badge label={`Age ${age}`} className="bg-gray-100 text-gray-600" />}
            </div>
            <div className="space-y-2 text-sm">
              {athlete.date_of_birth && (
                <div className="flex gap-2 text-gray-600">
                  <Calendar size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>DOB: {new Date(athlete.date_of_birth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
              {athlete.email && (
                <div className="flex gap-2 text-gray-600">
                  <Mail size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>{athlete.email}</span>
                </div>
              )}
              {athlete.phone && (
                <div className="flex gap-2 text-gray-600">
                  <Phone size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>{athlete.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {(athlete.emergency_contact_name || athlete.emergency_contact_phone) && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <Shield size={12} /> Emergency Contact
                </p>
                {athlete.emergency_contact_name && <p className="text-sm font-medium text-gray-900">{athlete.emergency_contact_name}</p>}
                {athlete.emergency_contact_phone && <p className="text-sm text-gray-600">{athlete.emergency_contact_phone}</p>}
              </div>
            )}
            {athlete.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-600 mb-2">Clinical Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed">{athlete.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key Stats */}
      <div>
        <SectionHeader icon={Activity} title="At a Glance" color="teal" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Sessions" value={sessions.length} sub={`${completedSessions.length} completed`} />
          <StatCard label="Check-ins" value={checkins.length} sub={flaggedCount > 0 ? `${flaggedCount} flagged` : 'No flags'} />
          <StatCard label="Avg Mood" value={avgMood} sub="out of 10" />
          <StatCard label="Avg Stress" value={avgStress} sub="out of 10" />
          <StatCard label="Assessments" value={assessments.length} sub="completed" />
          <StatCard label="Interventions" value={interventions.length} sub={`${activeInterventions.length} active`} />
          <StatCard label="Reports" value={reports.length} sub="generated" />
          <StatCard label="Risk Level" value={athlete.risk_level.charAt(0).toUpperCase() + athlete.risk_level.slice(1)} />
        </div>
      </div>

      {/* Recent Check-in Snapshot */}
      {recentCheckin && (
        <div>
          <SectionHeader icon={Heart} title="Latest Check-in Snapshot" color="rose" />
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <p className="text-xs text-gray-400 mb-4">{fmtDate(recentCheckin.checked_in_at)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Mood', val: recentCheckin.mood_score },
                { label: 'Stress', val: recentCheckin.stress_score },
                { label: 'Sleep', val: recentCheckin.sleep_score },
                { label: 'Motivation', val: recentCheckin.motivation_score },
                { label: 'Readiness', val: recentCheckin.readiness_score },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <ScorePill value={val} />
                </div>
              ))}
            </div>
            {recentCheckin.flags?.length > 0 && (
              <div className="mt-3 flex gap-1 flex-wrap">
                {recentCheckin.flags.map((f: string) => (
                  <span key={f} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            )}
            {recentCheckin.notes && (
              <p className="text-sm text-gray-500 mt-3 italic">"{recentCheckin.notes}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Sessions ─────────────────────────────────────────────────────────────

function SessionsTab({ sessions }: { sessions: any[] }) {
  if (!sessions.length) return <EmptyData message="No sessions recorded yet." />

  const statusCounts = sessions.reduce((acc: Record<string, number>, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  const typeCounts = sessions.reduce((acc: Record<string, number>, s) => {
    acc[s.session_type] = (acc[s.session_type] ?? 0) + 1
    return acc
  }, {})

  const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))

  // Sessions per month
  const monthMap: Record<string, number> = {}
  sessions.forEach(s => {
    const month = new Date(s.scheduled_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    monthMap[month] = (monthMap[month] ?? 0) + 1
  })
  const monthData = Object.entries(monthMap).slice(-8).map(([month, count]) => ({ month, count }))

  const statusColors: Record<string, string> = {
    completed: 'bg-emerald-500',
    scheduled: 'bg-blue-400',
    cancelled: 'bg-gray-300',
    no_show: 'bg-red-300',
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={Calendar} title="Session History" count={sessions.length} color="blue" />

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => (
          <StatCard key={status} label={status.replace('_', ' ')} value={count} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-3">Sessions by Type</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={typeData} margin={{ left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-3">Sessions Over Time</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthData} margin={{ left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Session list */}
      <div className="space-y-2">
        {sessions.map((s: any) => (
          <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusColors[s.status] ?? 'bg-gray-300'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-800 capitalize">
                  {s.session_type.replace(/_/g, ' ')}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{fmtDate(s.scheduled_at)}</span>
                  <Badge label={s.status.replace('_', ' ')} className={
                    s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    s.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  } />
                </div>
              </div>
              {s.duration_minutes && <p className="text-xs text-gray-400 mt-0.5"><Clock size={10} className="inline mr-1" />{s.duration_minutes} min</p>}
              {s.notes && <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{s.notes}</p>}
              {s.goals && <p className="text-xs text-indigo-600 mt-1">Goals: {s.goals}</p>}
              {s.homework && <p className="text-xs text-amber-600 mt-1">Homework: {s.homework}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Check-ins ────────────────────────────────────────────────────────────

function CheckInsTab({ checkins }: { checkins: any[] }) {
  if (!checkins.length) return <EmptyData message="No check-ins recorded yet." />

  const avg = (key: string) =>
    (checkins.reduce((a, c) => a + (c[key] ?? 0), 0) / checkins.length).toFixed(1)

  const trendData = [...checkins].reverse().slice(-20).map(c => ({
    date: fmtDate(c.checked_in_at),
    Mood: c.mood_score,
    Stress: c.stress_score,
    Sleep: c.sleep_score,
    Motivation: c.motivation_score,
    Readiness: c.readiness_score,
  }))

  const flaggedCheckins = checkins.filter(c => c.flags?.length > 0)
  const allFlags = checkins.flatMap(c => c.flags ?? [])
  const flagCounts = allFlags.reduce((acc: Record<string, number>, f) => {
    acc[f] = (acc[f] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <SectionHeader icon={Activity} title="Daily Check-ins" count={checkins.length} color="green" />

      {/* Averages */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Avg Mood', key: 'mood_score' },
          { label: 'Avg Stress', key: 'stress_score' },
          { label: 'Avg Sleep', key: 'sleep_score' },
          { label: 'Avg Motivation', key: 'motivation_score' },
          { label: 'Avg Readiness', key: 'readiness_score' },
        ].map(({ label, key }) => (
          <StatCard key={key} label={label} value={avg(key)} sub="/ 10" />
        ))}
      </div>

      {/* Trend chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 mb-3">Wellbeing Trends (last 20 check-ins)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData} margin={{ left: -20, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
            <Tooltip />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Mood" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Stress" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Sleep" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Motivation" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Readiness" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Flags summary */}
      {Object.keys(flagCounts).length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-red-600 mb-3 flex items-center gap-1">
            <AlertTriangle size={12} /> Flagged Concerns ({flaggedCheckins.length} check-ins)
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(flagCounts).map(([flag, count]) => (
              <span key={flag} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                {flag} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Check-in table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Mood', 'Stress', 'Sleep', 'Motivation', 'Readiness', 'Flags', 'Notes'].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checkins.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(c.checked_in_at)}</td>
                  {[c.mood_score, c.stress_score, c.sleep_score, c.motivation_score, c.readiness_score].map((v, i) => (
                    <td key={i} className="py-2 px-3">
                      <ScorePill value={v} />
                    </td>
                  ))}
                  <td className="py-2 px-3 text-xs text-red-500">{c.flags?.join(', ') || '—'}</td>
                  <td className="py-2 px-3 text-xs text-gray-400 max-w-40 truncate">{c.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Assessments ──────────────────────────────────────────────────────────

function AssessmentsTab({ assessments }: { assessments: any[] }) {
  if (!assessments.length) return <EmptyData message="No assessments administered yet." />

  const byTool = assessments.reduce((acc: Record<string, any[]>, a) => {
    if (!acc[a.tool]) acc[a.tool] = []
    acc[a.tool].push(a)
    return acc
  }, {})

  const toolColors: Record<string, string> = {
    APAS: 'bg-blue-100 text-blue-700',
    PSAS: 'bg-purple-100 text-purple-700',
    SCES: 'bg-emerald-100 text-emerald-700',
    TRPS: 'bg-amber-100 text-amber-700',
    MFAS: 'bg-rose-100 text-rose-700',
    CFAS: 'bg-indigo-100 text-indigo-700',
    AMHS: 'bg-red-100 text-red-700',
    DEPSCR: 'bg-orange-100 text-orange-700',
    ANXSCR: 'bg-pink-100 text-pink-700',
    SQI: 'bg-sky-100 text-sky-700',
    AUSC: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={Brain} title="Assessment Results" count={assessments.length} color="purple" />

      {/* Per-tool sections */}
      {Object.entries(byTool).map(([tool, list]) => {
        const latest = list[0]
        const hasHistory = list.length > 1

        // Build trend for this tool
        const trendData = [...list].reverse().map(a => ({
          date: fmtDate(a.administered_at),
          Total: a.total_score,
        }))

        const radarData = Object.entries(latest.scores ?? {}).map(([subject, value]) => ({
          subject: subject.split(' ')[0],
          value: value as number,
        }))

        return (
          <div key={tool} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${toolColors[tool] ?? 'bg-gray-100 text-gray-600'}`}>{tool}</span>
                <span className="text-sm text-gray-500">{list.length} administration{list.length > 1 ? 's' : ''}</span>
              </div>
              <span className="text-xs text-gray-400">Last: {fmtDate(latest.administered_at)}</span>
            </div>

            {/* Latest scores */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">Latest Subscale Scores</p>
              <div className="space-y-2">
                {Object.entries(latest.scores ?? {}).map(([sub, val]) => {
                  const v = val as number
                  return (
                    <div key={sub}>
                      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                        <span>{sub}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min((v / 30) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Total: <span className="font-semibold text-gray-700">{latest.total_score}</span>
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Radar */}
              {radarData.length >= 3 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Subscale Profile</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                      <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Trend */}
              {hasHistory && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Total Score Trend</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={trendData} margin={{ left: -20 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {latest.notes && (
              <div className="mt-3 bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Clinician Notes</p>
                <p className="text-xs text-gray-600 leading-relaxed">{latest.notes}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Interventions ────────────────────────────────────────────────────────

function InterventionsTab({ interventions }: { interventions: any[] }) {
  if (!interventions.length) return <EmptyData message="No interventions logged yet." />

  const byCat = interventions.reduce((acc: Record<string, any[]>, i) => {
    if (!acc[i.category]) acc[i.category] = []
    acc[i.category].push(i)
    return acc
  }, {})

  const catData = Object.entries(byCat).map(([name, list]) => ({
    name: name.replace(/_/g, ' '),
    count: list.length,
    avgRating: list.filter(i => i.rating).length
      ? (list.reduce((a, i) => a + (i.rating ?? 0), 0) / list.filter(i => i.rating).length).toFixed(1)
      : null,
  }))

  const avgEffectiveness = interventions.filter(i => i.rating).length
    ? (interventions.reduce((a, i) => a + (i.rating ?? 0), 0) / interventions.filter(i => i.rating).length).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      <SectionHeader icon={Target} title="Interventions" count={interventions.length} color="amber" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Interventions" value={interventions.length} />
        <StatCard label="Categories Used" value={Object.keys(byCat).length} />
        {avgEffectiveness && <StatCard label="Avg Effectiveness" value={`${avgEffectiveness}/5`} />}
      </div>

      {/* Category breakdown chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 mb-3">Interventions by Category</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={catData} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Interventions grouped by category */}
      {Object.entries(byCat).map(([cat, list]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            {cat.replace(/_/g, ' ')} ({list.length})
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((i: any) => (
              <div key={i.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{i.title}</p>
                  {i.rating && (
                    <div className="flex gap-0.5 shrink-0 ml-2">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className={`text-xs ${s <= i.rating ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                      ))}
                    </div>
                  )}
                </div>
                {i.description && (
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{i.description}</p>
                )}
                {i.outcome && (
                  <p className="text-xs text-emerald-600 mt-1 leading-relaxed">Outcome: {i.outcome}</p>
                )}
                {i.created_at && (
                  <p className="text-xs text-gray-300 mt-2">{fmtDate(i.created_at)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Reports ──────────────────────────────────────────────────────────────

function ReportsTab({ reports, athlete }: { reports: any[]; athlete: any }) {
  const TYPE_COLORS: Record<string, string> = {
    progress: 'bg-blue-100 text-blue-700',
    assessment_summary: 'bg-purple-100 text-purple-700',
    session_summary: 'bg-emerald-100 text-emerald-700',
    crisis: 'bg-red-100 text-red-700',
    custom: 'bg-gray-100 text-gray-600',
  }

  // Use UID for all exported filenames and printed headers
  const uidCode: string = (athlete as any).uid_code ?? 'no-uid'
  const fullName = `${athlete.first_name} ${athlete.last_name}`

  function printReport(r: any) {
    let _printHtml = ''
    // Printed reports show UID in header, not athlete name
    _printHtml = (`<html><head><title>${uidCode} — ${(r.report_type ?? 'report').replace(/_/g,' ')}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1f2937}
        h1,h2,h3{color:#111827}p{line-height:1.6}li{margin-left:20px}
        .uid-badge{display:inline-block;font-family:monospace;font-size:14px;font-weight:700;
          background:#eff6ff;color:#1d4ed8;padding:4px 12px;border-radius:6px;letter-spacing:.06em}
        .notice{background:#fefce8;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;
          font-size:11px;color:#92400e;margin:16px 0}
      </style>
      </head><body>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #1A2D4A">
        <div style="background:#1A2D4A;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center">
          <span style="color:#3DDC84;font-size:18px;font-weight:900">W</span>
        </div>
        <div>
          <div style="font-size:16px;font-weight:800"><span style="color:#1A2D4A">WIN</span><span style="color:#2D7DD2">MIND</span><span style="color:#1A2D4A">PERFORM</span></div>
          <div style="font-size:9px;color:#9ca3af;letter-spacing:.1em;text-transform:uppercase">Sport Psychology Practitioner Suite</div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Athlete UID</div>
        <span class="uid-badge">${uidCode}</span>
      </div>
      <div class="notice">
        ⚠ <strong>Anonymised Document:</strong> This report identifies the athlete by UID code only.
        No personally identifiable information is included. For authorised clinical use only.
      </div>
      <h2 style="font-size:16px;margin-bottom:4px">${(r.report_type ?? 'Report').replace(/_/g,' ')}</h2>
      <p style="color:#6b7280;font-size:12px;margin-bottom:16px">${fmtDate(r.generated_at)}${r.is_ai_generated ? ' · AI-generated' : ''}</p>
      <hr style="margin:16px 0;border-color:#e5e7eb">
      <div style="font-size:13px;line-height:1.7">${r.content ?? ''}</div>
      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between">
        <span>WinMindPerform SPPS · Anonymised · UID: ${uidCode}</span>
        <span>Confidential · No PII · DPDP Act 2023</span>
      </div>
      </body></html>`)
    // Open via Blob URL — no popup blocker
    const _blob = new Blob([_printHtml], { type: 'text/html;charset=utf-8' })
    const _url  = URL.createObjectURL(_blob)
    const _a    = document.createElement('a')
    _a.href     = _url
    _a.target   = '_blank'
    _a.rel      = 'noopener'
    document.body.appendChild(_a)
    _a.click()
    document.body.removeChild(_a)
    setTimeout(() => URL.revokeObjectURL(_url), 2000)
  }

  function downloadReport(r: any) {
    // Anonymised header — no name in file or filename
    const header = [
      'WINMINDPERFORM — SPORT PSYCHOLOGY PRACTITIONER SUITE',
      `UID: ${uidCode}`,
      `Report Type: ${(r.report_type ?? 'custom').replace(/_/g, ' ')}`,
      `Generated: ${fmtDate(r.generated_at)}${r.is_ai_generated ? ' · AI-generated' : ''}`,
      '─'.repeat(60),
      'CONFIDENTIALITY NOTICE: This document contains no personally',
      'identifiable information. Athlete identified by UID code only.',
      '═'.repeat(60),
      '',
    ].join('\n')
    const blob = new Blob([header + (r.content ?? '')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Filename: UID + report type, no athlete name
    a.download = `${uidCode}_${(r.report_type ?? 'report').replace(/_/g, '-')}_${new Date().toISOString().slice(0,10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!reports.length) return <EmptyData message={`No reports generated yet.`} />

  return (
    <div className="space-y-4">
      <SectionHeader icon={FileText} title="Reports" count={reports.length} color="indigo" />
      {reports.map((r: any) => (
        <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{r.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtDate(r.generated_at)}{r.is_ai_generated ? ' · AI-generated' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge label={r.report_type?.replace(/_/g, ' ') ?? 'custom'} className={TYPE_COLORS[r.report_type] ?? 'bg-gray-100'} />
              <button onClick={() => downloadReport(r)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors" title="Download">
                <Download size={14} />
              </button>
              <button onClick={() => printReport(r)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded transition-colors" title="Print / PDF">
                <Printer size={14} />
              </button>
            </div>
          </div>
          {r.content && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-3 leading-relaxed">{r.content.slice(0, 200)}…</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab: AI Summary ───────────────────────────────────────────────────────────

function AISummaryTab({ athlete, sessions, checkins, assessments, interventions, reports, documents = [], physioRecords = [], labSessions = [], perfProfiles = [], neuroRecords = [] }: any) {
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')

  async function generate() {
    setGenerating(true)
    setSummary('')
    try {
      setStatus('Compiling athlete data…')
      const completedSessions = sessions.filter((s: any) => s.status === 'completed')
      const avgMood = checkins.length
        ? (checkins.reduce((a: number, c: any) => a + c.mood_score, 0) / checkins.length).toFixed(1) : null
      const avgStress = checkins.length
        ? (checkins.reduce((a: number, c: any) => a + c.stress_score, 0) / checkins.length).toFixed(1) : null
      const flagged = checkins.filter((c: any) => c.flags?.length).length
      const recentCheckin = checkins[0]

      const context = [
        `ATHLETE: ${athlete.first_name} ${athlete.last_name}`,
        `Sport: ${athlete.sport}${athlete.team ? ` (${athlete.team})` : ''}${athlete.position ? ` · ${athlete.position}` : ''}`,
        athlete.date_of_birth ? `Age: ${Math.floor((Date.now() - new Date(athlete.date_of_birth).getTime()) / (1000*60*60*24*365.25))}` : '',
        `Risk Level: ${athlete.risk_level} | Status: ${athlete.status}`,
        athlete.notes ? `Clinical Notes: ${athlete.notes}` : '',
        ``,
        `SESSIONS: ${sessions.length} total, ${completedSessions.length} completed`,
        sessions.slice(0, 5).map((s: any) =>
          `  - ${fmtDate(s.scheduled_at)}: ${s.session_type.replace(/_/g,' ')} (${s.status})${s.notes ? ' — ' + s.notes.slice(0,100) : ''}`
        ).join('\n'),
        ``,
        `CHECK-INS: ${checkins.length} recorded${flagged ? `, ${flagged} flagged` : ''}`,
        avgMood ? `  Avg Mood: ${avgMood}/10 | Avg Stress: ${avgStress}/10` : '',
        recentCheckin ? `  Most recent (${fmtDate(recentCheckin.checked_in_at)}): Mood ${recentCheckin.mood_score}, Stress ${recentCheckin.stress_score}, Sleep ${recentCheckin.sleep_score}, Readiness ${recentCheckin.readiness_score}` : '',
        recentCheckin?.notes ? `  Athlete note: "${recentCheckin.notes}"` : '',
        ``,
        `ASSESSMENTS (${assessments.length} administered):`,
        assessments.slice(0, 6).map((a: any) =>
          `  - ${a.tool} (${fmtDate(a.administered_at)}): Total ${a.total_score} | Subscales: ${Object.entries(a.scores ?? {}).map(([k,v]) => `${k}=${v}`).join(', ')}`
        ).join('\n'),
        ``,
        `INTERVENTIONS (${interventions.length}):`,
        interventions.slice(0, 8).map((i: any) =>
          `  - ${i.category}: ${i.title}${i.rating ? ` (effectiveness ${i.rating}/5)` : ''}${i.outcome ? ` | ${i.outcome}` : ''}`
        ).join('\n'),
        ``,
        `REPORTS: ${reports.length} generated for this athlete`,
        ``,
        physioRecords.length > 0 ? `PSYCHOPHYSIOLOGY / WEARABLES (${physioRecords.length} records):` : '',
        ...physioRecords.slice(0, 5).map((r: any) => {
          const hrvStr = r.hrv && r.hrv.rmssd ? `HRV RMSSD=${r.hrv.rmssd}ms` : ''
          const rhrStr = r.vitals?.rhr ? `RHR=${r.vitals.rhr}bpm` : ''
          const wearableStr = r.wearable_data ? ` | ${r.wearable_data.source?.toUpperCase()}: Recovery=${r.wearable_data.recovery_score ?? '—'} Coherence=${r.wearable_data.avg_coherence ?? '—'}` : ''
          return `  - ${fmtDate(r.created_at)} [${r.session_context}] ${[hrvStr, rhrStr].filter(Boolean).join(' | ')}${wearableStr} (${r.device_used ?? 'device unspecified'})`
        }),
        ``,
        labSessions.length > 0 ? `LAB TECHNOLOGY SESSIONS (${labSessions.length} total):` : '',
        ...labSessions.slice(0, 5).map((s: any) =>
          `  - ${s.session_date} [${s.technology.replace(/_/g, ' ').toUpperCase()}]: ${Object.entries(s.scores ?? {}).map(([k,v]) => `${k.replace(/_/g,' ')}=${v}`).slice(0, 5).join(' | ')}${s.flags?.length ? ' ⚠ ' + s.flags.join(', ') : ''}`
        ),
        ``,
        perfProfiles.length > 0 ? `PERFORMANCE PROFILES (${perfProfiles.length} entries):` : '',
        ...perfProfiles.slice(0, 6).map((p: any) =>
          `  - ${fmtDate(p.created_at)} [${p.domain_id.replace(/_/g,' ').toUpperCase()}]: ${Object.entries(p.scores ?? {}).map(([k,v]) => `${k.replace(/_/g,' ')}=${v}/10`).join(' | ')}`
        ),
        ``,
        neuroRecords.length > 0 ? `NEUROCOGNITIVE ASSESSMENTS (${neuroRecords.length} records):` : '',
        ...neuroRecords.slice(0, 4).map((r: any) => {
          const scores = r.senaptec_scores ?? {}
          const senaptecSkillKeys = ['visual_clarity','contrast_sensitivity','near_far_quickness','target_capture','depth_sensitivity','perception_span','multiple_object_tracking','reaction_time','peripheral_reaction','go_no_go']
          const vals = senaptecSkillKeys.map(k => scores[k]).filter((v): v is number => v != null)
          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
          const customSummary = r.custom_metrics?.filter((m: any) => m.name && m.value).slice(0, 4).map((m: any) => `${m.name}=${m.value}${m.unit}`).join(' | ')
          return `  - ${r.platform} (${fmtDate(r.test_date ?? r.created_at)}) [${(r.context ?? '').replace(/_/g,' ')}]${avg != null ? ` avg=${avg}th %ile` : ''}${customSummary ? ` | ${customSummary}` : ''}${r.notes ? ` | Notes: ${r.notes.slice(0, 100)}` : ''}`
        }),
        ``,
        documents.length > 0 ? `UPLOADED DOCUMENTS (${documents.length} total):` : '',
        ...documents.map((d: any) => [
          `  [${d.document_category.replace(/_/g,' ').toUpperCase()}] ${d.file_name}`,
          d.ai_summary ? `  Summary: ${d.ai_summary.slice(0,200)}` : '',
          d.ai_key_findings?.length > 0 ? `  Key Findings: ${d.ai_key_findings.slice(0,4).join(' | ')}` : '',
          d.ai_flags?.length > 0 ? `  ⚠ Flags: ${d.ai_flags.join('; ')}` : '',
          d.ai_recommendations ? `  Recommendations: ${d.ai_recommendations}` : '',
          d.practitioner_notes ? `  Practitioner Notes: ${d.practitioner_notes}` : '',
        ].filter(Boolean).join('\n')),
      ].filter(Boolean).join('\n')

      setStatus('Generating AI clinical narrative…')
      const text = await callGroq({
        messages: [{
          role: 'user',
          content: `You are a senior sport psychologist preparing a comprehensive case formulation report.

Using ONLY the real data below, write a detailed, professional case formulation in clinical language. Do not use placeholders. Use third person. Include:

## Executive Summary
Brief overview of the athlete's psychological and performance profile.

## Presenting Situation
Current functioning, risk level, and key concerns.

## Session Progress
Summary of therapeutic engagement and progress.

## Psychological Assessment Findings
Interpret the assessment scores clinically with actual numbers.

## Wellbeing Monitoring
Analyse check-in trends, flag patterns, and daily functioning.

## Intervention Effectiveness
Evaluate interventions used and their outcomes.

## Clinical Formulation
Integrate findings into a coherent formulation (predisposing, precipitating, perpetuating, protective factors).

## Recommendations & Next Steps
Concrete, prioritised clinical recommendations.

---
ATHLETE DATA:
${context}`,
        }],
        max_tokens: 3000,
      })
      setSummary(text)
    } catch (err: any) {
      setSummary(`Error generating summary: ${err.message}`)
    } finally {
      setGenerating(false)
      setStatus('')
    }
  }

  function exportSummary() {
    if (!summary) return
    // Export uses UID only — no personal details in the exported file
    const uidCode = (athlete as any).uid_code ?? 'no-uid'
    const anonHeader = [
      'WINMINDPERFORM — SPORT PSYCHOLOGY PRACTITIONER SUITE',
      'AI-GENERATED CASE FORMULATION — ANONYMISED',
      `UID: ${uidCode}`,
      `Generated: ${new Date().toLocaleString()}`,
      '─'.repeat(60),
      'CONFIDENTIALITY NOTICE: This document contains no personally',
      'identifiable information. Athlete identified by UID code only.',
      '═'.repeat(60),
      '',
    ].join('\n')
    const blob = new Blob([anonHeader + summary], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${uidCode}_AI_CaseFormulation_${new Date().toISOString().slice(0,10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function renderMd(md: string) {
    return md
      .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-100">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-600 mb-1 text-sm">$1</li>')
      .replace(/\n\n/g, '</p><p class="text-gray-700 text-sm mb-3 leading-relaxed">')
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon={Sparkles} title="AI Clinical Narrative" color="purple" />

      <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-5">
        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
          Generate a comprehensive clinical case formulation using all recorded data — sessions, check-ins, assessments, and interventions. Uses Groq AI (Llama 3.3).
        </p>
        <div className="flex gap-2">
          <Button onClick={generate} loading={generating} className="flex-1">
            <Sparkles size={14} />
            {generating ? status || 'Generating…' : summary ? 'Regenerate' : 'Generate AI Case Formulation'}
          </Button>
          {summary && (
            <Button variant="secondary" onClick={exportSummary}>
              <Download size={14} /> Export
            </Button>
          )}
        </div>
      </div>

      {summary && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Sparkles size={11} className="text-violet-500" />
              AI-generated · Review before use · Confidential clinical document
            </p>
          </div>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: `<p class="text-gray-700 text-sm mb-3 leading-relaxed">${renderMd(summary)}</p>` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CaseFormulationPage() {
  const { athleteId } = useParams<{ athleteId: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data: athletes = [] } = useAthletes()
  const { data: sessions = [],      isLoading: loadS } = useSessions(athleteId)
  const { data: checkins = [],      isLoading: loadC } = useCheckIns(athleteId)
  const { data: assessments = [],   isLoading: loadA } = useAssessments(athleteId)
  const { data: interventions = [], isLoading: loadI } = useInterventions(athleteId)
  const { data: reports = [],       isLoading: loadR } = useAthleteReports(athleteId)
  const { data: documents = [],     isLoading: loadD } = useAthleteDocuments(athleteId)
  const { data: physioRecords = [] } = useAthletePhysio(athleteId)
  const { data: labSessions = [] }   = useAthleteLabSessions(athleteId)
  const { data: perfProfiles = [] }  = useAthletePerfProfiles(athleteId)
  const { data: neuroRecords = [] }  = useAthleteNeuro(athleteId)

  const athlete = athletes.find(a => a.id === athleteId)
  const loading = loadS || loadC || loadA || loadI || loadR || loadD

  function handlePrint() { window.print() }


  // ── Comprehensive PDF — all sections in one document ─────────────────────
  function generateComprehensivePDF() {
    if (!athlete) return

    const now  = new Date()
    const anon = anonymise(athlete)
    const fullName = `${athlete.first_name} ${athlete.last_name}`

    // ── Computed aggregates ──────────────────────────────────────────────────
    const completed   = sessions.filter((s: any) => s.status === 'completed').length
    const flagged     = checkins.filter((c: any) => c.flags?.length > 0)
    const avg = (arr: any[], key: string) =>
      arr.length ? (arr.reduce((s: number, r: any) => s + (r[key] ?? 0), 0) / arr.length).toFixed(1) : '—'
    const avgMood    = avg(checkins, 'mood_score')
    const avgStress  = avg(checkins, 'stress_score')
    const avgSleep   = avg(checkins, 'sleep_score')
    const avgReady   = avg(checkins, 'readiness_score')
    const avgHRV     = physioRecords.filter((r: any) => r.hrv?.rmssd).length
      ? (physioRecords.reduce((s: number, r: any) => s + (r.hrv?.rmssd ?? 0), 0) /
         physioRecords.filter((r: any) => r.hrv?.rmssd).length).toFixed(0) : '—'
    const avgRHR     = physioRecords.filter((r: any) => r.vitals?.rhr).length
      ? (physioRecords.reduce((s: number, r: any) => s + (r.vitals?.rhr ?? 0), 0) /
         physioRecords.filter((r: any) => r.vitals?.rhr).length).toFixed(0) : '—'
    const avgRecovery = physioRecords.filter((r: any) => r.wearable_data?.recovery_score).length
      ? (physioRecords.reduce((s: number, r: any) => s + (r.wearable_data?.recovery_score ?? 0), 0) /
         physioRecords.filter((r: any) => r.wearable_data?.recovery_score).length).toFixed(0) : '—'

    const riskBg  = ({ low:'#16a34a', moderate:'#d97706', high:'#dc2626', critical:'#7f1d1d' } as any)[athlete.risk_level] ?? '#6b7280'
    const scoreCol = (v: number) => v >= 7 ? '#16a34a' : v >= 5 ? '#d97706' : '#dc2626'
    const bar = (pct: number, col: string, h = '7px') =>
      `<div style="height:${h};background:#e5e7eb;border-radius:4px;overflow:hidden;margin-top:3px">
        <div style="height:100%;width:${Math.min(pct,100)}%;background:${col};border-radius:4px"></div></div>`

    // ── Section header helper ──────────────────────────────────────────────────
    const sec = (emoji: string, title: string, pill: string, accent = '#1A2D4A') =>
      `<div style="display:flex;align-items:center;gap:10px;margin:28px 0 14px;padding-bottom:8px;border-bottom:2px solid ${accent}20">
        <div style="width:28px;height:28px;border-radius:7px;background:${accent}14;display:flex;align-items:center;justify-content:center;font-size:14px">${emoji}</div>
        <span style="font-size:14px;font-weight:800;color:${accent};flex:1">${title}</span>
        <span style="font-size:10px;font-weight:700;background:${accent}18;color:${accent};padding:2px 10px;border-radius:999px">${pill}</span>
      </div>`

    // ── CSS ─────────────────────────────────────────────────────────────────
    const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#f8fafc;font-size:12.5px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{max-width:920px;margin:0 auto;background:#fff}
      /* Cover */
      .cover{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#0f172a 100%);padding:44px 48px 36px;position:relative;overflow:hidden}
      .cover::before{content:'';position:absolute;top:-80px;right:-60px;width:320px;height:320px;background:radial-gradient(circle,#3b82f620 0%,transparent 70%);pointer-events:none}
      .cover-brand{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#94a3b8;margin-bottom:28px;display:flex;align-items:center;gap:8px}
      .cover-brand-dot{width:6px;height:6px;border-radius:50%;background:#3DDC84}
      .cover-uid{font-family:monospace;font-size:38px;font-weight:900;color:#fff;letter-spacing:.08em;line-height:1;margin-bottom:10px}
      .cover-meta{font-size:13px;color:#94a3b8;margin-bottom:18px}
      .cover-risk{display:inline-block;font-size:11px;font-weight:700;padding:4px 14px;border-radius:999px;color:#fff;margin-right:8px}
      .cover-status{display:inline-block;font-size:11px;font-weight:700;padding:4px 14px;border-radius:999px;background:#ffffff20;color:#fff}
      .cover-right{text-align:right;color:#64748b;font-size:10.5px;line-height:1.7}
      .cover-right strong{color:#94a3b8;display:block;font-size:13px;font-weight:700;margin-bottom:4px}
      /* Stats strip */
      .stats-strip{background:#0f172a;padding:18px 48px;display:grid;grid-template-columns:repeat(8,1fr);gap:0}
      .stat-cell{text-align:center;padding:6px 0;border-right:1px solid #ffffff12}
      .stat-cell:last-child{border-right:none}
      .stat-num{font-size:22px;font-weight:900;color:#fff;line-height:1}
      .stat-lbl{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
      /* Body */
      .body{padding:0 48px 48px}
      /* Cards */
      .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:8px}
      .card-dark{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px 16px;margin-bottom:8px}
      /* Tables */
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f1f5f9;padding:7px 9px;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;text-align:left}
      td{padding:7px 9px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top}
      tr:nth-child(even) td{background:#f8fafc}
      /* Metric cells */
      .metric-grid{display:grid;gap:8px;margin-bottom:14px}
      .metric-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;text-align:center}
      .metric-val{font-size:24px;font-weight:900;line-height:1;margin-bottom:2px}
      .metric-lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em}
      /* Bars */
      .bar-row{margin-bottom:6px}
      .bar-label{display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px}
      .bar-track{height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden}
      .bar-fill{height:100%;border-radius:4px}
      /* Alerts */
      .alert-red{background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:16px;font-size:11.5px;color:#991b1b}
      .alert-amber{background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:8px 12px;margin-bottom:8px;font-size:11px;color:#92400e}
      .finding-row{border-left:3px solid #3b82f6;padding:4px 10px;margin-bottom:4px;font-size:11px;color:#1e40af;background:#eff6ff;border-radius:0 6px 6px 0}
      /* Confidence badge */
      .conf-high{background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px}
      .conf-med{background:#fef9c3;color:#854d0e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px}
      .conf-low{background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px}
      /* Lab */
      .tech-chip{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#eff6ff;color:#1d4ed8}
      .consent-yes{font-size:9px;background:#dcfce7;color:#15803d;padding:1px 7px;border-radius:999px;font-weight:700}
      .consent-no{font-size:9px;background:#fef9c3;color:#92400e;padding:1px 7px;border-radius:999px;font-weight:700}
      /* Footer */
      .footer-strip{background:#0f172a;padding:20px 48px;display:flex;align-items:center;justify-content:space-between;margin-top:32px}
      .footer-brand{font-size:13px;font-weight:800;color:#fff;letter-spacing:.03em}
      .footer-sub{font-size:10px;color:#475569;margin-top:2px}
      .footer-anon{font-size:10px;color:#475569;text-align:right}
      /* Print */
      @media print{body{font-size:11px}.body{padding:0 32px 32px}.stats-strip{padding:14px 32px}.cover{padding:32px}.no-break{page-break-inside:avoid}}
    `

    // ── Cover ────────────────────────────────────────────────────────────────
    const cover = `
      <div class="cover">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="cover-brand"><div class="cover-brand-dot"></div>WINMINDPERFORM · SPPS</div>
            <div class="cover-uid">${anon.uid_code}</div>
            <div class="cover-meta">${anon.sport} · ${anon.age_group}</div>
            <span class="cover-risk" style="background:${riskBg}">${anon.risk_level.toUpperCase()} RISK</span>
            <span class="cover-status">${anon.status.replace('_',' ').toUpperCase()}</span>
          </div>
          <div class="cover-right">
            <strong>Full Case Formulation Report</strong>
            Generated: ${now.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}<br>
            <span style="color:#ef4444;font-weight:700;font-size:11px">CONFIDENTIAL · CLINICAL USE ONLY</span><br>
            <span style="color:#374151;font-size:10px">DPDP Act 2023 · Anonymised — UID only</span>
          </div>
        </div>
      </div>`

    // ── Stats strip ──────────────────────────────────────────────────────────
    const statsStrip = `
      <div class="stats-strip">
        ${[
          [sessions.length,   'Sessions'],
          [checkins.length,   'Check-ins'],
          [assessments.length,'Assessments'],
          [interventions.length,'Interventions'],
          [documents.length,  'Documents'],
          [physioRecords.length,'Physio'],
          [labSessions.length, 'Lab'],
          [perfProfiles.length,'Profiles'],
        ].map(([n,l]) =>
          `<div class="stat-cell"><div class="stat-num">${n}</div><div class="stat-lbl">${l}</div></div>`
        ).join('')}
      </div>`

    // ── Risk alert ───────────────────────────────────────────────────────────
    const riskAlert = (anon.risk_level === 'high' || anon.risk_level === 'critical')
      ? `<div class="alert-red">⚠ <strong>Elevated Risk:</strong> UID <strong>${anon.uid_code}</strong> is flagged as <strong>${anon.risk_level.toUpperCase()}</strong>. Ensure crisis protocols are active and regular monitoring is in place.</div>`
      : ''

    // ── Sessions ─────────────────────────────────────────────────────────────
    const sessHtml = sessions.length === 0
      ? '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No sessions recorded.</p>'
      : `<table><thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Min</th><th>Risk</th><th>Notes / Goals</th></tr></thead>
        <tbody>${sessions.map((s: any) => `<tr>
          <td style="white-space:nowrap">${fmtDate(s.scheduled_at)}</td>
          <td>${s.session_type.replace(/_/g,' ')}</td>
          <td><span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:${s.status==='completed'?'#dcfce7':'#f1f5f9'};color:${s.status==='completed'?'#15803d':'#475569'}">${s.status.replace('_',' ')}</span></td>
          <td>${s.duration_minutes ?? '—'}</td>
          <td>${s.risk_assessment ?? '—'}</td>
          <td style="max-width:200px;font-size:11px">${[s.notes ? redactNote(s.notes, fullName).slice(0,160) : '', s.goals ? 'Goals: ' + redactNote(s.goals, fullName) : ''].filter(Boolean).join(' | ') || '—'}</td>
        </tr>`).join('')}</tbody></table>
        <p style="font-size:11px;color:#64748b;margin-top:6px">${completed} of ${sessions.length} sessions completed</p>`

    // ── Check-ins ────────────────────────────────────────────────────────────
    const chkMetrics = `<div class="metric-grid" style="grid-template-columns:repeat(5,1fr)">
      ${[
        ['Mood', avgMood, '#3b82f6', parseFloat(avgMood)*10],
        ['Stress', avgStress, '#ef4444', parseFloat(avgStress)*10],
        ['Sleep', avgSleep, '#f59e0b', parseFloat(avgSleep)*10],
        ['Readiness', avgReady, '#10b981', parseFloat(avgReady)*10],
        ['Flagged', String(flagged.length), '#ef4444', flagged.length/Math.max(checkins.length,1)*100],
      ].map(([l, v, c, p]) => `
        <div class="metric-cell">
          <div class="metric-val" style="color:${c}">${v}</div>
          <div class="metric-lbl">${l}</div>
          ${bar(p as number, c as string)}
        </div>`).join('')}
    </div>`

    const chkHtml = checkins.length === 0
      ? '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No check-ins recorded.</p>'
      : `${chkMetrics}
        ${flagged.length > 0 ? `<div class="alert-amber">⚠ ${flagged.length} check-in${flagged.length>1?'s':''} flagged: ${[...new Set(flagged.flatMap((c: any) => c.flags ?? []))].join(', ')}</div>` : ''}
        <table><thead><tr><th>Date</th><th>Mood</th><th>Stress</th><th>Sleep</th><th>Motivation</th><th>Readiness</th><th>Flags</th><th>Notes</th></tr></thead>
        <tbody>${checkins.map((c: any) => `<tr>
          <td style="white-space:nowrap;font-size:10px">${fmtDate(c.checked_in_at)}</td>
          <td><strong style="color:${scoreCol(c.mood_score)}">${c.mood_score}</strong></td>
          <td><strong style="color:${scoreCol(10-c.stress_score)}">${c.stress_score}</strong></td>
          <td><strong style="color:${scoreCol(c.sleep_score)}">${c.sleep_score}</strong></td>
          <td>${c.motivation_score ?? '—'}</td>
          <td><strong style="color:${scoreCol(c.readiness_score)}">${c.readiness_score}</strong></td>
          <td style="font-size:10px;color:#dc2626">${c.flags?.join(', ') || '—'}</td>
          <td style="font-size:10px;max-width:160px">${c.notes ? redactNote(c.notes, fullName).slice(0,100) : '—'}</td>
        </tr>`).join('')}</tbody></table>`

    // ── Assessments ──────────────────────────────────────────────────────────
    const asmHtml = assessments.length === 0
      ? '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No assessments administered.</p>'
      : assessments.map((a: any) => {
          const isExt = String(a.tool).startsWith('EXTERNAL:')
          const tname = isExt ? String(a.tool).replace('EXTERNAL:','') : a.tool
          const maxSub = Math.max(...Object.values(a.scores ?? {}).map(v => v as number), 1)
          const bars = Object.entries(a.scores ?? {}).map(([n, v]) => {
            const num = v as number
            const pct = Math.min(Math.round(num / maxSub * 100), 100)
            const col = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
            return `<div class="bar-row">
              <div class="bar-label"><span>${n}</span><span style="font-weight:800;color:${col}">${num}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
            </div>`
          }).join('')
          return `<div class="card no-break" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="tech-chip">${tname}</span>
                ${isExt ? '<span style="font-size:10px;background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:4px">Offline</span>' : ''}
                <span style="font-size:11px;color:#94a3b8">${fmtDate(a.administered_at)}</span>
              </div>
              <div style="text-align:right">
                <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em">Total Score</div>
                <div style="font-size:26px;font-weight:900;color:#1A2D4A;line-height:1">${a.total_score}</div>
              </div>
            </div>
            ${bars}
            ${a.notes ? `<div style="margin-top:8px;font-size:11px;color:#374151;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px">📝 ${redactNote(a.notes, fullName).slice(0,200)}</div>` : ''}
          </div>`
        }).join('')

    // ── Interventions ────────────────────────────────────────────────────────
    const byCat: Record<string,any[]> = {}
    interventions.forEach((i: any) => { if(!byCat[i.category]) byCat[i.category]=[]; byCat[i.category].push(i) })
    const intHtml = interventions.length === 0
      ? '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No interventions logged.</p>'
      : Object.entries(byCat).map(([cat, list]) => `
        <div style="margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin-bottom:8px;padding:4px 0;border-bottom:1px solid #f1f5f9">${cat.replace(/_/g,' ')} · ${list.length}</div>
          ${list.map((i: any) => `<div class="card no-break" style="margin-bottom:6px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
              <div style="font-weight:700;font-size:12px;color:#1e293b">${i.title}</div>
              ${i.rating ? `<div style="color:#f59e0b;font-size:13px">${'★'.repeat(i.rating)}${'☆'.repeat(5-i.rating)}</div>` : ''}
            </div>
            ${i.description ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px">${redactNote(i.description, fullName).slice(0,200)}</div>` : ''}
            ${i.outcome ? `<div style="font-size:11px;color:#059669;font-style:italic">→ Outcome: ${redactNote(i.outcome, fullName)}</div>` : ''}
            <div style="font-size:10px;color:#cbd5e1;margin-top:4px">${fmtDate(i.created_at)}</div>
          </div>`).join('')}
        </div>`).join('')

    // ── Reports ──────────────────────────────────────────────────────────────
    const repHtml = reports.length === 0
      ? '<p style="color:#94a3b8;font-size:12px;padding:12px 0">No reports generated.</p>'
      : reports.map((r: any) => `<div class="card no-break" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-weight:700;font-size:12px;color:#1e293b">${r.title}</div>
            <div style="font-size:10px;color:#94a3b8">${fmtDate(r.generated_at)}${r.is_ai_generated ? ' · AI' : ''}</div>
          </div>
          <span style="font-size:10px;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-weight:600">${(r.report_type ?? 'custom').replace(/_/g,' ')}</span>
          ${r.content ? `<div style="margin-top:8px;font-size:11px;color:#374151;line-height:1.6">${redactNote(r.content, fullName).slice(0,400)}${r.content.length > 400 ? '…' : ''}</div>` : ''}
        </div>`).join('')

    // ── Documents ────────────────────────────────────────────────────────────
    const docsHtml = documents.length === 0 ? '' :
      documents.map((d: any) => {
        const conf = d.ai_confidence ?? 0
        const confCls = conf >= 70 ? 'conf-high' : conf >= 40 ? 'conf-med' : 'conf-low'
        const findings = Array.isArray(d.ai_key_findings) ? d.ai_key_findings : []
        const flags    = Array.isArray(d.ai_flags) ? d.ai_flags : []
        return `<div class="card no-break" style="margin-bottom:12px${flags.length ? ';border-color:#fbbf24' : ''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
            <div>
              <span style="font-size:10px;font-weight:700;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:4px;text-transform:uppercase;margin-right:6px">${String(d.document_category ?? 'other').replace(/_/g,' ')}</span>
              <strong style="font-size:12px;color:#1e293b">${d.file_name}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="${confCls}">${conf}% confidence</span>
              <span style="font-size:10px;color:#94a3b8">${fmtDate(d.uploaded_at)}</span>
            </div>
          </div>
          ${d.ai_summary ? `<p style="font-size:11.5px;color:#334155;line-height:1.7;margin-bottom:8px">${d.ai_summary}</p>` : ''}
          ${findings.length > 0 ? `<div style="margin-bottom:8px">${findings.map((f: string) => `<div class="finding-row">• ${f}</div>`).join('')}</div>` : ''}
          ${flags.length > 0 ? `<div class="alert-amber">${flags.map((f: string) => `<div>⚠ ${f}</div>`).join('')}</div>` : ''}
          ${d.ai_recommendations ? `<div style="font-size:11px;color:#1d4ed8;font-style:italic;margin-top:4px">→ ${d.ai_recommendations}</div>` : ''}
          ${d.practitioner_notes ? `<div style="margin-top:6px;font-size:11px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;color:#374151">📋 ${d.practitioner_notes}</div>` : ''}
        </div>`
      }).join('')

    // ── Physio & Wearables ───────────────────────────────────────────────────
    const physioHtml = physioRecords.length === 0 ? '' : (() => {
      const physMetrics = `<div class="metric-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
        ${[
          ['Avg HRV', avgHRV + (avgHRV !== '—' ? ' ms' : ''), '#8b5cf6'],
          ['Avg RHR', avgRHR + (avgRHR !== '—' ? ' bpm' : ''), '#ef4444'],
          ['Avg Recovery', avgRecovery + (avgRecovery !== '—' ? '%' : ''), '#10b981'],
          ['Records', String(physioRecords.length), '#3b82f6'],
        ].map(([l, v, c]) => `
          <div class="metric-cell">
            <div class="metric-val" style="color:${c}">${v}</div>
            <div class="metric-lbl">${l}</div>
          </div>`).join('')}
      </div>`
      const rows = physioRecords.slice(0, 20).map((r: any) => `<div class="card no-break" style="margin-bottom:6px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;font-weight:600;color:#1e293b">${fmtDate(r.created_at)} · ${(r.session_context ?? '—').replace(/_/g,' ')}</span>
          ${r.device_used ? `<span style="font-size:10px;background:#f1f5f9;color:#475569;padding:1px 7px;border-radius:999px">${r.device_used}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${r.hrv?.rmssd ? `<span style="font-size:11px;background:#f5f3ff;color:#7c3aed;padding:3px 10px;border-radius:6px;font-weight:600">HRV <strong>${r.hrv.rmssd}</strong> ms</span>` : ''}
          ${r.vitals?.rhr ? `<span style="font-size:11px;background:#fef2f2;color:#dc2626;padding:3px 10px;border-radius:6px;font-weight:600">RHR <strong>${r.vitals.rhr}</strong> bpm</span>` : ''}
          ${r.vitals?.spo2 ? `<span style="font-size:11px;background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:6px;font-weight:600">SpO₂ <strong>${r.vitals.spo2}%</strong></span>` : ''}
          ${r.wearable_data?.recovery_score ? `<span style="font-size:11px;background:#f0fdf4;color:#15803d;padding:3px 10px;border-radius:6px;font-weight:600">Recovery <strong>${r.wearable_data.recovery_score}%</strong></span>` : ''}
          ${r.wearable_data?.avg_coherence ? `<span style="font-size:11px;background:#fdf2f8;color:#be185d;padding:3px 10px;border-radius:6px;font-weight:600">Coherence <strong>${r.wearable_data.avg_coherence}</strong></span>` : ''}
        </div>
        ${r.notes ? `<p style="font-size:10.5px;color:#64748b;margin-top:6px;font-style:italic">${r.notes}</p>` : ''}
      </div>`).join('')
      return physMetrics + rows
    })()

    // ── Mental Performance Lab ───────────────────────────────────────────────
    const labHtml = labSessions.length === 0 ? '' : (() => {
      const byTech: Record<string, any[]> = {}
      labSessions.forEach((s: any) => { if (!byTech[s.technology]) byTech[s.technology] = []; byTech[s.technology].push(s) })
      return Object.entries(byTech).map(([tech, techSessions]) => {
        const latest = techSessions[0]
        const techLabel = tech.replace(/_/g,' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        const numScores = Object.entries(latest.scores ?? {}).filter(([, v]) => typeof v === 'number') as [string, number][]
        const maxVal = Math.max(...numScores.map(([, v]) => v), 1)
        const bars = numScores.slice(0, 8).map(([k, v]) => {
          const pct = Math.min(Math.round(v / maxVal * 100), 100)
          const col = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626'
          return `<div class="bar-row"><div class="bar-label"><span>${k.replace(/_/g,' ')}</span><span style="font-weight:700;color:${col}">${typeof v === 'number' ? v.toFixed(1) : v}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></div>`
        }).join('')
        const textScores = Object.entries(latest.scores ?? {}).filter(([, v]) => typeof v === 'string' && v)
          .map(([k, v]) => `<span style="font-size:10px;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:4px">${k.replace(/_/g,' ')}: <strong>${v}</strong></span>`).join(' ')
        return `<div class="card no-break" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="tech-chip">${techLabel}</span>
              <span class="${latest.consent_given ? 'consent-yes' : 'consent-no'}">${latest.consent_given ? '✓ Consent' : '⚠ No consent'}</span>
            </div>
            <span style="font-size:10px;color:#94a3b8">${techSessions.length} session${techSessions.length > 1 ? 's' : ''} · Last ${latest.session_date}</span>
          </div>
          ${bars}
          ${textScores ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${textScores}</div>` : ''}
          ${latest.flags?.length ? `<div class="alert-amber" style="margin-top:8px">⚠ Flags: ${latest.flags.join(' · ')}</div>` : ''}
          ${latest.notes ? `<p style="font-size:10.5px;color:#64748b;margin-top:6px;font-style:italic">${redactNote(latest.notes, fullName).slice(0, 150)}</p>` : ''}
        </div>`
      }).join('')
    })()

    // ── Performance Profiles ─────────────────────────────────────────────────
    const profileHtml = perfProfiles.length === 0 ? '' : (() => {
      const byDomain: Record<string, any[]> = {}
      perfProfiles.forEach((p: any) => { if (!byDomain[p.domain_id]) byDomain[p.domain_id] = []; byDomain[p.domain_id].push(p) })
      const domainLabels: Record<string, string> = {
        mental_toughness: 'Mental Toughness', pre_competition: 'Pre-Competition State',
        performance_capacity: 'Performance Capacity', team_cohesion: 'Team Cohesion', flow_readiness: 'Flow Readiness',
      }
      const domainColors: Record<string, string> = {
        mental_toughness: '#3b82f6', pre_competition: '#f59e0b', performance_capacity: '#10b981',
        team_cohesion: '#8b5cf6', flow_readiness: '#f43f5e',
      }
      const cards = Object.entries(byDomain).map(([domainId, dps]) => {
        const latest = dps[0]
        const vals = Object.values(latest.scores as Record<string, number>)
        const avg = (vals.reduce((a, b) => a + b, 0) / vals.length)
        const col = domainColors[domainId] ?? '#6b7280'
        const bars = Object.entries(latest.scores as Record<string, number>).map(([k, v]) => {
          const pct = Math.round(v * 10)
          return `<div class="bar-row"><div class="bar-label"><span style="font-size:11px">${k.replace(/_/g,' ')}</span><span style="font-weight:700;color:${col}">${v}/10</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></div>`
        }).join('')
        return `<div class="card no-break">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-size:13px;font-weight:800;color:#1e293b">${domainLabels[domainId] ?? domainId.replace(/_/g,' ')}</div>
              <div style="font-size:10px;color:#94a3b8">${dps.length} entr${dps.length === 1 ? 'y' : 'ies'} · Latest ${fmtDate(latest.created_at)}</div>
            </div>
            <div style="text-align:center;background:${col}14;border-radius:12px;padding:10px 18px">
              <div style="font-size:28px;font-weight:900;color:${col};line-height:1">${avg.toFixed(1)}</div>
              <div style="font-size:9px;color:${col};opacity:.7;text-transform:uppercase">/ 10 avg</div>
            </div>
          </div>
          ${bars}
        </div>`
      })
      // two-column grid
      const pairs: string[] = []
      for (let i = 0; i < cards.length; i += 2) {
        pairs.push(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          ${cards[i]}${cards[i+1] ?? '<div></div>'}
        </div>`)
      }
      return pairs.join('')
    })()

    // ── Footer ────────────────────────────────────────────────────────────────
    const neuroHtml = neuroRecords.length === 0 ? '' : (() => {
      const skillKeys = ['visual_clarity','contrast_sensitivity','near_far_quickness','target_capture','depth_sensitivity','perception_span','multiple_object_tracking','reaction_time','peripheral_reaction','go_no_go']
      const skillLabels: Record<string,string> = { visual_clarity:'Visual Clarity',contrast_sensitivity:'Contrast Sensitivity',near_far_quickness:'Near-Far Quickness',target_capture:'Target Capture',depth_sensitivity:'Depth Sensitivity',perception_span:'Perception Span',multiple_object_tracking:'Multi-Object Tracking',reaction_time:'Reaction Time',peripheral_reaction:'Peripheral Reaction',go_no_go:'Go / No Go' }
      const domainMap: Record<string,string> = { visual_clarity:'visual',contrast_sensitivity:'visual',near_far_quickness:'visual',target_capture:'visual',depth_sensitivity:'processing',perception_span:'processing',multiple_object_tracking:'processing',reaction_time:'reaction',peripheral_reaction:'reaction',go_no_go:'reaction' }
      const domainColors: Record<string,string> = { visual:'#3b82f6', processing:'#8b5cf6', reaction:'#10b981' }
      return neuroRecords.map((r: any) => {
        const scores = r.senaptec_scores ?? {}
        const vals = skillKeys.map(k => scores[k]).filter((v): v is number => v != null)
        const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
        const hasSenaptec = vals.length > 0
        const skillBars = hasSenaptec ? skillKeys.filter(k => scores[k] != null).map(k => {
          const pct = scores[k]
          const col = domainColors[domainMap[k]] ?? '#6b7280'
          const colBar = pct >= 50 ? col : '#f59e0b'
          return `<div class="bar-row"><div class="bar-label"><span style="font-size:10px">${skillLabels[k]}</span><span style="font-weight:700;color:${colBar}">${pct}th</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colBar}"></div></div></div>`
        }).join('') : ''
        const customRows = r.custom_metrics?.filter((m: any) => m.name && m.value).map((m: any) =>
          `<div class="bar-row"><div class="bar-label"><span style="font-size:10px">${m.name}</span><span style="font-weight:700;color:#6b7280">${m.value} ${m.unit}</span></div></div>`
        ).join('') ?? ''
        return `<div class="card no-break">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-size:13px;font-weight:800;color:#1e293b">${r.platform}</div>
              <div style="font-size:10px;color:#94a3b8">${fmtDate(r.test_date ?? r.created_at)} · ${(r.context ?? '').replace(/_/g,' ')} · vs ${r.comparison_group ?? '—'}</div>
            </div>
            ${avg != null ? `<div style="text-align:center;background:#eff6ff;border-radius:12px;padding:10px 18px">
              <div style="font-size:28px;font-weight:900;color:#3b82f6;line-height:1">${avg}</div>
              <div style="font-size:9px;color:#3b82f6;opacity:.7;text-transform:uppercase">th %ile avg</div>
            </div>` : ''}
          </div>
          ${skillBars}${customRows}
          ${r.notes ? `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:8px;font-size:11px;color:#475569">${r.notes.slice(0,200)}</div>` : ''}
        </div>`
      }).join('')
    })()

    const footer = `
      <div class="footer-strip">
        <div>
          <div class="footer-brand">WIN<span style="color:#3b82f6">MIND</span>PERFORM</div>
          <div class="footer-sub">Sport Psychology Practitioner Suite · SPPS</div>
        </div>
        <div style="text-align:center;color:#475569;font-size:10px">
          <div style="font-weight:700;color:#64748b;margin-bottom:2px">Anonymised Document — No PII</div>
          Athlete identity resolvable only by the authorised practitioner<br>
          DPDP Act 2023 compliant · Unauthorised distribution prohibited
        </div>
        <div class="footer-anon">
          <div style="color:#64748b;font-weight:700">${anon.uid_code}</div>
          <div>${now.toLocaleDateString('en-IN')}</div>
        </div>
      </div>`

    // ── Assemble ──────────────────────────────────────────────────────────────
    const sectionCfg = [
      ['📅', 'Sessions',             `${sessions.length} total · ${completed} completed`, sessHtml,    '#1A2D4A'],
      ['📊', 'Daily Check-ins',      `${checkins.length} records · ${flagged.length} flagged`, chkHtml, '#0369a1'],
      ['🧠', 'Assessments',          `${assessments.length} administered`, asmHtml,   '#7c3aed'],
      ['🎯', 'Interventions',        `${interventions.length} total`, intHtml,         '#059669'],
      ['📄', 'Reports',              `${reports.length} generated`, repHtml,           '#d97706'],
      ...(documents.length > 0   ? [['📁', 'Uploaded Documents',   `${documents.length} file${documents.length>1?'s':''}`, docsHtml, '#475569']] : []),
      ...(physioRecords.length > 0 ? [['💓', 'Physio & Wearables', `${physioRecords.length} records`, physioHtml, '#8b5cf6']] : []),
      ...(labSessions.length > 0   ? [['🔬', 'Mental Performance Lab', `${labSessions.length} sessions`, labHtml, '#0ea5e9']] : []),
      ...(neuroRecords.length > 0  ? [['👁', 'Neurocognitive',          `${neuroRecords.length} records`, neuroHtml, '#3b82f6']] : []),
      ...(perfProfiles.length > 0  ? [['🎯', 'Performance Profiles', `${perfProfiles.length} entries`, profileHtml, '#f43f5e']] : []),
    ] as [string, string, string, string, string][]

    const body = `<div class="body">${riskAlert}${sectionCfg.map(([emoji, title, pill, html, accent]) =>
      html ? `<div class="no-break" style="margin-bottom:6px">${sec(emoji, title, pill, accent)}<div>${html}</div></div>` : ''
    ).join('')}</div>`

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
      <title>Case Formulation — ${anon.uid_code}</title>
      <style>${css}</style></head><body class="page">
      ${cover}${statsStrip}${body}${footer}
      <script>window.onload=function(){window.print()}<\/script>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.target = '_blank'; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  // ── Anonymous .txt export — NO personal details, UID only ──────────────────
  function exportFullReport() {
    if (!athlete) return
    const anon = anonymise(athlete)
    const fullName = `${athlete.first_name} ${athlete.last_name}`
    const avgMood   = checkins.length ? (checkins.reduce((a, c) => a + c.mood_score,    0) / checkins.length).toFixed(1) : '—'
    const avgStress = checkins.length ? (checkins.reduce((a, c) => a + c.stress_score,  0) / checkins.length).toFixed(1) : '—'
    const avgSleep  = checkins.length ? (checkins.reduce((a, c) => a + c.sleep_score,   0) / checkins.length).toFixed(1) : '—'
    const avgReady  = checkins.length ? (checkins.reduce((a, c) => a + c.readiness_score, 0) / checkins.length).toFixed(1) : '—'

    const lines = [
      `WINMINDPERFORM — SPORT PSYCHOLOGY PRACTITIONER SUITE`,
      `ANONYMISED CASE FORMULATION REPORT`,
      `Generated: ${new Date().toLocaleString()}`,
      `${'═'.repeat(60)}`,
      ``,
      ANONYMISATION_DISCLAIMER,
      ``,
      `${'═'.repeat(60)}`,
      `ATHLETE REFERENCE`,
      `${'═'.repeat(60)}`,
      `UID Code:   ${anon.uid_code}`,
      `Sport:      ${anon.sport}`,
      `Age Group:  ${anon.age_group}`,
      `Status:     ${anon.status}`,
      `Risk Level: ${anon.risk_level}`,
      ``,
      `${'─'.repeat(60)}`,
      `SESSIONS  (${sessions.length} total)`,
      `${'─'.repeat(60)}`,
      ...sessions.map(s =>
        `  ${fmtDate(s.scheduled_at)} · ${s.session_type.replace(/_/g,' ')} · ${s.status}` +
        (s.notes ? `
    ${redactNote(s.notes, fullName).slice(0,200)}` : '') +
        (s.goals ? `
    Goals: ${redactNote(s.goals, fullName)}` : '')
      ),
      ``,
      `${'─'.repeat(60)}`,
      `DAILY CHECK-INS  (${checkins.length} records)`,
      `${'─'.repeat(60)}`,
      `  Averages — Mood: ${avgMood}/10 | Stress: ${avgStress}/10 | Sleep: ${avgSleep}/10 | Readiness: ${avgReady}/10`,
      ...checkins.map(c =>
        `  ${fmtDate(c.checked_in_at)}: M=${c.mood_score} S=${c.stress_score} Sl=${c.sleep_score} Mo=${c.motivation_score??'—'} R=${c.readiness_score}` +
        (c.flags?.length ? ` | Flags: ${c.flags.join(', ')}` : '') +
        (c.notes ? ` | Note: ${redactNote(c.notes, fullName).slice(0,100)}` : '')
      ),
      ``,
      `${'─'.repeat(60)}`,
      `ASSESSMENTS  (${assessments.length} administered)`,
      `${'─'.repeat(60)}`,
      ...assessments.map(a =>
        `  ${String(a.tool).replace('EXTERNAL:','')} (${fmtDate(a.administered_at)}): Total=${a.total_score}
    ` +
        Object.entries(a.scores ?? {}).map(([k,v]) => `${k}=${v}`).join(' | ') +
        (a.notes ? `
    Notes: ${redactNote(a.notes, fullName).slice(0,150)}` : '')
      ),
      ``,
      `${'─'.repeat(60)}`,
      `INTERVENTIONS  (${interventions.length} total)`,
      `${'─'.repeat(60)}`,
      ...interventions.map(i =>
        `  [${i.category}] ${i.title}` +
        (i.rating ? ` · Effectiveness: ${i.rating}/5` : '') +
        (i.description ? `
    ${redactNote(i.description, fullName).slice(0,150)}` : '') +
        (i.outcome ? `
    Outcome: ${redactNote(i.outcome, fullName)}` : '')
      ),
      ``,
      `${'─'.repeat(60)}`,
      `REPORTS  (${reports.length} generated)`,
      `${'─'.repeat(60)}`,
      ...reports.map(r =>
        `  [${(r.report_type??'custom').replace(/_/g,' ')}] ${r.title} · ${fmtDate(r.generated_at)}${r.is_ai_generated ? ' · AI' : ''}`
      ),
      ``,
      documents.length > 0 ? `${'─'.repeat(60)}` : '',
      documents.length > 0 ? `UPLOADED DOCUMENTS  (${documents.length} total)` : '',
      documents.length > 0 ? `${'─'.repeat(60)}` : '',
      ...documents.map((d: any) => [
        `  [${d.document_category.replace(/_/g,' ').toUpperCase()}] ${d.file_name} (${fmtDate(d.uploaded_at)})`,
        d.ai_summary ? `  AI Summary: ${d.ai_summary.slice(0,300)}` : '',
        d.ai_key_findings?.length ? `  Key Findings: ${d.ai_key_findings.slice(0,4).join(' | ')}` : '',
        d.ai_flags?.length ? `  ⚠ Flags: ${d.ai_flags.join('; ')}` : '',
        d.practitioner_notes ? `  Practitioner Notes: ${d.practitioner_notes}` : '',
      ].filter(Boolean).join('\n')),
      ``,
      ...(physioRecords.length > 0 ? [
        `${'─'.repeat(60)}`,
        `PHYSIO & WEARABLES  (${physioRecords.length} records)`,
        `${'─'.repeat(60)}`,
        ...physioRecords.slice(0, 20).map((r: any) => [
          `  ${fmtDate(r.created_at)} · ${(r.session_context ?? '—').replace(/_/g,' ')}${r.device_used ? ` · ${r.device_used}` : ''}`,
          r.hrv?.rmssd ? `    HRV: ${r.hrv.rmssd} ms` : '',
          r.vitals?.rhr ? `    RHR: ${r.vitals.rhr} bpm` : '',
          r.vitals?.spo2 ? `    SpO₂: ${r.vitals.spo2}%` : '',
          r.wearable_data?.recovery_score ? `    Recovery: ${r.wearable_data.recovery_score}%` : '',
          r.wearable_data?.avg_coherence ? `    Coherence: ${r.wearable_data.avg_coherence}` : '',
          r.notes ? `    Notes: ${r.notes.slice(0,120)}` : '',
        ].filter(Boolean).join('\n')),
        ``,
      ] : []),
      ...(labSessions.length > 0 ? [
        `${'─'.repeat(60)}`,
        `MENTAL PERFORMANCE LAB  (${labSessions.length} sessions)`,
        `${'─'.repeat(60)}`,
        ...labSessions.map((s: any) => [
          `  ${s.technology.replace(/_/g,' ').toUpperCase()} · ${s.session_date}${s.duration_minutes ? ` · ${s.duration_minutes}min` : ''}`,
          `  Consent: ${s.consent_given ? 'Yes' : 'Not recorded'}`,
          Object.entries(s.scores ?? {}).length > 0
            ? `  Scores: ${Object.entries(s.scores as Record<string,any>).slice(0,8).map(([k,v]) => `${k.replace(/_/g,' ')}=${v}`).join(' | ')}`
            : '',
          s.flags?.length ? `  ⚠ Flags: ${s.flags.join(' · ')}` : '',
          s.notes ? `  Notes: ${s.notes.slice(0,120)}` : '',
        ].filter(Boolean).join('\n')),
        ``,
      ] : []),
      ...(perfProfiles.length > 0 ? [
        `${'─'.repeat(60)}`,
        `PERFORMANCE PROFILES  (${perfProfiles.length} entries)`,
        `${'─'.repeat(60)}`,
        ...perfProfiles.map((p: any) => [
          `  ${(p.domain_id ?? '').replace(/_/g,' ').toUpperCase()} · ${fmtDate(p.created_at)}`,
          `  Scores: ${Object.entries(p.scores as Record<string,number>).map(([k,v]) => `${k.replace(/_/g,' ')}=${v}/10`).join(' | ')}`,
        ].join('\n')),
        ``,
      ] : []),
      ...(neuroRecords.length > 0 ? [
        `${'─'.repeat(60)}`,
        `NEUROCOGNITIVE ASSESSMENTS  (${neuroRecords.length} records)`,
        `${'─'.repeat(60)}`,
        ...neuroRecords.map((r: any) => {
          const scores = r.senaptec_scores ?? {}
          const skillKeys = ['visual_clarity','contrast_sensitivity','near_far_quickness','target_capture','depth_sensitivity','perception_span','multiple_object_tracking','reaction_time','peripheral_reaction','go_no_go']
          const vals = skillKeys.map(k => scores[k]).filter((v): v is number => v != null)
          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
          const customStr = r.custom_metrics?.filter((m: any) => m.name && m.value).map((m: any) => `${m.name}=${m.value}${m.unit}`).join(' | ')
          return [
            `  ${r.platform} · ${fmtDate(r.test_date ?? r.created_at)} · ${(r.context ?? '').replace(/_/g,' ')} · vs ${r.comparison_group ?? '—'}`,
            avg != null ? `  SENAPTEC avg: ${avg}th percentile` : '',
            vals.length > 0 ? `  Skills: ${skillKeys.filter(k => scores[k] != null).map(k => `${k.replace(/_/g,' ')}=${scores[k]}th`).join(' | ')}` : '',
            customStr ? `  Metrics: ${customStr}` : '',
            r.notes ? `  Notes: ${r.notes.slice(0, 150)}` : '',
          ].filter(Boolean).join('\n')
        }),
        ``,
      ] : []),
      `${'═'.repeat(60)}`,
      `WinMindPerform — Sport Psychology Practitioner Suite`,
      `This document contains no personal identifiable information.`,
      `Athlete identity resolvable only by the authorised practitioner.`,
    ].filter(l => l !== undefined).join('\n')

    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${anon.uid_code}_CaseFormulation_${new Date().toISOString().slice(0,10)}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV export — full data, PII included (internal practitioner use) ──────
  function exportCSV() {
    if (!athlete) return
    const anon = anonymise(athlete)
    const now = new Date().toISOString().slice(0, 10)

    function esc(v: any): string {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    function row(...cells: any[]) { return cells.map(esc).join(',') }

    const sheets: string[] = []

    // ── Sheet 1: Athlete Profile ──────────────────────────────────────────
    sheets.push('ATHLETE PROFILE')
    sheets.push(row('Field', 'Value'))
    sheets.push(row('UID Code', anon.uid_code))
    sheets.push(row('Name', `${athlete.first_name} ${athlete.last_name}`))
    sheets.push(row('Sport', athlete.sport))
    sheets.push(row('Team', athlete.team ?? ''))
    sheets.push(row('Position', athlete.position ?? ''))
    sheets.push(row('Status', athlete.status))
    sheets.push(row('Risk Level', athlete.risk_level))
    sheets.push(row('DOB', athlete.date_of_birth ?? ''))
    sheets.push(row('Email', athlete.email ?? ''))
    sheets.push(row('Phone', athlete.phone ?? ''))
    sheets.push(row('Emergency Contact', athlete.emergency_contact_name ?? ''))
    sheets.push(row('Emergency Phone', athlete.emergency_contact_phone ?? ''))
    sheets.push(row('Generated', new Date().toLocaleString()))
    sheets.push('')

    // ── Sheet 2: Sessions ─────────────────────────────────────────────────
    sheets.push('SESSIONS')
    sheets.push(row('Date', 'Type', 'Status', 'Duration (min)', 'Risk Assessment', 'Goals', 'Notes', 'Homework'))
    sessions.forEach(s => sheets.push(row(
      s.scheduled_at ? fmtDate(s.scheduled_at) : '',
      s.session_type?.replace(/_/g,' ') ?? '',
      s.status ?? '',
      s.duration_minutes ?? '',
      s.risk_assessment ?? '',
      s.goals ?? '',
      s.notes ?? '',
      s.homework ?? '',
    )))
    sheets.push('')

    // ── Sheet 3: Daily Check-ins ──────────────────────────────────────────
    sheets.push('DAILY CHECK-INS')
    sheets.push(row('Date', 'Mood', 'Stress', 'Sleep', 'Motivation', 'Readiness', 'Energy', 'Soreness', 'Flags', 'Notes'))
    checkins.forEach(c => sheets.push(row(
      fmtDate(c.checked_in_at),
      c.mood_score, c.stress_score, c.sleep_score,
      c.motivation_score ?? '', c.readiness_score,
      c.energy_score ?? '', c.soreness_score ?? '',
      (c.flags ?? []).join('; '),
      c.notes ?? '',
    )))
    sheets.push('')

    // ── Sheet 4: Assessments ──────────────────────────────────────────────
    sheets.push('ASSESSMENTS')
    // Collect all unique subscale keys
    const allSubKeys = [...new Set(assessments.flatMap(a => Object.keys(a.scores ?? {})))]
    sheets.push(row('Date', 'Tool', 'Total Score', 'Notes', ...allSubKeys))
    assessments.forEach(a => sheets.push(row(
      fmtDate(a.administered_at),
      String(a.tool).replace('EXTERNAL:', ''),
      a.total_score ?? '',
      a.notes ?? '',
      ...allSubKeys.map(k => (a.scores as any)?.[k] ?? ''),
    )))
    sheets.push('')

    // ── Sheet 5: Interventions ────────────────────────────────────────────
    sheets.push('INTERVENTIONS')
    sheets.push(row('Date', 'Category', 'Title', 'Status', 'Effectiveness (1-5)', 'Description', 'Outcome'))
    interventions.forEach(i => sheets.push(row(
      fmtDate(i.created_at),
      i.category ?? '', i.title ?? '',
      i.status ?? '', i.rating ?? '',
      i.description ?? '', i.outcome ?? '',
    )))
    sheets.push('')

    // ── Sheet 6: Physio & Wearables ───────────────────────────────────────
    sheets.push('PHYSIO & WEARABLES')
    sheets.push(row('Date', 'Context', 'Device', 'HRV RMSSD', 'HRV SDNN', 'RHR', 'SpO2', 'Recovery %', 'Coherence', 'Body Battery', 'Notes'))
    physioRecords.forEach((r: any) => sheets.push(row(
      fmtDate(r.created_at),
      (r.session_context ?? '').replace(/_/g,' '),
      r.device_used ?? '',
      r.hrv?.rmssd ?? '', r.hrv?.sdnn ?? '',
      r.vitals?.rhr ?? '', r.vitals?.spo2 ?? '',
      r.wearable_data?.recovery_score ?? '',
      r.wearable_data?.avg_coherence ?? '',
      r.wearable_data?.body_battery ?? '',
      r.notes ?? '',
    )))
    sheets.push('')

    // ── Sheet 7: Lab Sessions ─────────────────────────────────────────────
    sheets.push('MENTAL PERFORMANCE LAB')
    const allScoreKeys = [...new Set(labSessions.flatMap((s: any) => Object.keys(s.scores ?? {})))]
    sheets.push(row('Date', 'Technology', 'Protocol', 'Duration (min)', 'Consent Given', 'Flags', 'Notes', ...allScoreKeys))
    labSessions.forEach((s: any) => sheets.push(row(
      s.session_date ?? '',
      (s.technology ?? '').replace(/_/g,' '),
      s.protocol ?? '', s.duration_minutes ?? '',
      s.consent_given ? 'Yes' : 'No',
      (s.flags ?? []).join('; '),
      s.notes ?? '',
      ...allScoreKeys.map(k => (s.scores as any)?.[k] ?? ''),
    )))
    sheets.push('')

    // ── Sheet 8: Performance Profiles ─────────────────────────────────────
    sheets.push('PERFORMANCE PROFILES')
    const allProfKeys = [...new Set(perfProfiles.flatMap((p: any) => Object.keys(p.scores ?? {})))]
    sheets.push(row('Date', 'Domain', ...allProfKeys))
    perfProfiles.forEach((p: any) => sheets.push(row(
      fmtDate(p.created_at),
      (p.domain_id ?? '').replace(/_/g,' '),
      ...allProfKeys.map(k => (p.scores as any)?.[k] ?? ''),
    )))
    sheets.push('')

    // ── Sheet 9: Documents ────────────────────────────────────────────────
    if (documents.length > 0) {
      sheets.push('UPLOADED DOCUMENTS')
      sheets.push(row('Date', 'File Name', 'Category', 'AI Confidence %', 'AI Summary', 'Key Findings', 'Flags', 'Recommendations'))
      documents.forEach((d: any) => sheets.push(row(
        fmtDate(d.uploaded_at),
        d.file_name ?? '',
        (d.document_category ?? '').replace(/_/g,' '),
        d.ai_confidence ?? '',
        d.ai_summary ?? '',
        (d.ai_key_findings ?? []).slice(0,4).join(' | '),
        (d.ai_flags ?? []).join('; '),
        d.ai_recommendations ?? '',
      )))
    }

    const csv = sheets.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${athlete.first_name}_${athlete.last_name}_${anon.uid_code}_${now}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }


  if (!athlete && !loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-gray-400">Athlete not found</p>
          <Button onClick={() => navigate('/athletes')}>← Back to Athletes</Button>
        </div>
      </AppShell>
    )
  }

  const age = athlete ? calcAge(athlete.date_of_birth) : null

  return (
    <AppShell>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => navigate('/athletes')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Athletes
        </button>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="secondary" onClick={exportCSV}
            className="border-green-300 text-green-700 hover:bg-green-50"
            title="CSV export includes all data with athlete name (internal use)">
            <Download size={16} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={exportFullReport}>
            <Download size={16} /> Export .txt
          </Button>
          <Button
            variant="secondary"
            onClick={generateComprehensivePDF}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <FileDown size={16} /> Export Full PDF
          </Button>
          <Button onClick={handlePrint}>
            <Printer size={16} /> Print Tab
          </Button>
        </div>
      </div>

      {loading && !athlete ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : athlete ? (
        <div className="max-w-5xl mx-auto">
          {/* Athlete hero */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Avatar firstName={athlete.first_name} lastName={athlete.last_name} src={athlete.avatar_url} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{athlete.first_name} {athlete.last_name}</h1>
                  <Badge label={athlete.status.replace('_', ' ')} className={statusColor(athlete.status)} />
                  <Badge label={`${athlete.risk_level} risk`} className={riskColor(athlete.risk_level)} />
                </div>
                {(athlete as any).uid_code && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-400">UID:</span>
                    <span className="text-sm font-black font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg tracking-wider select-all">
                      {(athlete as any).uid_code}
                    </span>
                    <span className="text-xs text-gray-400">— used in all exports</span>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-0.5">
                  {athlete.sport}
                  {athlete.team ? ` · ${athlete.team}` : ''}
                  {athlete.position ? ` · ${athlete.position}` : ''}
                  {age ? ` · Age ${age}` : ''}
                </p>
                {/* Data pills */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { icon: Calendar, label: `${sessions.length} sessions` },
                    { icon: Activity, label: `${checkins.length} check-ins` },
                    { icon: Brain, label: `${assessments.length} assessments` },
                    { icon: Target, label: `${interventions.length} interventions` },
                    { icon: FileText, label: `${reports.length} reports` },
                    { icon: Folder, label: `${documents.length} documents` },
                    ...(physioRecords.length > 0 ? [{ icon: Watch, label: `${physioRecords.length} physio` }] : []),
                    ...(labSessions.length > 0 ? [{ icon: FlaskConical, label: `${labSessions.length} lab` }] : []),
                    ...(perfProfiles.length > 0 ? [{ icon: Dumbbell, label: `${perfProfiles.length} profiles` }] : []),
                  ].map(({ icon: Icon, label }) => (
                    <span key={label} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                      <Icon size={11} className="text-gray-400" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Alert if high/critical */}
            {(athlete.risk_level === 'high' || athlete.risk_level === 'critical') && (
              <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">
                  <strong>Elevated Risk:</strong> This athlete is flagged as <strong>{athlete.risk_level}</strong>. Ensure crisis protocols are active and regular monitoring is in place.
                </p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="min-h-96">
            {activeTab === 'overview' && (
              <OverviewTab athlete={athlete} sessions={sessions} checkins={checkins}
                assessments={assessments} interventions={interventions} reports={reports} />
            )}
            {activeTab === 'sessions' && <SessionsTab sessions={sessions} />}
            {activeTab === 'checkins' && <CheckInsTab checkins={checkins} />}
            {activeTab === 'assessments' && <AssessmentsTab assessments={assessments} />}
            {activeTab === 'interventions' && <InterventionsTab interventions={interventions} />}
            {activeTab === 'reports' && <ReportsTab reports={reports} athlete={athlete} />}
            {activeTab === 'physio' && (
              <PhysioWearablesTab physioRecords={physioRecords} />
            )}
            {activeTab === 'lab' && (
              <LabTechTab labSessions={labSessions} />
            )}
            {activeTab === 'neuro' && (
              <NeurocognitiveTab records={neuroRecords} />
            )}
            {activeTab === 'profiling' && (
              <PerfProfileTab profiles={perfProfiles} />
            )}
            {activeTab === 'documents' && athlete && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <Folder size={15} className="text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    Documents uploaded here are <strong>analysed by AI</strong> and automatically included in the
                    AI Case Summary and Full PDF export.
                  </p>
                </div>
                <AthleteDocumentsPanel
                  athleteId={athlete.id}
                  athleteName={`${athlete.first_name} ${athlete.last_name}`}
                  compact={false}
                />
              </div>
            )}
            {activeTab === 'ai' && (
              <AISummaryTab athlete={athlete} sessions={sessions} checkins={checkins} physioRecords={physioRecords} labSessions={labSessions} perfProfiles={perfProfiles}
                assessments={assessments} interventions={interventions} reports={reports}
                documents={documents} neuroRecords={neuroRecords} />
            )}
          </div>

          {/* Print footer */}
          <div className="hidden print:block text-center mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400">SPPS — Sport Psychology Practitioner Suite · Confidential Clinical Record</p>
            <p className="text-xs text-gray-400">This document is intended for clinical use only and must not be shared without practitioner authorisation.</p>
          </div>
        </div>
      ) : null}

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </AppShell>
  )
}

// ── Neurocognitive Tab ────────────────────────────────────────────────────────

const SENAPTEC_SKILLS_CF = [
  { key: 'visual_clarity',           label: 'Visual Clarity',          domain: 'visual' },
  { key: 'contrast_sensitivity',     label: 'Contrast Sensitivity',    domain: 'visual' },
  { key: 'near_far_quickness',       label: 'Near-Far Quickness',      domain: 'visual' },
  { key: 'target_capture',           label: 'Target Capture',          domain: 'visual' },
  { key: 'depth_sensitivity',        label: 'Depth Sensitivity',       domain: 'processing' },
  { key: 'perception_span',          label: 'Perception Span',         domain: 'processing' },
  { key: 'multiple_object_tracking', label: 'Multiple Object Tracking',domain: 'processing' },
  { key: 'reaction_time',            label: 'Reaction Time',           domain: 'reaction' },
  { key: 'peripheral_reaction',      label: 'Peripheral Reaction',     domain: 'reaction' },
  { key: 'go_no_go',                 label: 'Go / No Go',              domain: 'reaction' },
]

const NEURO_DOMAIN_COLORS: Record<string, { bg: string; text: string; radar: string }> = {
  visual:     { bg: 'bg-blue-50',   text: 'text-blue-700',   radar: '#3b82f6' },
  processing: { bg: 'bg-purple-50', text: 'text-purple-700', radar: '#8b5cf6' },
  reaction:   { bg: 'bg-green-50',  text: 'text-green-700',  radar: '#10b981' },
}

function getNeuroColor(pct: number) {
  if (pct >= 75) return 'text-emerald-600'
  if (pct >= 50) return 'text-blue-600'
  if (pct >= 25) return 'text-amber-600'
  return 'text-red-600'
}
function getNeuroLabel(pct: number) {
  if (pct >= 90) return 'Excellent'
  if (pct >= 75) return 'Above Avg'
  if (pct >= 50) return 'Average'
  if (pct >= 25) return 'Below Avg'
  return 'Poor'
}

function NeurocognitiveTab({ records }: { records: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Eye size={40} className="text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">No neurocognitive assessments for this athlete.</p>
        <p className="text-xs text-gray-300 mt-1">Log sessions via Neurocognitive in the sidebar.</p>
      </div>
    )
  }

  // Group by platform for a quick summary view
  const byPlatform = records.reduce((acc: Record<string, any[]>, r: any) => {
    const key = r.platform ?? 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <SectionHeader icon={Eye} title="Neurocognitive Assessments" count={records.length} color="blue" />

      {/* Platform summary cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        {Object.entries(byPlatform).map(([platform, recs]) => {
          const latest = recs[0]
          const scores = latest.senaptec_scores ?? {}
          const vals = SENAPTEC_SKILLS_CF.map(s => scores[s.key]).filter((v): v is number => v != null)
          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
          return (
            <Card key={platform} className="p-3">
              <p className="text-xs font-semibold text-gray-700 truncate">{platform}</p>
              <p className="text-xs text-gray-400 mt-0.5">{recs.length} session{recs.length > 1 ? 's' : ''} · Last {fmtDate(latest.test_date ?? latest.created_at)}</p>
              {avg != null && (
                <p className={`text-xl font-black mt-1 ${getNeuroColor(avg)}`}>
                  {avg}<span className="text-xs font-normal text-gray-400">th %ile</span>
                </p>
              )}
              {latest.context && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full capitalize">{latest.context.replace(/_/g,' ')}</span>
              )}
            </Card>
          )
        })}
      </div>

      {/* Latest SENAPTEC radar — if available */}
      {(() => {
        const latestSenaptec = records.find(r => r.platform === 'SENAPTEC Sensory Station' && r.senaptec_scores)
        if (!latestSenaptec) return null
        const scores = latestSenaptec.senaptec_scores
        const radarData = SENAPTEC_SKILLS_CF
          .filter(s => scores[s.key] != null)
          .map(s => ({ skill: s.label.split(' ')[0], percentile: scores[s.key], fullMark: 100 }))
        if (radarData.length < 3) return null
        return (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">SENAPTEC Latest Profile</p>
            <p className="text-xs text-gray-400 mb-3">vs {latestSenaptec.comparison_group} · {fmtDate(latestSenaptec.test_date ?? latestSenaptec.created_at)}</p>

            {/* Domain domain averages */}
            <div className="flex gap-2 mb-4">
              {(['visual','processing','reaction'] as const).map(domain => {
                const dc = NEURO_DOMAIN_COLORS[domain]
                const domainSkills = SENAPTEC_SKILLS_CF.filter(s => s.domain === domain)
                const vals = domainSkills.map(s => scores[s.key]).filter((v): v is number => v != null)
                if (!vals.length) return null
                const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
                return (
                  <div key={domain} className={`flex-1 text-center p-2 rounded-lg ${dc.bg}`}>
                    <p className={`text-sm font-bold ${dc.text}`}>{avg}th</p>
                    <p className={`text-xs capitalize ${dc.text}`}>{domain}</p>
                  </div>
                )
              })}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Radar */}
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} margin={{ top: 5, right: 25, bottom: 5, left: 25 }}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="skill" tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <Radar dataKey="percentile" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>

              {/* Skill bars */}
              <div className="space-y-1.5">
                {SENAPTEC_SKILLS_CF.filter(s => scores[s.key] != null).map(s => {
                  const pct = scores[s.key]
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">{s.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs font-semibold w-16 text-right shrink-0 ${getNeuroColor(pct)}`}>{pct}th · {getNeuroLabel(pct)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )
      })()}

      {/* Full session history */}
      <div className="space-y-3">
        {records.map((r: any) => {
          const isExp = expandedId === r.id
          const scores = r.senaptec_scores ?? {}
          const vals = SENAPTEC_SKILLS_CF.map(s => scores[s.key]).filter((v): v is number => v != null)
          const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExp ? null : r.id)}>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.platform}</p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(r.test_date ?? r.created_at)}
                    {r.context ? ` · ${r.context.replace(/_/g,' ')}` : ''}
                    {r.comparison_group ? ` · vs ${r.comparison_group}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {avg != null && (
                    <div className="text-right">
                      <p className={`text-lg font-black ${getNeuroColor(avg)}`}>{avg}<span className="text-xs font-normal text-gray-400">th</span></p>
                      <p className="text-xs text-gray-400">avg %ile</p>
                    </div>
                  )}
                  <ChevronRight size={15} className={`text-gray-400 transition-transform ${isExp ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {isExp && (
                <div className="mt-4 border-t pt-4 space-y-3">
                  {/* SENAPTEC skills breakdown */}
                  {r.senaptec_scores && (
                    <div>
                      {(['visual','processing','reaction'] as const).map(domain => {
                        const dc = NEURO_DOMAIN_COLORS[domain]
                        const domainSkills = SENAPTEC_SKILLS_CF.filter(s => s.domain === domain && scores[s.key] != null)
                        if (!domainSkills.length) return null
                        return (
                          <div key={domain} className="mb-3">
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 capitalize ${dc.text}`}>{domain} Skills</p>
                            {domainSkills.map(s => {
                              const pct = scores[s.key]
                              return (
                                <div key={s.key} className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-gray-500 w-36 shrink-0">{s.label}</span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${pct >= 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className={`text-xs font-semibold w-20 text-right ${getNeuroColor(pct)}`}>{pct}th · {getNeuroLabel(pct)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Custom metrics for non-SENAPTEC platforms */}
                  {r.custom_metrics && r.custom_metrics.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Metrics</p>
                      <div className="grid grid-cols-2 gap-2">
                        {r.custom_metrics.filter((m: any) => m.name).map((m: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <span className="text-xs text-gray-600 truncate">{m.name}</span>
                            <span className="text-xs font-bold text-gray-900 ml-2 shrink-0">{m.value} <span className="font-normal text-gray-400">{m.unit}</span></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.notes && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Clinical Notes</p>
                      <p className="text-sm text-gray-700">{r.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Physio & Wearables Tab ────────────────────────────────────────────────────

function PhysioWearablesTab({ physioRecords }: { physioRecords: any[] }) {
  const BRAINWAVE_BANDS_CF = ['delta','theta','alpha','beta','gamma']
  const trendData = [...physioRecords].reverse().slice(-20).map(r => ({
    date: fmtDate(r.created_at),
    HRV: r.hrv?.rmssd ?? null,
    RHR: r.vitals?.rhr ?? null,
    Recovery: r.wearable_data?.recovery_score ?? null,
    Coherence: r.wearable_data?.avg_coherence ?? null,
  }))

  if (physioRecords.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Activity size={40} className="text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">No psychophysiology or wearable records for this athlete.</p>
        <p className="text-xs text-gray-300 mt-1">Add records via Psychophysiology → Manual Records, or import via Wearables Import.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={Activity} title="Psychophysiology & Wearables" color="purple" />

      {/* Trend charts */}
      {trendData.length > 1 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {(['HRV','RHR','Recovery','Coherence'] as const).map(key => {
            const hasData = trendData.some(d => d[key] !== null)
            if (!hasData) return null
            const colors = { HRV: '#8b5cf6', RHR: '#ef4444', Recovery: '#10b981', Coherence: '#ec4899' }
            return (
              <Card key={key} className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{key} Trend</p>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={trendData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 8 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey={key} stroke={colors[key]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )
          })}
        </div>
      )}

      {/* Records list */}
      <div className="space-y-3">
        {physioRecords.slice(0, 15).map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-900">{fmtDate(r.created_at)} · <span className="text-gray-400 font-normal">{r.session_context?.replace(/_/g,' ')}</span></p>
              {r.device_used && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{r.device_used}</span>}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {r.hrv?.rmssd && <div className="text-center bg-purple-50 rounded-lg p-2"><p className="text-xs text-gray-400">HRV</p><p className="font-bold text-purple-700">{r.hrv.rmssd}</p></div>}
              {r.vitals?.rhr && <div className="text-center bg-red-50 rounded-lg p-2"><p className="text-xs text-gray-400">RHR</p><p className="font-bold text-red-700">{r.vitals.rhr}</p></div>}
              {r.vitals?.spo2 && <div className="text-center bg-blue-50 rounded-lg p-2"><p className="text-xs text-gray-400">SpO₂</p><p className="font-bold text-blue-700">{r.vitals.spo2}%</p></div>}
              {r.wearable_data?.recovery_score && <div className="text-center bg-green-50 rounded-lg p-2"><p className="text-xs text-gray-400">Recovery</p><p className="font-bold text-green-700">{r.wearable_data.recovery_score}%</p></div>}
              {r.wearable_data?.avg_coherence && <div className="text-center bg-pink-50 rounded-lg p-2"><p className="text-xs text-gray-400">Coherence</p><p className="font-bold text-pink-700">{r.wearable_data.avg_coherence}</p></div>}
              {r.wearable_data?.body_battery && <div className="text-center bg-amber-50 rounded-lg p-2"><p className="text-xs text-gray-400">Battery</p><p className="font-bold text-amber-700">{r.wearable_data.body_battery}</p></div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Lab Technology Tab ────────────────────────────────────────────────────────

function LabTechTab({ labSessions }: { labSessions: any[] }) {
  const byTech = labSessions.reduce((acc: Record<string, any[]>, s: any) => {
    if (!acc[s.technology]) acc[s.technology] = []
    acc[s.technology].push(s)
    return acc
  }, {})

  if (labSessions.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <FlaskConical size={40} className="text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">No Mental Performance Lab sessions for this athlete.</p>
        <p className="text-xs text-gray-300 mt-1">Log sessions via Mental Performance Lab in the sidebar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={FlaskConical} title="Mental Performance Lab" color="blue" />
      <div className="grid sm:grid-cols-2 gap-4">
        {Object.entries(byTech).map(([tech, sessions]) => {
          const latest = sessions[0]
          const label = tech.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
          return (
            <Card key={tech} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400">{sessions.length} sessions · Last: {latest?.session_date}</p>
                </div>
                {latest?.flags?.length > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ {latest.flags.length} flag{latest.flags.length > 1 ? 's' : ''}</span>
                )}
              </div>
              {latest?.scores && Object.keys(latest.scores).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(latest.scores as Record<string, any>).slice(0, 6).map(([k, v]) => (
                    <span key={k} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {k.replace(/_/g,' ')}: <strong>{typeof v === 'number' ? v.toFixed(1) : v}</strong>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Performance Profile Tab ───────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  mental_toughness: 'Mental Toughness', pre_competition: 'Pre-Competition State',
  performance_capacity: 'Performance Capacity', team_cohesion: 'Team Cohesion', flow_readiness: 'Flow Readiness',
}
const DOMAIN_COLORS_CF: Record<string, string> = {
  mental_toughness: '#3b82f6', pre_competition: '#f59e0b', performance_capacity: '#10b981',
  team_cohesion: '#8b5cf6', flow_readiness: '#f43f5e',
}

function PerfProfileTab({ profiles }: { profiles: any[] }) {
  const byDomain = profiles.reduce((acc: Record<string, any[]>, p: any) => {
    if (!acc[p.domain_id]) acc[p.domain_id] = []
    acc[p.domain_id].push(p)
    return acc
  }, {})

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Target size={40} className="text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">No performance profiles for this athlete.</p>
        <p className="text-xs text-gray-300 mt-1">Add profiles via Assessments → Performance Profiling tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={Target} title="Performance Profiles" color="green" />
      <div className="grid sm:grid-cols-2 gap-4">
        {Object.entries(byDomain).map(([domainId, domainProfiles]) => {
          const latest = domainProfiles[0]
          const color = DOMAIN_COLORS_CF[domainId] ?? '#6b7280'
          const radarData = Object.entries(latest.scores as Record<string, number>).map(([k, v]) => ({
            subject: k.replace(/_/g, ' ').split(' ').slice(0, 2).join(' '),
            value: v,
          }))
          const avg = (Object.values(latest.scores as Record<string, number>).reduce((a, b) => a + b, 0) / Object.values(latest.scores as Record<string, number>).length).toFixed(1)
          return (
            <Card key={domainId} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">{DOMAIN_LABELS[domainId] ?? domainId}</p>
                <span className="text-lg font-black" style={{ color }}>{avg}<span className="text-xs font-normal text-gray-400">/10</span></span>
              </div>
              {radarData.length >= 3 && (
                <ResponsiveContainer width="100%" height={160}>
                  <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#6b7280' }} />
                    <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-gray-400 mt-2">{domainProfiles.length} entr{domainProfiles.length === 1 ? 'y' : 'ies'} · Latest {fmtDate(latest.created_at)}</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
