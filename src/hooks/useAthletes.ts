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
      const { data, error } = await supabase.from('athletes').insert({
        ...payload, practitioner_id: user!.id,
      }).select().single()
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
      const { data, error } = await supabase.from('athletes').update(payload).eq('id', id).select().single()
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
