import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Session, CheckIn, Assessment, Intervention } from '@/types'

// ── Sessions ──────────────────────────────────────────────────
export function useSessions(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Session[]>({
    queryKey: ['sessions', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('sessions').select('*, athlete:athletes(id,first_name,last_name,sport,risk_level)').eq('practitioner_id', user!.id).order('scheduled_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as Session[]
    },
  })
}

export function useCreateSession() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Session, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('sessions').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as Session
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useUpdateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Session> & { id: string }) => {
      const { data, error } = await supabase.from('sessions').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data as Session
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ── Check-Ins ─────────────────────────────────────────────────
export function useCheckIns(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<CheckIn[]>({
    queryKey: ['checkins', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('check_ins').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('checked_in_at', { ascending: false }).limit(100)
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as CheckIn[]
    },
  })
}

export function useCreateCheckIn() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<CheckIn, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase.from('check_ins').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as CheckIn
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checkins'] }),
  })
}

// ── Assessments ───────────────────────────────────────────────
export function useAssessments(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Assessment[]>({
    queryKey: ['assessments', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('assessments').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('administered_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as Assessment[]
    },
  })
}

export function useCreateAssessment() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Assessment, 'id' | 'practitioner_id' | 'created_at'>) => {
      const { data, error } = await supabase.from('assessments').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as Assessment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments'] }),
  })
}

// ── Interventions ─────────────────────────────────────────────
export function useInterventions(athleteId?: string) {
  const { user } = useAuth()
  return useQuery<Intervention[]>({
    queryKey: ['interventions', user?.id, athleteId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('interventions').select('*, athlete:athletes(id,first_name,last_name,sport)').eq('practitioner_id', user!.id).order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data, error } = await q
      if (error) throw error
      return data as Intervention[]
    },
  })
}

export function useCreateIntervention() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Intervention, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('interventions').insert({ ...payload, practitioner_id: user!.id }).select().single()
      if (error) throw error
      return data as Intervention
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  })
}

export function useUpdateIntervention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Intervention> & { id: string }) => {
      const { data, error } = await supabase.from('interventions').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data as Intervention
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interventions'] }),
  })
}
