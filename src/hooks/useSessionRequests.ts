// src/hooks/useSessionRequests.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { AthleteSessionRequest } from '@/types/sync'

// ── Practitioner: all requests across their athletes ──────────────────────────
export function usePractitionerSessionRequests(statusFilter?: string[]) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery<AthleteSessionRequest[]>({
    queryKey: ['practitioner_session_requests', user?.id, statusFilter],
    enabled: !!user && user.user_metadata?.role !== 'athlete',
    staleTime: 0,
    queryFn: async () => {
      let q = supabase
        .from('athlete_requests')
        .select('*, athlete:athletes(first_name,last_name,sport,uid_code)')
        .eq('practitioner_id', user!.id)
        .order('created_at', { ascending: false })
      if (statusFilter?.length) q = q.in('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AthleteSessionRequest[]
    },
  })

  // Realtime: new or updated request → invalidate immediately
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`session_requests:practitioner:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'athlete_requests',
        filter: `practitioner_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['practitioner_session_requests'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, qc])

  return query
}

// ── Practitioner: pending count for badge ────────────────────────────────────
export function usePendingRequestCount() {
  const { user } = useAuth()
  return useQuery<number>({
    queryKey: ['pending_request_count', user?.id],
    enabled: !!user && user.user_metadata?.role !== 'athlete',
    staleTime: 0,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('athlete_requests')
        .select('id', { count: 'exact', head: true })
        .eq('practitioner_id', user!.id)
        .in('status', ['pending'])
      if (error) return 0
      return count ?? 0
    },
  })
}

// ── Practitioner: respond to a request ───────────────────────────────────────
export function useRespondToRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      requestId, status, response, linkedSessionId,
    }: {
      requestId: string
      status: 'accepted' | 'declined' | 'seen' | 'completed'
      response?: string
      linkedSessionId?: string
    }) => {
      const { data, error } = await supabase
        .from('athlete_requests')
        .update({
          status,
          practitioner_response: response,
          responded_at: new Date().toISOString(),
          linked_session_id: linkedSessionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practitioner_session_requests'] })
      qc.invalidateQueries({ queryKey: ['pending_request_count'] })
      qc.invalidateQueries({ queryKey: ['athlete_requests'] })
    },
  })
}

// ── Athlete: submit a new request ────────────────────────────────────────────
export function useSubmitSessionRequest() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      athleteId: string
      practitionerId: string
      type: AthleteSessionRequest['request_type']
      title: string
      description?: string
      urgency?: AthleteSessionRequest['urgency']
      preferredDate?: string
      preferredTime?: string
    }) => {
      if (!user?.id) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('athlete_requests')
        .insert({
          athlete_id: params.athleteId,
          practitioner_id: params.practitionerId,
          athlete_auth_id: user.id,
          request_type: params.type,
          title: params.title,
          description: params.description,
          urgency: params.urgency ?? 'normal',
          preferred_date: params.preferredDate,
          preferred_time: params.preferredTime,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athlete_requests'] })
    },
  })
}

// ── Athlete: read own requests + realtime status updates ─────────────────────
export function useAthleteRequests(athleteAuthId?: string) {
  const qc = useQueryClient()

  const query = useQuery<AthleteSessionRequest[]>({
    queryKey: ['athlete_requests', athleteAuthId],
    enabled: !!athleteAuthId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as AthleteSessionRequest[]
    },
  })

  // Realtime: practitioner responds → athlete sees update immediately
  useEffect(() => {
    if (!athleteAuthId) return
    const channel = supabase
      .channel(`session_requests:athlete:${athleteAuthId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'athlete_requests',
        filter: `athlete_auth_id=eq.${athleteAuthId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['athlete_requests', athleteAuthId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athleteAuthId, qc])

  return query
}
