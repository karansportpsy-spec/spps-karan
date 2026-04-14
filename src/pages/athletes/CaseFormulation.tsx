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
import { FlaskConical, Watch, Dumbbell, Bandage } from 'lucide-react'
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
  { id: 'injury',        label: 'Injury Psychology',  icon: Bandage },
  { id: 'daily_logs',    label: 'Daily Logs',         icon: BookOpen },
  { id: 'physio',        label: 'Physio & Wearables', icon: Activity },
  { id: 'lab',           label: 'Lab Technology',  icon: FlaskConical },
  { id: 'profiling',     label: 'Performance Profile', icon: Target },
  { id: 'ai',            label: 'AI Summary',     icon: Sparkles },
] as const

type TabId = typeof TABS[number]['id']  // includes 'documents'

// ── Hooks ─────────────────────────────────────────────────────────────────────

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


function useAthleteInjuries(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['injury_records', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('injury_records')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('date_of_injury', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}

function useAthletePsychReadiness(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['psych_readiness', user?.id, athleteId],
    enabled: !!user && !!athleteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('psych_readiness')
        .select('*')
        .eq('practitioner_id', user!.id)
        .eq('athlete_id', athleteId!)
        .order('assessed_at', { ascending: false })
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

function AISummaryTab({ athlete, sessions, checkins, assessments, interventions, reports, documents = [], physioRecords = [], labSessions = [], perfProfiles = [], injuryRecords = [], psychReadiness = [] }: any) {
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
        injuryRecords.length > 0 ? `INJURY PSYCHOLOGY (${injuryRecords.length} injuries):` : '',
        ...injuryRecords.slice(0, 6).map((r: any) => {
          const osiics = r.osiics_code_1 ? `${r.osiics_code_1} ${r.osiics_diagnosis_1 ?? ''}` : r.diagnosis_text
          return `  - ${r.date_of_injury} [${r.severity?.toUpperCase()} · ${r.status}] ${osiics} | Context: ${r.context} | Missed: ${r.missed_days ?? 0}d/${r.missed_matches ?? 0} matches | Psych referral: ${r.psych_referral_needed ? 'YES' : 'no'}${r.notes ? ` | ${r.notes.slice(0, 100)}` : ''}`
        }),
        psychReadiness.length > 0 ? `PSYCHOLOGICAL READINESS ASSESSMENTS (${psychReadiness.length}):` : '',
        ...psychReadiness.slice(0, 4).map((r: any) =>
          `  - ${r.assessed_at.slice(0,10)} | Overall readiness: ${r.overall_readiness}/100 | RTP cleared: ${r.ready_to_return ? 'YES' : 'NO'} | ACL-RSI: ${r.acl_psych_total ?? '—'} | SFK: ${r.sfk_total ?? '—'} | TFSI-R: ${r.tfsi_r_total ?? '—'}`
        ),
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
  const { data: injuryRecords = [] }  = useAthleteInjuries(athleteId)
  const { data: psychReadiness = [] } = useAthletePsychReadiness(athleteId)

  const athlete = athletes.find(a => a.id === athleteId)
  const loading = loadS || loadC || loadA || loadI || loadR || loadD

  function handlePrint() { window.print() }


  // ── Comprehensive PDF — all sections in one document ─────────────────────
  function generateComprehensivePDF() {
    if (!athlete) return

    const now   = new Date()
    const anon  = anonymise(athlete)
    const fullName = `${athlete.first_name} ${athlete.last_name}`
    const flagged  = checkins.filter((c: any) => c.flags?.length > 0)
    const completed = sessions.filter((s: any) => s.status === 'completed').length

    const avgMood   = checkins.length ? (checkins.reduce((a: number,c: any)=>a+c.mood_score,0)/checkins.length).toFixed(1) : '—'
    const avgStress = checkins.length ? (checkins.reduce((a: number,c: any)=>a+c.stress_score,0)/checkins.length).toFixed(1) : '—'
    const avgSleep  = checkins.length ? (checkins.reduce((a: number,c: any)=>a+c.sleep_score,0)/checkins.length).toFixed(1) : '—'
    const avgReady  = checkins.length ? (checkins.reduce((a: number,c: any)=>a+c.readiness_score,0)/checkins.length).toFixed(1) : '—'

    const riskColMap: Record<string,string> = { low:'#22c55e', moderate:'#f59e0b', high:'#ef4444', critical:'#7f1d1d' }
    const riskBgMap:  Record<string,string> = { low:'#dcfce7', moderate:'#fef3c7', high:'#fee2e2', critical:'#fecaca' }

    // ── Inline SVG helpers ────────────────────────────────────────────────────
    function svgBar(pct: number, color: string, h = 6): string {
      const w = Math.max(0, Math.min(100, pct))
      return `<div style="background:#e5e7eb;border-radius:3px;height:${h}px;overflow:hidden;flex:1">
        <div style="height:100%;width:${w}%;background:${color};border-radius:3px;transition:width .3s"></div></div>`
    }
    function scoreChip(val: number, max: number, color: string): string {
      return `<span style="font-weight:800;font-size:16px;color:${color}">${val}</span><span style="font-size:10px;color:#9ca3af;font-weight:400">/${max}</span>`
    }
    function trafficLight(val: number, goodAbove = 7): string {
      return val >= goodAbove ? '#22c55e' : val >= 5 ? '#f59e0b' : '#ef4444'
    }
    function hexagon(label: string, val: number, color: string): string {
      const pct = (val / 10) * 100
      return `<div style="text-align:center;min-width:70px">
        <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;
          background:conic-gradient(${color} 0% ${pct}%,#e5e7eb ${pct}% 100%);border-radius:50%;margin-bottom:4px">
          <div style="width:38px;height:38px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;
            font-size:14px;font-weight:800;color:${color}">${val}</div></div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;max-width:70px;line-height:1.2">${label}</div>
      </div>`
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#111827;background:#f8fafc;font-size:12px;line-height:1.6}
      .page{max-width:960px;margin:0 auto;padding:0 0 40px}

      /* ── Cover band ── */
      .cover{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1A2D4A 100%);padding:36px 48px 32px;color:#fff;position:relative;overflow:hidden}
      .cover::before{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;
        background:radial-gradient(circle,rgba(45,125,210,.25) 0%,transparent 70%);border-radius:50%}
      .cover::after{content:'';position:absolute;bottom:-40px;left:100px;width:180px;height:180px;
        background:radial-gradient(circle,rgba(61,220,132,.12) 0%,transparent 70%);border-radius:50%}
      .cover-brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
      .cover-logo{width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,.12);
        border:1.5px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;
        font-size:26px;font-weight:900;color:#3DDC84;backdrop-filter:blur(4px)}
      .cover-title{font-size:22px;font-weight:900;letter-spacing:.02em}
      .cover-title .mind{color:#3DDC84}
      .cover-sub{font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.12em;text-transform:uppercase;margin-top:2px}
      .cover-uid-label{font-size:10px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
      .cover-uid{font-family:monospace;font-size:32px;font-weight:900;letter-spacing:.08em;color:#fff;margin-bottom:10px}
      .cover-meta{font-size:12px;color:rgba(255,255,255,.7);margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap}
      .cover-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.03em}
      .cover-right{text-align:right;font-size:10px;color:rgba(255,255,255,.4);line-height:1.8;position:relative;z-index:1}
      .cover-right strong{color:rgba(255,255,255,.8);font-size:11px}
      .cover-confidential{font-size:10px;font-weight:700;color:#fca5a5;letter-spacing:.08em;text-transform:uppercase;
        background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:4px;padding:2px 8px;display:inline-block;margin-top:6px}
      .anon-notice{font-size:9.5px;color:rgba(255,255,255,.45);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
        border-radius:6px;padding:8px 12px;margin-top:16px;line-height:1.6;max-width:600px}

      /* ── Stats strip ── */
      .stats-strip{display:grid;grid-template-columns:repeat(8,1fr);background:#1A2D4A;padding:0}
      .stat-cell{padding:14px 8px;text-align:center;border-right:1px solid rgba(255,255,255,.08)}
      .stat-cell:last-child{border-right:none}
      .stat-num{font-size:22px;font-weight:900;color:#fff;line-height:1}
      .stat-lbl{font-size:8.5px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.07em;margin-top:3px}

      /* ── Body ── */
      .body{padding:28px 48px}

      /* ── Section ── */
      .section{margin-bottom:32px}
      .sec-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
      .sec-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
      .sec-title{font-size:14px;font-weight:800;color:#0f172a;letter-spacing:-.01em}
      .sec-pill{margin-left:auto;font-size:10px;font-weight:600;padding:2px 10px;border-radius:999px;background:#e0f2fe;color:#0369a1}

      /* ── Cards ── */
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
      .card.flagged{border-color:#fbbf24;background:#fffbeb}
      .card.danger{border-color:#fca5a5;background:#fef2f2}
      .card.success{border-color:#86efac;background:#f0fdf4}
      .card.info{border-color:#93c5fd;background:#eff6ff}

      /* ── Metric grids ── */
      .metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .metric-grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}
      .metric-cell{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .metric-val{font-size:22px;font-weight:900;line-height:1;margin-bottom:2px}
      .metric-lbl{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em}
      .metric-sub{font-size:10px;color:#6b7280;margin-top:2px}

      /* ── Tables ── */
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px}
      th{background:#f1f5f9;text-align:left;padding:7px 10px;font-weight:700;color:#475569;border-bottom:1.5px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      td{padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#374151;vertical-align:middle}
      tr:last-child td{border-bottom:none}
      tr:nth-child(even) td{background:#fafafa}
      tr:hover td{background:#f8fafc}

      /* ── Bars ── */
      .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
      .bar-name{font-size:11px;color:#374151;width:140px;flex-shrink:0;font-weight:500}
      .bar-val{font-size:11px;font-weight:700;width:32px;text-align:right;flex-shrink:0}

      /* ── Profile rings ── */
      .ring-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}

      /* ── Alert banners ── */
      .alert-high{background:#fef2f2;border:1.5px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#7f1d1d}
      .alert-warn{background:#fffbeb;border:1.5px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:#92400e}

      /* ── Two-col layout ── */
      .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}

      /* ── Tags / chips ── */
      .chip{display:inline-block;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:999px;margin-right:4px;margin-bottom:3px}
      .chip-blue{background:#dbeafe;color:#1d4ed8}
      .chip-green{background:#dcfce7;color:#15803d}
      .chip-amber{background:#fef3c7;color:#92400e}
      .chip-red{background:#fee2e2;color:#991b1b}
      .chip-purple{background:#ede9fe;color:#6d28d9}
      .chip-gray{background:#f3f4f6;color:#4b5563}

      /* ── HRV / wearable summary ── */
      .hrv-cell{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:10px;text-align:center}
      .hrv-val{font-size:20px;font-weight:900;color:#7c3aed}
      .hrv-lbl{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}

      /* ── Footer ── */
      .footer{margin-top:40px;padding:14px 48px;background:#f1f5f9;border-top:1px solid #e2e8f0;
        display:flex;justify-content:space-between;font-size:9.5px;color:#9ca3af}
      .footer strong{color:#64748b}

      @media print{
        body{background:#fff;font-size:11px}
        .page{max-width:100%}
        .body{padding:20px 32px}
        .cover{padding:24px 32px}
        .no-break{page-break-inside:avoid}
        .stats-strip .stat-num{font-size:18px}
      }
    `

    // ── COVER ─────────────────────────────────────────────────────────────────
    const riskC  = riskColMap[anon.risk_level] ?? '#6b7280'
    const riskBg = riskBgMap[anon.risk_level]  ?? '#f3f4f6'
    const cover = `
    <div class="cover">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1">
        <div>
          <div class="cover-brand">
            <div class="cover-logo">W</div>
            <div>
              <div class="cover-title">WIN<span class="mind">MIND</span>PERFORM</div>
              <div class="cover-sub">Sport Psychology Practitioner Suite · SPPS</div>
            </div>
          </div>
          <div class="cover-uid-label">Athlete Reference (anonymised)</div>
          <div class="cover-uid">${anon.uid_code}</div>
          <div class="cover-meta">
            <span>🏆 ${anon.sport}</span>
            <span>👤 ${anon.age_group}</span>
          </div>
          <span class="cover-badge" style="background:${riskBg};color:${riskC};margin-right:6px">${anon.risk_level.toUpperCase()} RISK</span>
          <span class="cover-badge" style="background:rgba(34,197,94,.15);color:#86efac">${anon.status.replace('_',' ').toUpperCase()}</span>
          <div class="anon-notice">
            ⚠ This document is anonymised in accordance with DPDP Act 2023. The athlete is identified by UID code only.
            No name, DOB, or contact details are included. Identity is resolvable only by the authorised practitioner via the SPPS platform.
          </div>
        </div>
        <div class="cover-right">
          <div><strong>Full Case Formulation Report</strong></div>
          <div>Generated: ${now.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
          <div style="margin-top:4px">${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          <div class="cover-confidential">CONFIDENTIAL — CLINICAL USE ONLY</div>
        </div>
      </div>
    </div>
    <div class="stats-strip">
      ${[
        ['Sessions', sessions.length],
        ['Check-ins', checkins.length],
        ['Assessments', assessments.length],
        ['Interventions', interventions.length],
        ['Documents', documents.length],
        ['Injuries', injuryRecords.length],
        ['Physio', physioRecords.length],
        ['Lab', labSessions.length],
        ['Profiles', perfProfiles.length],
      ].map(([l,v])=>`<div class="stat-cell"><div class="stat-num">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
    </div>`

    // ── Risk alert ────────────────────────────────────────────────────────────
    const riskAlert = (anon.risk_level==='high'||anon.risk_level==='critical')
      ? `<div class="alert-high no-break">⚠ <strong>Elevated Risk — ${anon.risk_level.toUpperCase()}:</strong>
          This athlete is flagged as ${anon.risk_level} risk. Ensure crisis protocols are active and documentation is current.</div>`
      : ''

    // ── SESSIONS ──────────────────────────────────────────────────────────────
    const sessHtml = sessions.length===0
      ? '<p style="color:#9ca3af;font-size:12px;padding:12px 0">No sessions recorded.</p>'
      : `<div class="metric-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
          <div class="metric-cell">
            <div class="metric-val" style="color:#3b82f6">${sessions.length}</div>
            <div class="metric-lbl">Total</div>
          </div>
          <div class="metric-cell">
            <div class="metric-val" style="color:#22c55e">${completed}</div>
            <div class="metric-lbl">Completed</div>
          </div>
          <div class="metric-cell">
            <div class="metric-val" style="color:#f59e0b">${sessions.filter((s:any)=>s.status==='scheduled').length}</div>
            <div class="metric-lbl">Upcoming</div>
          </div>
        </div>
        <table class="no-break">
          <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Duration</th><th>Risk</th><th>Notes / Goals</th></tr></thead>
          <tbody>${sessions.map((s:any)=>{
            const statusColors: Record<string,string>={completed:'chip-green',cancelled:'chip-gray',no_show:'chip-red',scheduled:'chip-blue'}
            return `<tr>
              <td style="white-space:nowrap;font-weight:500">${fmtDate(s.scheduled_at)}</td>
              <td>${s.session_type.replace(/_/g,' ')}</td>
              <td><span class="chip ${statusColors[s.status]??'chip-gray'}">${s.status.replace('_',' ')}</span></td>
              <td>${s.duration_minutes??'—'}min</td>
              <td>${s.risk_assessment?`<span class="chip chip-${s.risk_assessment==='high'||s.risk_assessment==='critical'?'red':s.risk_assessment==='moderate'?'amber':'green'}">${s.risk_assessment}</span>`:'—'}</td>
              <td style="max-width:200px;font-size:10.5px">${[s.notes?redactNote(s.notes,fullName).slice(0,150):'',s.goals?'Goals: '+redactNote(s.goals,fullName):'',s.homework?'HW: '+redactNote(s.homework,fullName):''].filter(Boolean).join(' | ')||'—'}</td>
            </tr>`
          }).join('')}</tbody>
        </table>`

    // ── CHECK-INS ─────────────────────────────────────────────────────────────
    const scoreColor = (v: number) => v>=7?'#22c55e':v>=5?'#f59e0b':'#ef4444'
    const chkHtml = checkins.length===0
      ? '<p style="color:#9ca3af;font-size:12px;padding:12px 0">No check-ins recorded.</p>'
      : `<div class="metric-grid-5">
          ${[['Mood',avgMood,'#3b82f6'],['Stress',avgStress,'#ef4444'],['Sleep',avgSleep,'#f59e0b'],['Readiness',avgReady,'#10b981'],['Flagged',String(flagged.length),'#f43f5e']].map(([l,v,c])=>`
          <div class="metric-cell">
            <div class="metric-val" style="color:${c}">${v}</div>
            <div class="metric-lbl">${l}</div>
            ${l!=='Flagged'&&v!=='—'?`<div style="margin-top:6px">${svgBar(parseFloat(v as string)*10,c as string,5)}</div>`:''}
          </div>`).join('')}
        </div>
        ${flagged.length>0?`<div class="alert-warn no-break">⚠ ${flagged.length} flagged check-in${flagged.length>1?'s':''}: ${[...new Set(flagged.flatMap((c:any)=>c.flags??[]))].join(', ')}</div>`:''}
        <table class="no-break">
          <thead><tr><th>Date</th><th>Mood</th><th>Stress</th><th>Sleep</th><th>Motivation</th><th>Readiness</th><th>Flags</th><th>Notes</th></tr></thead>
          <tbody>${checkins.map((c:any)=>`<tr>
            <td style="white-space:nowrap;font-size:10.5px;font-weight:500">${fmtDate(c.checked_in_at)}</td>
            <td><strong style="color:${scoreColor(c.mood_score)}">${c.mood_score}</strong></td>
            <td><strong style="color:${scoreColor(10-c.stress_score)}">${c.stress_score}</strong></td>
            <td><strong style="color:${scoreColor(c.sleep_score)}">${c.sleep_score}</strong></td>
            <td><strong style="color:${scoreColor(c.motivation_score??5)}">${c.motivation_score??'—'}</strong></td>
            <td><strong style="color:${scoreColor(c.readiness_score)}">${c.readiness_score}</strong></td>
            <td style="color:#ef4444;font-size:10px">${c.flags?.join(', ')||'—'}</td>
            <td style="font-size:10.5px;max-width:180px;color:#6b7280">${c.notes?redactNote(c.notes,fullName).slice(0,120):'—'}</td>
          </tr>`).join('')}</tbody>
        </table>`

    // ── ASSESSMENTS ───────────────────────────────────────────────────────────
    const asmHtml = assessments.length===0
      ? '<p style="color:#9ca3af;font-size:12px;padding:12px 0">No assessments administered.</p>'
      : assessments.map((a:any)=>{
          const isExt = String(a.tool).startsWith('EXTERNAL:')
          const tname = isExt ? String(a.tool).replace('EXTERNAL:','') : a.tool
          const scoreEntries = Object.entries(a.scores??{})
          const bars = scoreEntries.map(([n,v])=>{
            const num = v as number
            const max = 30
            const pct = Math.min((num/max)*100,100)
            const col  = num>=(max*0.7)?'#22c55e':num>=(max*0.4)?'#f59e0b':'#ef4444'
            return `<div class="bar-row">
              <span class="bar-name">${n}</span>
              <div style="flex:1;display:flex;align-items:center;gap:8px">${svgBar(pct,col,8)}</div>
              <span class="bar-val" style="color:${col}">${num}</span>
            </div>`
          }).join('')
          return `<div class="card no-break" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="chip chip-blue" style="font-size:11px;font-weight:800;padding:3px 10px">${tname}</span>
                ${isExt?'<span class="chip chip-gray">Offline</span>':''}
                <span style="font-size:10.5px;color:#6b7280">${fmtDate(a.administered_at)}</span>
              </div>
              <div style="text-align:right">
                <span style="font-size:22px;font-weight:900;color:#1A2D4A">${a.total_score}</span>
                <span style="font-size:10px;color:#9ca3af;margin-left:2px">total score</span>
              </div>
            </div>
            ${bars}
            ${a.notes?`<div style="margin-top:10px;background:#f8fafc;border-radius:6px;padding:8px 12px;font-size:11px;color:#374151;border-left:3px solid #93c5fd">
              <strong style="color:#1d4ed8">Notes:</strong> ${redactNote(a.notes,fullName).slice(0,300)}</div>`:''}
          </div>`
        }).join('')

    // ── INTERVENTIONS ─────────────────────────────────────────────────────────
    const byCat: Record<string,any[]> = {}
    interventions.forEach((i:any)=>{ if(!byCat[i.category])byCat[i.category]=[]; byCat[i.category].push(i) })
    const intHtml = interventions.length===0
      ? '<p style="color:#9ca3af;font-size:12px;padding:12px 0">No interventions logged.</p>'
      : Object.entries(byCat).map(([cat,list])=>`
          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;
              margin-bottom:8px;display:flex;align-items:center;gap:6px">
              <span style="width:4px;height:16px;background:#3b82f6;border-radius:2px;display:inline-block"></span>
              ${cat.replace(/_/g,' ')} · ${list.length}
            </div>
            ${list.map((i:any)=>`<div class="card no-break" style="margin-bottom:6px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between">
                <div style="font-weight:600;font-size:12px;color:#0f172a">${i.title}</div>
                ${i.rating?`<div style="color:#f59e0b;font-size:13px;flex-shrink:0">${'★'.repeat(i.rating)}${'☆'.repeat(5-i.rating)}</div>`:''}
              </div>
              ${i.description?`<div style="font-size:11px;color:#6b7280;margin-top:4px">${redactNote(i.description,fullName).slice(0,200)}</div>`:''}
              ${i.outcome?`<div style="font-size:11px;color:#059669;margin-top:5px;display:flex;align-items:center;gap:4px">
                <span style="font-size:14px">✓</span> ${redactNote(i.outcome,fullName).slice(0,150)}</div>`:''}
              <div style="font-size:10px;color:#d1d5db;margin-top:5px">${fmtDate(i.created_at)}</div>
            </div>`).join('')}
          </div>`).join('')


    // ── INJURY PSYCHOLOGY ─────────────────────────────────────────────────────
    const severityColor: Record<string,string> = {
      minimal:'#22c55e', mild:'#84cc16', moderate:'#f59e0b',
      severe:'#ef4444', career_threatening:'#7f1d1d'
    }
    const injuryHtml = injuryRecords.length===0 ? '' : (() => {
      const active = injuryRecords.filter((r:any)=>r.status!=='recovered').length
      const rtp_cleared = psychReadiness.filter((r:any)=>r.ready_to_return).length
      const avgReadiness = psychReadiness.length
        ? (psychReadiness.reduce((a:number,r:any)=>a+r.overall_readiness,0)/psychReadiness.length).toFixed(0) : null

      // ── Extract map callbacks to avoid triple-nested template literals (Rolldown parse bug) ──
      const injuryRows = injuryRecords.map((r:any) => {
        const diagLabel = r.osiics_code_1
          ? '<span class="chip chip-purple" style="font-size:9px">' + r.osiics_code_1 + '</span> ' + (r.osiics_diagnosis_1 ?? r.diagnosis_text)
          : r.diagnosis_text
        const statusClass = r.status === 'recovered' ? 'chip-green' : r.status === 'acute' ? 'chip-red' : 'chip-amber'
        const sevColor = severityColor[r.severity] ?? '#6b7280'
        const psychRef = r.psych_referral_needed ? '<span style="color:#dc2626;font-weight:700">⚠ YES</span>' : '—'
        return '<tr>' +
          '<td style="white-space:nowrap;font-weight:500">' + r.date_of_injury + '</td>' +
          '<td style="font-size:10.5px">' + diagLabel + '</td>' +
          '<td>' + r.context + '</td>' +
          '<td><span style="font-weight:700;color:' + sevColor + '">' + r.severity + '</span></td>' +
          '<td><span class="chip ' + statusClass + '">' + r.status + '</span></td>' +
          '<td style="font-size:10.5px">' + (r.missed_days ?? 0) + 'd / ' + (r.missed_matches ?? 0) + ' matches</td>' +
          '<td style="text-align:center">' + psychRef + '</td>' +
          '</tr>'
      }).join('')

      const readinessRows = psychReadiness.map((r:any) => {
        const col = r.overall_readiness >= 70 ? '#22c55e' : r.overall_readiness >= 50 ? '#f59e0b' : '#ef4444'
        const rtpCell = r.ready_to_return
          ? '<span style="color:#16a34a;font-weight:700">✓ CLEARED</span>'
          : '<span style="color:#ef4444">Not cleared</span>'
        return '<tr>' +
          '<td style="white-space:nowrap;font-weight:500">' + (r.assessed_at?.slice(0, 10) ?? '—') + '</td>' +
          '<td><span style="font-size:16px;font-weight:900;color:' + col + '">' + r.overall_readiness + '%</span></td>' +
          '<td>' + rtpCell + '</td>' +
          '<td>' + (r.acl_psych_total ?? '—') + '</td>' +
          '<td>' + (r.sfk_total ?? '—') + '</td>' +
          '<td>' + (r.tfsi_r_total ?? '—') + '</td>' +
          '<td style="font-size:10px;max-width:160px;color:#6b7280">' + (r.notes?.slice(0, 100) ?? '—') + '</td>' +
          '</tr>'
      }).join('')

      const readinessSection = psychReadiness.length > 0
        ? '<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Psychological Readiness Assessments</div>' +
          '<table class="no-break"><thead><tr><th>Date</th><th>Overall Readiness</th><th>RTP Cleared</th><th>ACL-RSI</th><th>SFK-11</th><th>TFSI-R</th><th>Notes</th></tr></thead>' +
          '<tbody>' + readinessRows + '</tbody></table></div>'
        : ''

      const avgReadinessColor = avgReadiness && parseInt(avgReadiness) >= 70 ? '#22c55e' : avgReadiness ? '#f59e0b' : '#9ca3af'
      const avgReadinessVal = (avgReadiness ?? '—') + (avgReadiness ? '%' : '')

      return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">' +
        '<div class="metric-cell"><div class="metric-val" style="color:#ef4444">' + injuryRecords.length + '</div><div class="metric-lbl">Total Injuries</div></div>' +
        '<div class="metric-cell"><div class="metric-val" style="color:#f59e0b">' + active + '</div><div class="metric-lbl">Active</div></div>' +
        '<div class="metric-cell"><div class="metric-val" style="color:#8b5cf6">' + psychReadiness.length + '</div><div class="metric-lbl">Readiness Assessments</div></div>' +
        '<div class="metric-cell"><div class="metric-val" style="color:' + avgReadinessColor + '">' + avgReadinessVal + '</div><div class="metric-lbl">Avg Readiness</div></div>' +
        '</div>' +
        '<table class="no-break">' +
        '<thead><tr><th>Date</th><th>OSIICS / Diagnosis</th><th>Context</th><th>Severity</th><th>Status</th><th>Missed</th><th>Psych Ref</th></tr></thead>' +
        '<tbody>' + injuryRows + '</tbody></table>' +
        readinessSection
    })()

    // ── PHYSIO & WEARABLES ────────────────────────────────────────────────────
    const physioHtml = physioRecords.length===0 ? '' : (() => {
      const latestHrv = physioRecords.find((r:any)=>r.hrv?.rmssd)
      const avgHrv = physioRecords.filter((r:any)=>r.hrv?.rmssd).length
        ? (physioRecords.filter((r:any)=>r.hrv?.rmssd).reduce((a:number,r:any)=>a+r.hrv.rmssd,0)/physioRecords.filter((r:any)=>r.hrv?.rmssd).length).toFixed(1) : '—'
      const avgRhr = physioRecords.filter((r:any)=>r.vitals?.rhr).length
        ? (physioRecords.filter((r:any)=>r.vitals?.rhr).reduce((a:number,r:any)=>a+r.vitals.rhr,0)/physioRecords.filter((r:any)=>r.vitals?.rhr).length).toFixed(0) : '—'
      const wearableRecs = physioRecords.filter((r:any)=>r.wearable_data)
      const avgRecovery = wearableRecs.filter((r:any)=>r.wearable_data?.recovery_score).length
        ? (wearableRecs.filter((r:any)=>r.wearable_data?.recovery_score).reduce((a:number,r:any)=>a+r.wearable_data.recovery_score,0)/wearableRecs.filter((r:any)=>r.wearable_data?.recovery_score).length).toFixed(0) : null
      const avgCoherence = wearableRecs.filter((r:any)=>r.wearable_data?.avg_coherence).length
        ? (wearableRecs.filter((r:any)=>r.wearable_data?.avg_coherence).reduce((a:number,r:any)=>a+r.wearable_data.avg_coherence,0)/wearableRecs.filter((r:any)=>r.wearable_data?.avg_coherence).length).toFixed(2) : null

      return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div class="hrv-cell"><div class="hrv-val">${avgHrv}${avgHrv!=='—'?'<span style="font-size:10px;color:#9ca3af"> ms</span>':''}</div><div class="hrv-lbl">Avg HRV RMSSD</div></div>
        <div class="hrv-cell" style="background:#fff5f5;border-color:#fecaca"><div class="hrv-val" style="color:#dc2626">${avgRhr}${avgRhr!=='—'?'<span style="font-size:10px;color:#9ca3af"> bpm</span>':''}</div><div class="hrv-lbl">Avg RHR</div></div>
        ${avgRecovery?`<div class="hrv-cell" style="background:#f0fdf4;border-color:#86efac"><div class="hrv-val" style="color:#16a34a">${avgRecovery}%</div><div class="hrv-lbl">Avg Recovery</div></div>`:'<div class="hrv-cell" style="opacity:.4"><div class="hrv-val">—</div><div class="hrv-lbl">Recovery</div></div>'}
        ${avgCoherence?`<div class="hrv-cell" style="background:#fdf4ff;border-color:#e9d5ff"><div class="hrv-val" style="color:#9333ea">${avgCoherence}</div><div class="hrv-lbl">Avg Coherence</div></div>`:'<div class="hrv-cell" style="opacity:.4"><div class="hrv-val">—</div><div class="hrv-lbl">Coherence</div></div>'}
      </div>
      <table class="no-break">
        <thead><tr><th>Date</th><th>Context</th><th>HRV RMSSD</th><th>RHR</th><th>SpO₂</th><th>Recovery</th><th>Coherence</th><th>Device</th></tr></thead>
        <tbody>${physioRecords.slice(0,20).map((r:any)=>`<tr>
          <td style="white-space:nowrap;font-weight:500">${fmtDate(r.created_at)}</td>
          <td><span class="chip chip-gray">${(r.session_context??'').replace(/_/g,' ')}</span></td>
          <td style="font-weight:700;color:#7c3aed">${r.hrv?.rmssd??'—'}${r.hrv?.rmssd?'ms':''}</td>
          <td style="font-weight:700;color:#dc2626">${r.vitals?.rhr??'—'}${r.vitals?.rhr?' bpm':''}</td>
          <td>${r.vitals?.spo2??'—'}${r.vitals?.spo2?'%':''}</td>
          <td style="font-weight:700;color:#16a34a">${r.wearable_data?.recovery_score??'—'}${r.wearable_data?.recovery_score?'%':''}</td>
          <td style="color:#9333ea">${r.wearable_data?.avg_coherence??'—'}</td>
          <td style="font-size:10px;color:#9ca3af">${r.device_used??'—'}</td>
        </tr>`).join('')}</tbody>
      </table>`
    })()

    // ── LAB TECHNOLOGY ────────────────────────────────────────────────────────
    const labHtml = labSessions.length===0 ? '' : (() => {
      const byTech: Record<string,any[]> = {}
      labSessions.forEach((s:any)=>{ if(!byTech[s.technology])byTech[s.technology]=[]; byTech[s.technology].push(s) })
      return Object.entries(byTech).map(([tech, sessions])=>{
        const latest = sessions[0]
        const label = tech.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())
        const scoreRows = Object.entries(latest.scores??{}).slice(0,8).map(([k,v])=>{
          const num = typeof v==='number' ? v : null
          return `<div class="bar-row" style="margin-bottom:5px">
            <span class="bar-name" style="width:160px">${k.replace(/_/g,' ')}</span>
            ${num!=null?`<div style="flex:1;display:flex;align-items:center;gap:8px">${svgBar(Math.min(num,100),'#3b82f6',6)}</div><span class="bar-val">${num}</span>`:`<span style="font-size:11px;color:#9ca3af">${v}</span>`}
          </div>`
        }).join('')
        return `<div class="card no-break" style="margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="chip chip-purple" style="font-size:11px;font-weight:800">${label}</span>
              <span style="font-size:10.5px;color:#9ca3af">${sessions.length} session${sessions.length>1?'s':''}</span>
            </div>
            <span style="font-size:10px;color:#9ca3af">Latest: ${latest.session_date}</span>
          </div>
          ${scoreRows}
          ${latest.flags?.length>0?`<div class="alert-warn" style="margin-top:8px;margin-bottom:0">⚠ ${latest.flags.join(' · ')}</div>`:''}
          ${latest.notes?`<div style="font-size:11px;color:#6b7280;margin-top:6px;font-style:italic">${latest.notes}</div>`:''}
        </div>`
      }).join('')
    })()

    // ── PERFORMANCE PROFILES ──────────────────────────────────────────────────
    const domainColors: Record<string,string> = {
      mental_toughness:'#3b82f6', pre_competition:'#f59e0b',
      performance_capacity:'#10b981', team_cohesion:'#8b5cf6', flow_readiness:'#f43f5e',
    }
    const domainLabels: Record<string,string> = {
      mental_toughness:'Mental Toughness', pre_competition:'Pre-Competition State',
      performance_capacity:'Performance Capacity', team_cohesion:'Team Cohesion', flow_readiness:'Flow Readiness',
    }
    const profHtml = perfProfiles.length===0 ? '' : (() => {
      const byDomain: Record<string,any[]> = {}
      perfProfiles.forEach((p:any)=>{ if(!byDomain[p.domain_id])byDomain[p.domain_id]=[]; byDomain[p.domain_id].push(p) })
      return `<div class="two-col" style="gap:14px">${Object.entries(byDomain).map(([dom, profiles])=>{
        const latest = profiles[0]
        const color = domainColors[dom]??'#6b7280'
        const label = domainLabels[dom]??dom.replace(/_/g,' ')
        const scores = Object.entries(latest.scores as Record<string,number>)
        const avg = scores.length ? (scores.reduce((a,[,v])=>a+v,0)/scores.length).toFixed(1) : '0'
        const rings = scores.slice(0,6).map(([k,v])=>hexagon(k.replace(/_/g,' ').split(' ').slice(0,2).join(' '),v,color)).join('')
        return `<div class="card no-break">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div>
              <div style="font-size:12px;font-weight:800;color:#0f172a">${label}</div>
              <div style="font-size:10px;color:#9ca3af">${profiles.length} entr${profiles.length===1?'y':'ies'} · Latest ${fmtDate(latest.created_at)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:26px;font-weight:900;color:${color};line-height:1">${avg}</div>
              <div style="font-size:9px;color:#9ca3af">/10 avg</div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${rings}</div>
          ${latest.notes?`<div style="margin-top:10px;font-size:11px;color:#6b7280;font-style:italic">${latest.notes}</div>`:''}
        </div>`
      }).join('')}</div>`
    })()

    // ── DOCUMENTS ─────────────────────────────────────────────────────────────
    const docsHtml = documents.length===0 ? '' :
      documents.map((d:any)=>{
        const findings = Array.isArray(d.ai_key_findings) ? d.ai_key_findings : []
        const flags = Array.isArray(d.ai_flags) ? d.ai_flags : []
        const catLabel = String(d.document_category??'other').replace(/_/g,' ')
        return `<div class="card no-break ${flags.length?'flagged':''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
            <div>
              <span class="chip chip-gray" style="text-transform:capitalize">${catLabel}</span>
              <strong style="font-size:12px;color:#0f172a;margin-left:4px">${d.file_name}</strong>
            </div>
            <div style="text-align:right">
              ${d.ai_confidence?`<span class="chip ${d.ai_confidence>=70?'chip-green':d.ai_confidence>=40?'chip-amber':'chip-red'}">${d.ai_confidence}% confidence</span>`:'' }
              <div style="font-size:10px;color:#9ca3af;margin-top:2px">${fmtDate(d.uploaded_at)}</div>
            </div>
          </div>
          ${d.ai_summary?`<p style="font-size:11.5px;color:#374151;line-height:1.7;margin-bottom:8px">${d.ai_summary}</p>`:''}
          ${findings.length>0?`<div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Key Findings</div>
            ${findings.map((f:string)=>`<div style="font-size:11px;color:#374151;padding:3px 0 3px 12px;border-left:2px solid #93c5fd;margin-bottom:3px">${f}</div>`).join('')}
          </div>`:''}
          ${flags.length>0?`<div class="alert-warn" style="margin-bottom:6px">
            ${flags.map((f:string)=>`<div>⚠ ${f}</div>`).join('')}</div>`:''}
          ${d.ai_recommendations?`<div style="font-size:11px;color:#1d4ed8;display:flex;align-items:flex-start;gap:4px">
            <span style="color:#3b82f6;font-size:14px">→</span> ${d.ai_recommendations}</div>`:''}
          ${d.practitioner_notes?`<div style="margin-top:8px;background:#f8fafc;border-radius:6px;padding:8px 12px;font-size:11px;color:#374151">
            <strong>Practitioner:</strong> ${d.practitioner_notes}</div>`:''}
        </div>`
      }).join('')

    // ── REPORTS ───────────────────────────────────────────────────────────────
    const repHtml = reports.length===0
      ? '<p style="color:#9ca3af;font-size:12px;padding:12px 0">No reports generated.</p>'
      : reports.map((r:any)=>`<div class="card no-break">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <strong style="font-size:12px;color:#0f172a">${r.title}</strong>
            <div style="display:flex;align-items:center;gap:6px">
              ${r.is_ai_generated?'<span class="chip chip-purple">AI Generated</span>':''}
              <span style="font-size:10px;color:#9ca3af">${fmtDate(r.generated_at)}</span>
            </div>
          </div>
          <span class="chip chip-blue">${(r.report_type??'custom').replace(/_/g,' ')}</span>
          ${r.content?`<div style="margin-top:8px;font-size:11px;color:#374151;line-height:1.7;border-top:1px solid #f1f5f9;padding-top:8px">${redactNote(r.content,fullName).slice(0,600)}${r.content.length>600?'…':''}</div>`:''}
        </div>`).join('')

    // ── Section builder ───────────────────────────────────────────────────────
    function sec(icon: string, iconBg: string, title: string, pill: string, content: string): string {
      return `<div class="section no-break">
        <div class="sec-head">
          <div class="sec-icon" style="background:${iconBg}">${icon}</div>
          <span class="sec-title">${title}</span>
          <span class="sec-pill">${pill}</span>
        </div>
        ${content}
      </div>`
    }

    // ── Assemble final HTML ───────────────────────────────────────────────────
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
      <title>Case Formulation — ${anon.uid_code}</title>
      <style>${css}</style></head><body>
      <div class="page">
        ${cover}
        <div class="body">
          ${riskAlert}
          ${sec('📅','#dbeafe','Sessions',`${sessions.length} total · ${completed} completed`,sessHtml)}
          ${sec('📊','#dcfce7','Daily Check-ins',`${checkins.length} records · ${flagged.length} flagged`,chkHtml)}
          ${sec('🧠','#ede9fe','Assessments',`${assessments.length} administered`,asmHtml)}
          ${sec('🎯','#fef3c7','Interventions',`${interventions.length} total`,intHtml)}
          ${injuryRecords.length>0?sec('🩹','#fff1f2','Injury Psychology',`${injuryRecords.length} injuries · ${psychReadiness.length} readiness assessments`,injuryHtml):''}
          ${physioRecords.length>0?sec('💓','#fdf4ff','Psychophysiology & Wearables',`${physioRecords.length} records`,physioHtml):''}
          ${labSessions.length>0?sec('🧪','#f0fdf4','Mental Performance Lab',`${labSessions.length} sessions`,labHtml):''}
          ${perfProfiles.length>0?sec('🎯','#fff7ed','Performance Profiles',`${perfProfiles.length} entries`,profHtml):''}
          ${documents.length>0?sec('📁','#f1f5f9','Uploaded Documents',`${documents.length} document${documents.length>1?'s':''}`,docsHtml):''}
          ${reports.length>0?sec('📄','#ecfdf5','Reports',`${reports.length} generated`,repHtml):''}

          <div style="background:linear-gradient(135deg,#fffbeb,#fefce8);border:1px solid #fbbf24;border-radius:10px;
            padding:14px 18px;font-size:10px;color:#92400e;line-height:1.7;margin-top:8px">
            <strong>ANONYMISATION NOTICE:</strong> This document identifies athletes by UID code only.
            No personally identifiable information (name, DOB, or contact details) is included.
            The UID–identity mapping is maintained securely by the authorised practitioner in the SPPS platform.
            Unauthorised disclosure is prohibited. DPDP Act 2023 compliant.
          </div>
        </div>
        <div class="footer">
          <div><strong>WinMindPerform</strong> — Sport Psychology Practitioner Suite (SPPS)</div>
          <div>Anonymised Document · UID-referenced · No PII</div>
          <div>${now.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
      </div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = `CaseReport_${anon.uid_code}_${now.toISOString().slice(0,10)}.html`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000)
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
      `${'═'.repeat(60)}`,
      `WinMindPerform — Sport Psychology Practitioner Suite`,
      `This document contains no personal identifiable information.`,
      `Athlete identity resolvable only by the authorised practitioner.`,
    ].filter(l => l !== undefined).join('\n')

    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    // Filename uses UID only — no personal details
    link.download = `${anon.uid_code}_CaseFormulation_${new Date().toISOString().slice(0,10)}.txt`
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
            {activeTab === 'injury' && (
              <InjuryPsychTab injuryRecords={injuryRecords} psychReadiness={psychReadiness} />
            )}
            {activeTab === 'daily_logs' && (
              <AthleteDailyLogsPanel athleteId={athleteId!} />
            )}
            {activeTab === 'physio' && (
              <PhysioWearablesTab physioRecords={physioRecords} />
            )}
            {activeTab === 'lab' && (
              <LabTechTab labSessions={labSessions} />
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
                documents={documents} injuryRecords={injuryRecords} psychReadiness={psychReadiness} />
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

// ── Injury Psychology Tab ─────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  minimal: 'bg-green-100 text-green-700',
  mild: 'bg-lime-100 text-lime-700',
  moderate: 'bg-amber-100 text-amber-700',
  severe: 'bg-red-100 text-red-700',
  career_threatening: 'bg-red-200 text-red-900',
}

const STATUS_COLORS: Record<string, string> = {
  acute: 'bg-red-100 text-red-700',
  subacute: 'bg-orange-100 text-orange-700',
  chronic: 'bg-amber-100 text-amber-700',
  recovered: 'bg-green-100 text-green-700',
  reinjury: 'bg-rose-100 text-rose-900',
}

function InjuryPsychTab({ injuryRecords, psychReadiness }: { injuryRecords: any[], psychReadiness: any[] }) {
  if (injuryRecords.length === 0 && psychReadiness.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Bandage size={40} className="text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">No injury records for this athlete.</p>
        <p className="text-xs text-gray-300 mt-1">Log injuries via Injury Psychology in the sidebar.</p>
      </div>
    )
  }

  const active = injuryRecords.filter(r => r.status !== 'recovered')
  const avgReadiness = psychReadiness.length
    ? (psychReadiness.reduce((a, r) => a + r.overall_readiness, 0) / psychReadiness.length).toFixed(0)
    : null
  const latestRTP = psychReadiness[0]

  return (
    <div className="space-y-5">
      <SectionHeader icon={Bandage} title="Injury Psychology" color="red" />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-2xl font-black text-gray-900">{injuryRecords.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total Injuries</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-black text-amber-600">{active.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Active / Ongoing</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-2xl font-black text-purple-600">{psychReadiness.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Readiness Assessments</p>
        </Card>
        <Card className={`p-3 text-center ${latestRTP?.ready_to_return ? 'border-green-200 bg-green-50' : latestRTP ? 'border-red-200 bg-red-50' : ''}`}>
          <p className={`text-2xl font-black ${latestRTP?.ready_to_return ? 'text-green-600' : latestRTP ? 'text-red-600' : 'text-gray-300'}`}>
            {avgReadiness ? `${avgReadiness}%` : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Avg Readiness</p>
        </Card>
      </div>

      {/* Latest RTP banner */}
      {latestRTP && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${latestRTP.ready_to_return ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${latestRTP.ready_to_return ? 'bg-green-100' : 'bg-red-100'}`}>
            {latestRTP.ready_to_return
              ? <CheckCircle size={20} className="text-green-600" />
              : <AlertTriangle size={20} className="text-red-600" />}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${latestRTP.ready_to_return ? 'text-green-700' : 'text-red-700'}`}>
              Latest Assessment: {latestRTP.ready_to_return ? 'CLEARED for Return to Play' : 'NOT YET CLEARED for Return to Play'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtDate(latestRTP.assessed_at)} · Overall readiness: {latestRTP.overall_readiness}% ·
              ACL-RSI: {latestRTP.acl_psych_total ?? '—'} · SFK-11: {latestRTP.sfk_total ?? '—'} · TFSI-R: {latestRTP.tfsi_r_total ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Injury records */}
      {injuryRecords.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Injury Log</p>
          {injuryRecords.map((r: any) => (
            <Card key={r.id} className={`p-4 ${r.psych_referral_needed ? 'border-amber-200' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {r.osiics_code_1 && (
                      <span className="text-xs font-mono font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{r.osiics_code_1}</span>
                    )}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_COLORS[r.severity] ?? 'bg-gray-100 text-gray-600'}`}>{r.severity}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    {r.psych_referral_needed && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} /> Psych referral needed
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {r.osiics_diagnosis_1 ?? r.diagnosis_text}
                  </p>
                  {r.osiics_body_part_1 && (
                    <p className="text-xs text-gray-400">{r.osiics_body_part_1} · {r.osiics_injury_type_1}</p>
                  )}
                </div>
                <div className="text-right shrink-0 text-xs text-gray-400">
                  <p className="font-medium text-gray-700">{fmtDate(r.date_of_injury)}</p>
                  {r.missed_days != null && <p>{r.missed_days}d missed</p>}
                  {r.missed_matches != null && <p>{r.missed_matches} matches</p>}
                </div>
              </div>
              {r.notes && <p className="text-xs text-gray-500 mt-2 italic">{r.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Readiness assessments */}
      {psychReadiness.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Psychological Readiness History</p>
          {psychReadiness.map((r: any) => {
            const col = r.overall_readiness >= 70 ? 'text-green-600' : r.overall_readiness >= 50 ? 'text-amber-600' : 'text-red-600'
            return (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">{fmtDate(r.assessed_at)}</p>
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-black ${col}`}>{r.overall_readiness}%</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.ready_to_return ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.ready_to_return ? '✓ RTP Cleared' : '✗ Not Cleared'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">ACL-RSI</p>
                    <p className="font-bold text-gray-800">{r.acl_psych_total ?? '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">SFK-11</p>
                    <p className="font-bold text-gray-800">{r.sfk_total ?? '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">TFSI-R</p>
                    <p className="font-bold text-gray-800">{r.tfsi_r_total ?? '—'}</p>
                  </div>
                </div>
                {r.notes && <p className="text-xs text-gray-500 mt-2 italic">{r.notes}</p>}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
