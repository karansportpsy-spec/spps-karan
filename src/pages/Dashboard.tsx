// Dashboard.tsx — comprehensive with all metrics, trends, risk breakdown, activity feed
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Calendar, Activity, AlertTriangle, Brain, Target,
  FileText, TrendingUp, TrendingDown, Clock, ChevronRight,
  CheckCircle, Zap, BarChart2, Heart, Sparkles,
} from 'lucide-react'
import { useAthletes } from '@/hooks/useAthletes'
import { useSessions, useCheckIns, useAssessments, useInterventions } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { Card, Badge, Avatar, Spinner } from '@/components/ui'
import { riskColor, fmtDate, fmtTime } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useReportsCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['reports_count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('practitioner_id', user!.id)
      return count ?? 0
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr: number[]) {
  if (!arr.length) return 0
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
}

function trendArrow(current: number, previous: number) {
  if (current > previous + 0.3) return 'up'
  if (current < previous - 0.3) return 'down'
  return 'flat'
}

function buildCheckinTrend(checkins: any[]) {
  const days: Record<string, { mood: number[]; stress: number[]; sleep: number[]; readiness: number[]; motivation: number[] }> = {}
  const now = new Date()
  checkins.forEach(c => {
    const d = new Date(c.checked_in_at)
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (diff > 14) return
    const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    if (!days[key]) days[key] = { mood: [], stress: [], sleep: [], readiness: [], motivation: [] }
    days[key].mood.push(c.mood_score)
    days[key].stress.push(c.stress_score)
    days[key].sleep.push(c.sleep_score)
    days[key].readiness.push(c.readiness_score)
    days[key].motivation.push(c.motivation_score ?? 5)
  })
  return Object.entries(days).map(([date, v]) => ({
    date,
    Mood:       avg(v.mood),
    Stress:     avg(v.stress),
    Sleep:      avg(v.sleep),
    Readiness:  avg(v.readiness),
    Motivation: avg(v.motivation),
  }))
}

