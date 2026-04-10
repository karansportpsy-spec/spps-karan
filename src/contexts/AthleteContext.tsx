// src/contexts/AthleteContext.tsx
// Provides athlete-side data: profile, programs, tasks, notifications, messages
// Only active when user.user_metadata.role === 'athlete'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AthleteProfile {
  id: string
  practitioner_id: string
  athlete_id: string
  email: string
  display_name?: string
  avatar_url?: string
  portal_enabled: boolean
  last_active_at?: string
  notification_push: boolean
  notification_email: boolean
  timezone: string
  language: string
}

export interface AssignedProgram {
  id: string
  program_id: string
  athlete_id: string
  practitioner_id: string
  start_date: string
  end_date?: string
  status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled'
  notes?: string
  assigned_at: string
  program: {
    id: string
    title: string
    description?: string
    category?: string
    duration_weeks?: number
  }
}

export interface ProgramTask {
  id: string
  program_id: string
  title: string
  description?: string
  task_type: 'exercise' | 'journal' | 'video_watch' | 'audio_listen' | 'breathing' | 'reading' | 'self_rating' | 'check_in'
  content_url?: string
  content_text?: string
  week_number?: number
  day_of_week?: number
  duration_minutes?: number
  is_mandatory: boolean
  sort_order: number
}

export interface TaskCompletion {
  id: string
  task_id: string
  athlete_program_id: string
  athlete_id: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
  completed_at?: string
  rating?: number
  feedback_text?: string
  difficulty?: number
  mood_after?: number
}

export interface AthleteNotification {
  id: string
  athlete_id: string
  type: string
  title: string
  body: string
  action_url?: string
  is_read: boolean
  read_at?: string
  created_at: string
}

export interface Conversation {
  id: string
  practitioner_id: string
  athlete_id: string
  status: string
  athlete_unread: number
  last_message_at?: string
  last_message_preview?: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  sender_role: 'practitioner' | 'athlete' | 'ai_bot'
  content: string
  content_type: string
  is_read: boolean
  is_ai_generated: boolean
  escalated_to_practitioner: boolean
  created_at: string
}

// ── Context type ───────────────────────────────────────────────────────────────

interface AthleteContextValue {
  athleteProfile: AthleteProfile | null
  athleteRecord: any | null  // from athletes table
  programs: AssignedProgram[]
  notifications: AthleteNotification[]
  unreadCount: number
  conversation: Conversation | null
  isLoading: boolean

  // Mutations
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  completeTask: (params: {
    taskId: string
    programId: string
    rating?: number
    feedback?: string
    difficulty?: number
    moodAfter?: number
    durationActual?: number
  }) => Promise<void>
  sendMessage: (conversationId: string, content: string) => Promise<void>
  sendRequest: (params: {
    type: string
    title: string
    description?: string
    urgency?: string
    preferredDate?: string
    preferredTime?: string
  }) => Promise<void>
}

const AthleteContext = createContext<AthleteContextValue | null>(null)

