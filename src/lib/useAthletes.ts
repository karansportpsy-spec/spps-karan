import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Athlete } from '@/types'

export function useAthletes() {
  const { user } = useAuth()
  return useQuery<Athlete[]>({
    queryKey: ['athletes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('practitioner_id', user!.id)
        .order('first_name')
      if (error) throw error
      return data as Athlete[]
    },
  })
}

export function useCreateAthlete() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<Athlete, 'id' | 'practitioner_id' | 'created_at' | 'updated_at'>) => {
      // Convert empty strings to null — Supabase rejects '' for optional/nullable
      // columns (date, uuid refs, etc.) and '' on uid_code violates the unique constraint.
      const clean: Record<string, any> = { practitioner_id: user!.id }
      for (const [k, v] of Object.entries(payload)) {
        clean[k] = (typeof v === 'string' && v.trim() === '') ? null : v
      }
      const { data, error } = await supabase
        .from('athletes')
        .insert(clean)
        .select()
        .single()
      if (error) throw error
      return data as Athlete
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athletes'] }),
  })
}

export function useUpdateAthlete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Athlete> & { id: string }) => {
      // Convert empty strings to null on update too
      const clean: Record<string, any> = {}
      for (const [k, v] of Object.entries(payload)) {
        clean[k] = (typeof v === 'string' && v.trim() === '') ? null : v
      }
      const { data, error } = await supabase
        .from('athletes')
        .update(clean)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Athlete
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athletes'] }),
  })
}

export function useDeleteAthlete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('athletes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athletes'] }),
  })
}
