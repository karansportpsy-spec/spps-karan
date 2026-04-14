// src/hooks/useSharedReports.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SharedReport, SharedReportWithExpiry } from '@/types/sync'

function attachExpiry(r: SharedReport): SharedReportWithExpiry {
  const msRemaining = new Date(r.expires_at).getTime() - Date.now()
  const minutesRemaining = Math.max(0, Math.floor(msRemaining / 60_000))
  const isExpired = msRemaining <= 0
  let expiryLabel: string
  if (isExpired) {
    expiryLabel = 'Expired'
  } else if (minutesRemaining < 60) {
    expiryLabel = `Expires in ${minutesRemaining}m`
  } else {
    const h = Math.floor(minutesRemaining / 60)
    expiryLabel = `Expires in ${h}h`
  }
  return { ...r, minutesRemaining, isExpired, expiryLabel }
}

// ── Practitioner: share a report with an athlete ──────────────────────────────
export function useShareReport() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      reportId, reportTitle, reportType, reportContent, reportData,
      athleteId, athleteAuthId, durationHours = 24,
    }: {
      reportId?: string
      reportTitle: string
      reportType: string
      reportContent?: string
      reportData?: Record<string, unknown>
      athleteId: string
      athleteAuthId?: string
      durationHours?: number
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      const expiresAt = new Date(Date.now() + durationHours * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('shared_reports')
        .insert({
          report_id: reportId,
          athlete_id: athleteId,
          athlete_auth_id: athleteAuthId,
          practitioner_id: user.id,
          expires_at: expiresAt,
          duration_hours: durationHours,
          report_title: reportTitle,
          report_type: reportType,
          report_content: reportContent,
          report_data: reportData ?? {},
          is_revoked: false,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['shared_reports_practitioner'] })
      qc.invalidateQueries({ queryKey: ['shared_reports_athlete', data.athlete_id] })
    },
  })
}

// ── Practitioner: revoke a shared report early ────────────────────────────────
export function useRevokeSharedReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reportShareId: string) => {
      const { error } = await supabase
        .from('shared_reports')
        .update({ is_revoked: true, revoked_at: new Date().toISOString() })
        .eq('id', reportShareId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared_reports_practitioner'] })
    },
  })
}

// ── Practitioner: list all shares they've created ────────────────────────────
export function usePractitionerSharedReports(athleteId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['shared_reports_practitioner', user?.id, athleteId],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('shared_reports')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('shared_at', { ascending: false })
        .limit(50)
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map(attachExpiry)
    },
  })
}

// ── Athlete: fetch shared reports available to them ───────────────────────────
export function useAthleteSharedReports(athleteId?: string) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery<SharedReport[]>({
    queryKey: ['shared_reports_athlete', athleteId],
    enabled: !!athleteId && !!user,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_reports')
        .select('*')
        .eq('athlete_id', athleteId!)
        .eq('is_revoked', false)
        .gt('expires_at', new Date().toISOString())
        .order('shared_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SharedReport[]
    },
  })

  const reportsWithExpiry = useMemo(
    () => (query.data ?? []).map(attachExpiry),
    [query.data]
  )

  // Realtime: practitioner shares a new report → athlete sees it immediately
  useEffect(() => {
    if (!athleteId || !user?.id) return
    const channel = supabase
      .channel(`shared_reports:athlete:${athleteId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'shared_reports',
        filter: `athlete_id=eq.${athleteId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['shared_reports_athlete', athleteId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athleteId, user?.id, qc])

  return { ...query, reportsWithExpiry }
}

// ── Athlete: mark a report as viewed ─────────────────────────────────────────
export function useMarkReportViewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ reportShareId, currentCount }: { reportShareId: string; currentCount: number }) => {
      const { error } = await supabase
        .from('shared_reports')
        .update({
          is_viewed: true,
          viewed_at: new Date().toISOString(),
          view_count: currentCount + 1,
        })
        .eq('id', reportShareId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shared_reports_athlete'] })
    },
  })
}