export function useAthlete() {
  const ctx = useContext(AthleteContext)
  if (!ctx) throw new Error('useAthlete must be used within AthleteProvider')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AthleteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()

  // Load athlete profile (auth bridge row)
  const { data: athleteProfile, isLoading: loadingProfile } = useQuery<AthleteProfile | null>({
    queryKey: ['athlete_profile', user?.id],
    enabled: !!user && user.user_metadata?.role === 'athlete',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) return null
      return data as AthleteProfile
    },
  })

  // Load the linked athlete record (for check-ins, sessions, etc.)
  const { data: athleteRecord } = useQuery({
    queryKey: ['athlete_record', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('id', athleteProfile!.athlete_id)
        .single()
      if (error) return null
      return data
    },
  })

  // Load assigned programs
  const { data: programs = [], isLoading: loadingPrograms } = useQuery<AssignedProgram[]>({
    queryKey: ['athlete_programs', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_programs')
        .select(`*, program:intervention_programs(id,title,description,category,duration_weeks)`)
        .eq('athlete_id', athleteProfile!.athlete_id)
        .in('status', ['active', 'pending'])
        .order('assigned_at', { ascending: false })
      if (error) return []
      return (data ?? []) as AssignedProgram[]
    },
  })

  // Load notifications
  const { data: notifications = [] } = useQuery<AthleteNotification[]>({
    queryKey: ['athlete_notifications', athleteProfile?.athlete_id],
    enabled: !!athleteProfile?.athlete_id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_notifications')
        .select('*')
        .eq('athlete_id', athleteProfile!.athlete_id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) return []
      return (data ?? []) as AthleteNotification[]
    },
  })

  // Load conversation with practitioner
  const { data: conversation } = useQuery<Conversation | null>({
    queryKey: ['athlete_conversation', athleteProfile?.athlete_id, athleteProfile?.practitioner_id],
    enabled: !!athleteProfile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('athlete_id', athleteProfile!.athlete_id)
        .eq('practitioner_id', athleteProfile!.practitioner_id)
        .maybeSingle()
      if (error) return null
      return data as Conversation | null
    },
  })

  // Realtime: subscribe to new notifications
  useEffect(() => {
    if (!athleteProfile?.athlete_id) return
    const channel = supabase
      .channel(`notifications:${athleteProfile.athlete_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'athlete_notifications',
        filter: `athlete_id=eq.${athleteProfile.athlete_id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['athlete_notifications'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [athleteProfile?.athlete_id, qc])

  // Realtime: subscribe to new messages
  useEffect(() => {
    if (!conversation?.id) return
    const channel = supabase
      .channel(`conversation:${conversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['messages', conversation.id] })
        qc.invalidateQueries({ queryKey: ['athlete_conversation'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversation?.id, qc])

  // Update last_active_at
  useEffect(() => {
    if (!user?.id || user.user_metadata?.role !== 'athlete') return
    supabase.from('athlete_profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {})
  }, [user?.id])

  // ── Mutations ──────────────────────────────────────────────────────────────

  function markNotificationRead(id: string) {
    supabase.from('athlete_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .then(() => qc.invalidateQueries({ queryKey: ['athlete_notifications'] }))
  }

  function markAllNotificationsRead() {
    if (!athleteProfile?.athlete_id) return
    supabase.from('athlete_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('athlete_id', athleteProfile.athlete_id)
      .eq('is_read', false)
      .then(() => qc.invalidateQueries({ queryKey: ['athlete_notifications'] }))
  }

  async function completeTask(params: {
    taskId: string
    programId: string
    rating?: number
    feedback?: string
    difficulty?: number
    moodAfter?: number
    durationActual?: number
  }) {
    if (!athleteProfile?.athlete_id) return
    // Find or create completion record
    const { data: existing } = await supabase
      .from('task_completions')
      .select('id')
      .eq('task_id', params.taskId)
      .eq('athlete_program_id', params.programId)
      .maybeSingle()

    const payload = {
      task_id: params.taskId,
      athlete_program_id: params.programId,
      athlete_id: athleteProfile.athlete_id,
      status: 'completed' as const,
      completed_at: new Date().toISOString(),
      rating: params.rating,
      feedback_text: params.feedback,
      difficulty: params.difficulty,
      mood_after: params.moodAfter,
      duration_actual: params.durationActual,
    }

    if (existing) {
      await supabase.from('task_completions').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('task_completions').insert(payload)
    }
    qc.invalidateQueries({ queryKey: ['task_completions'] })
  }

  async function sendMessage(conversationId: string, content: string) {
    if (!user?.id) return
    const role = user.user_metadata?.role === 'athlete' ? 'athlete' : 'practitioner'
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_role: role,
      content,
      content_type: 'text',
    })
    // Update conversation preview
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 100),
      ...(role === 'athlete' ? { practitioner_unread: 1 } : { athlete_unread: 0 }),
    }).eq('id', conversationId)

    qc.invalidateQueries({ queryKey: ['messages', conversationId] })
    qc.invalidateQueries({ queryKey: ['athlete_conversation'] })
  }

  async function sendRequest(params: {
    type: string
    title: string
    description?: string
    urgency?: string
    preferredDate?: string
    preferredTime?: string
  }) {
    if (!athleteProfile) return
    await supabase.from('athlete_requests').insert({
      athlete_id: athleteProfile.athlete_id,
      practitioner_id: athleteProfile.practitioner_id,
      request_type: params.type,
      title: params.title,
      description: params.description,
      urgency: params.urgency ?? 'normal',
      preferred_date: params.preferredDate,
      preferred_time: params.preferredTime,
    })
    qc.invalidateQueries({ queryKey: ['athlete_requests'] })
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const value: AthleteContextValue = {
    athleteProfile,
    athleteRecord,
    programs,
    notifications,
    unreadCount,
    conversation,
    isLoading: loadingProfile || loadingPrograms,
    markNotificationRead,
    markAllNotificationsRead,
    completeTask,
    sendMessage,
    sendRequest,
  }

  return <AthleteContext.Provider value={value}>{children}</AthleteContext.Provider>
}
