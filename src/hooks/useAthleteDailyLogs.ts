// src/hooks/useAthleteDailyLogs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { AthleteDailyLog } from '@/types/sync'

// ── Athlete: upsert today's log (one row per athlete per day) ─────────────────
export function useUpsertDailyLog() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (log: Partial<AthleteDailyLog> & {
      athleteId: string
      practitionerId: string
      logDate?: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      const { athleteId, practitionerId, logDate, ...fields } = log
      const { data, error } = await supabase
        .from('athlete_daily_logs')
        .upsert({
          athlete_id: athleteId,
          practitioner_id: practitionerId,
          athlete_auth_id: user.id,
          log_date: logDate ?? new Date().toISOString().split('T')[0],
          ...fields,
        }, { onConflict: 'athlete_id,log_date' })
        .select()
        .single()
      if (error) throw error
      return data as AthleteDailyLog
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['athlete_daily_logs'] })
      qc.invalidateQueries({ queryKey: ['practitioner_athlete_logs', data.athlete_id] })
    },
  })
}

// ── Athlete: fetch own logs ───────────────────────────────────────────────────
export function useMyDailyLogs(athleteAuthId?: string, limit = 30) {
  return useQuery<AthleteDailyLog[]>({
    queryKey: ['athlete_daily_logs', athleteAuthId, limit],
    enabled: !!athleteAuthId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_daily_logs')
        .select('*')
        .order('log_date', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AthleteDailyLog[]
    },
  })
}

// ── Practitioner: fetch logs for a specific athlete (with realtime) ───────────
export function usePractitionerAthleteLogs(athleteId?: string, limit = 30) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery<AthleteDailyLog[]>({
    queryKey: ['practitioner_athlete_logs', athleteId, limit],
    enabled: !!athleteId && !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_daily_logs')
        .select('*')
        .eq('athlete_id', athleteId!)
        .order('log_date', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AthleteDailyLog[]
    },
  })

  // Realtime: athlete submits a log → practitioner sees it immediately
  useEffect(() => {
    if (!athleteId || !user?.id) return
    const channel = supabase
      .channel(`daily_logs:athlete:${athleteId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'athlete_daily_logs',
        filter: `athlete_id=eq.${athleteId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['practitioner_athlete_logs', athleteId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athleteId, user?.id, qc])

  return query
}

// ── Practitioner: aggregate stats across all athletes (for dashboard) ─────────
export function usePractitionerDailyLogAlerts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['daily_log_alerts', user?.id],
    enabled: !!user && user.user_metadata?.role !== 'athlete',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Get flagged logs from the last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('athlete_daily_logs')
        .select('*, athlete:athletes(first_name,last_name)')
        .eq('practitioner_id', user!.id)
        .gte('log_date', since)
        .not('flags', 'eq', '{}')
        .order('log_date', { ascending: false })
      if (error) return []
      return data ?? []
    },
  })
}