function Stat({ label, value, icon: Icon, sub, colorClass = 'text-blue-500', trend, onClick }: {
  label: string; value: string | number; icon: any; sub?: string
  colorClass?: string; trend?: 'up' | 'down' | 'flat'; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl ${colorClass.replace('text-', 'bg-').replace('500', '50')} flex items-center justify-center`}>
          <Icon size={18} className={colorClass} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
            {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { practitioner } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const { data: athletes = [],     isLoading: loadA } = useAthletes()
  const { data: sessions = [],     isLoading: loadS } = useSessions()
  const { data: checkins = [] }                        = useCheckIns()
  const { data: assessments = [] }                     = useAssessments()
  const { data: interventions = [] }                   = useInterventions()
  const { data: reportsCount = 0 }                     = useReportsCount()

  // Compute metrics
  const activeAthletes     = athletes.filter(a => a.status === 'active')
  const highRisk           = athletes.filter(a => a.risk_level === 'high' || a.risk_level === 'critical')
  const criticalRisk       = athletes.filter(a => a.risk_level === 'critical')
  const completedSessions  = sessions.filter(s => s.status === 'completed')
  const upcomingSessions   = sessions.filter(s => {
    const d = new Date(s.scheduled_at)
    return d > new Date() && s.status === 'scheduled'
  }).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()).slice(0, 5)

  const todaySessions = sessions.filter(s => {
    const d = new Date(s.scheduled_at)
    return d.toDateString() === new Date().toDateString()
  })

  // Wellbeing averages (last 7 days)
  const recent7 = checkins.filter(c => {
    const diff = (Date.now() - new Date(c.checked_in_at).getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 7
  })
  const prev7 = checkins.filter(c => {
    const diff = (Date.now() - new Date(c.checked_in_at).getTime()) / (1000 * 60 * 60 * 24)
    return diff > 7 && diff <= 14
  })

  const avgMoodNow  = avg(recent7.map(c => c.mood_score))
  const avgMoodPrev = avg(prev7.map(c => c.mood_score))
  const avgStress   = avg(recent7.map(c => c.stress_score))
  const avgSleep    = avg(recent7.map(c => c.sleep_score))

  // Flagged check-ins
  const flaggedCheckins = checkins.filter(c => (c.flags?.length ?? 0) > 0).slice(0, 3)

  // Trend chart data
  const trendData = buildCheckinTrend(checkins)

  // Risk distribution
  const riskDist = [
    { name: 'Critical', value: athletes.filter(a => a.risk_level === 'critical').length, color: '#ef4444' },
    { name: 'High',     value: athletes.filter(a => a.risk_level === 'high').length, color: '#f97316' },
    { name: 'Moderate', value: athletes.filter(a => a.risk_level === 'moderate').length, color: '#eab308' },
    { name: 'Low',      value: athletes.filter(a => a.risk_level === 'low').length, color: '#22c55e' },
  ].filter(r => r.value > 0)

  // Session type breakdown (last 30 days)
  const recent30Sessions = sessions.filter(s => {
    const diff = (Date.now() - new Date(s.scheduled_at).getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 30
  })
  const sessTypeData = Object.entries(
    recent30Sessions.reduce((acc: Record<string, number>, s) => {
      acc[s.session_type] = (acc[s.session_type] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))

  // Sport breakdown
  const sportCounts = athletes.reduce((acc: Record<string, number>, a) => {
    acc[a.sport] = (acc[a.sport] ?? 0) + 1
    return acc
  }, {})
  const sportData = Object.entries(sportCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }))

  // Assessment tool usage
  const toolCounts = assessments.reduce((acc: Record<string, number>, a: any) => {
    const tool = String(a.tool).replace('EXTERNAL:', '')
    acc[tool] = (acc[tool] ?? 0) + 1
    return acc
  }, {})
  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Recent activity feed
  const activityItems = [
    ...checkins.slice(0, 5).map(c => ({
      type: 'checkin',
      label: `Check-in: ${(c as any).athlete?.first_name ?? 'Unknown'} — Mood ${c.mood_score}/10`,
      time: new Date(c.checked_in_at),
      icon: Activity,
      color: 'text-green-500',
    })),
    ...sessions.filter(s => s.status === 'completed').slice(0, 5).map(s => ({
      type: 'session',
      label: `Session: ${(s as any).athlete?.first_name ?? 'Unknown'} — ${s.session_type.replace(/_/g, ' ')}`,
      time: new Date(s.scheduled_at),
      icon: Calendar,
      color: 'text-blue-500',
    })),
    ...assessments.slice(0, 3).map((a: any) => ({
      type: 'assessment',
      label: `Assessment: ${a.athlete?.first_name ?? 'Unknown'} — ${String(a.tool).replace('EXTERNAL:', '')} (${a.total_score})`,
      time: new Date(a.administered_at),
      icon: Brain,
      color: 'text-purple-500',
    })),
  ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 8)

  function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return t.dash_greeting_morning
    if (h < 17) return t.dash_greeting_afternoon
    return t.dash_greeting_evening
  }

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {practitioner?.first_name} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Row 1: Key stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label={t.dash_activeAthletes}  value={loadA ? '…' : activeAthletes.length}   icon={Users}         colorClass="text-blue-500"   onClick={() => navigate('/athletes')} />
        <Stat label={t.dash_todaySessions}   value={loadS ? '…' : todaySessions.length}    icon={Calendar}      colorClass="text-indigo-500" onClick={() => navigate('/sessions')} />
        <Stat label={t.dash_totalSessions}   value={sessions.length}                        icon={CheckCircle}   colorClass="text-emerald-500" sub={`${completedSessions.length} completed`} />
        <Stat label={t.dash_totalAssessments} value={assessments.length}                   icon={Brain}         colorClass="text-purple-500"  onClick={() => navigate('/assessments')} />
        <Stat label={t.dash_totalInterventions} value={interventions.length}               icon={Target}        colorClass="text-amber-500"   onClick={() => navigate('/interventions')} />
        <Stat label={t.dash_totalReports}    value={reportsCount}                           icon={FileText}      colorClass="text-teal-500"    onClick={() => navigate('/reports')} />
      </div>

      {/* ── Wellbeing snapshot ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Avg Mood (7d)"     value={avgMoodNow || '—'}  icon={Heart}     colorClass="text-rose-500"   sub="out of 10" trend={trendArrow(avgMoodNow, avgMoodPrev)} />
        <Stat label="Avg Stress (7d)"   value={avgStress || '—'}   icon={Zap}       colorClass="text-orange-500" sub="out of 10" />
        <Stat label="Avg Sleep (7d)"    value={avgSleep || '—'}    icon={Activity}  colorClass="text-blue-500"   sub="out of 10" />
        <Stat label={t.dash_highRisk}   value={highRisk.length}    icon={AlertTriangle} colorClass={highRisk.length > 0 ? 'text-red-500' : 'text-gray-400'} sub={criticalRisk.length > 0 ? `${criticalRisk.length} critical` : ''} />
      </div>

      {/* ── Check-in Trend Chart ─────────────────────────────────────────────── */}
      {trendData.length > 1 && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{t.dash_trendsTitle}</h2>
            <span className="text-xs text-gray-400">{checkins.length} total check-ins</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(val: number, name: string) => [val.toFixed(1), name]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Mood"       stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Stress"     stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Sleep"      stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Readiness"  stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Motivation" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* ── Session type breakdown ───────────────────────────────────────── */}
        {sessTypeData.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Sessions (30d) by Type</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sessTypeData} margin={{ left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* ── Risk distribution ────────────────────────────────────────────── */}
        {riskDist.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Risk Distribution</h2>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={riskDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name} ${value}`} labelLine={false}>
                  {riskDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {riskDist.map(r => (
                <span key={r.name} className="text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                  {r.name}: {r.value}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* ── Sport breakdown ──────────────────────────────────────────────── */}
        {sportData.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Athletes by Sport</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sportData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* ── Upcoming sessions ────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{t.dash_upcomingSessions}</h2>
            <button onClick={() => navigate('/sessions')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </button>
          </div>
          {upcomingSessions.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t.dash_noSessions}</p>
          ) : (
            <div className="space-y-2">
              {upcomingSessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  {(s as any).athlete && <Avatar firstName={(s as any).athlete.first_name} lastName={(s as any).athlete.last_name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(s as any).athlete ? `${(s as any).athlete.first_name} ${(s as any).athlete.last_name}` : 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={10} />
                      {fmtDate(s.scheduled_at)} · {fmtTime(s.scheduled_at)} · {s.session_type.replace('_', ' ')}
                    </p>
                  </div>
                  <Badge label={s.status} className="bg-blue-100 text-blue-700" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Today's sessions + Recent check-ins ──────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">{t.dash_recentCheckins}</h2>
            <button onClick={() => navigate('/checkins')} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </button>
          </div>
          {checkins.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t.dash_noCheckins}</p>
          ) : (
            <div className="space-y-2">
              {checkins.slice(0, 5).map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  {c.athlete && <Avatar firstName={c.athlete.first_name} lastName={c.athlete.last_name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.athlete ? `${c.athlete.first_name} ${c.athlete.last_name}` : 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(c.checked_in_at)}</p>
                  </div>
                  <div className="flex gap-2 text-right shrink-0">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{c.mood_score}/10</p>
                      <p className="text-xs text-gray-400">mood</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{c.readiness_score}/10</p>
                      <p className="text-xs text-gray-400">ready</p>
                    </div>
                  </div>
                  {(c.flags?.length ?? 0) > 0 && (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full shrink-0">
                      {c.flags?.length ?? 0} flag{(c.flags?.length ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── High risk athletes ───────────────────────────────────────────── */}
        {highRisk.length > 0 && (
          <Card className="p-5 border-red-100">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={16} className="text-red-500" />
              <h2 className="font-semibold text-gray-900">{t.dash_attentionNeeded}</h2>
            </div>
            <div className="space-y-2">
              {highRisk.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => navigate(`/athletes/${a.id}/case`)}>
                  <Avatar firstName={a.first_name} lastName={a.last_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.first_name} {a.last_name}</p>
                    <p className="text-xs text-gray-500">{a.sport}{a.team ? ` · ${a.team}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge label={a.risk_level} className={riskColor(a.risk_level)} />
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Recent activity feed ─────────────────────────────────────────── */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-900 mb-4">{t.dash_recentActivity}</h2>
          {activityItems.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {activityItems.map((item, i) => {
                const Icon = item.icon
                return (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className={`w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={13} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{item.label}</p>
                      <p className="text-xs text-gray-400">{fmtDate(item.time.toISOString())}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Assessment tool usage ────────────────────────────────────────────── */}
      {topTools.length > 0 && (
        <Card className="p-5 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={16} className="text-purple-500" />
            <h2 className="font-semibold text-gray-900">Assessment Tool Usage</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {topTools.map(([tool, count]) => (
              <div key={tool} className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-purple-900">{tool}</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">{count}</p>
                <p className="text-xs text-purple-400">uses</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppShell>
  )
}
