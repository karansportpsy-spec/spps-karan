// src/contexts/AthleteContext.tsx
//
// v2 TRANSITION SHIM.
//
// The old (v1) AthleteContext backed its data on tables that no longer exist
// (athlete_profiles, task_completions.athlete_id without link, etc.).
//
// v2 replaces it with PortalContext. But eight v1 pages still import
// `useAthlete()` and will be rewritten phase-by-phase:
//   • AthleteMessagesPage    → Phase 5
//   • AthleteJournalPage     → Phase 6
//   • AthleteDailyLogPage    → Phase 6
//   • AthleteCompetitionPage → Phase 6
//   • AthleteProgramsListPage → Phase 7
//   • AthleteProgramPage     → Phase 7
//   • AthleteProgressPage    → Phase 7
//   • AthleteRequestsPage    → Phase 7
//
// Until then, this shim keeps those pages COMPILING (same surface area) but
// provides empty/no-op implementations. Pages will render an empty state.
//
// This is intentional: we do NOT want to block the build on unmigrated pages,
// and we do NOT want to silently send writes against tables that no longer
// exist. Empty state + no-op mutations is the safest transitional behavior.

import { createContext, useContext, ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePortal } from '@/contexts/PortalContext'

// ── Types preserved from v1 so consuming pages keep compiling ───────────────

export interface AthleteProfile {
  id:                   string
  practitioner_id:      string     // legacy field, unused in v2
  athlete_id:           string
  email:                string
  display_name?:        string
  avatar_url?:          string
  portal_enabled:       boolean
  last_active_at?:      string
  notification_push:    boolean
  notification_email:   boolean
  timezone:             string
  language:             string
}

export interface AssignedProgram {
  id:             string
  program_id:     string
  athlete_id:     string
  practitioner_id: string
  start_date:     string
  end_date?:      string
  status:         'pending' | 'active' | 'paused' | 'completed' | 'cancelled'
  notes?:         string
  assigned_at:    string
  program: {
    id:              string
    title:           string
    description?:    string
    category?:       string
    duration_weeks?: number
  }
}

export interface AthleteNotification {
  id:          string
  athlete_id:  string
  type:        string
  title:       string
  body:        string
  action_url?: string
  is_read:     boolean
  read_at?:    string
  created_at:  string
}

export interface Conversation {
  id:                   string
  practitioner_id:      string
  athlete_id:           string
  status:               string
  athlete_unread:       number
  last_message_at?:     string
  last_message_preview?: string
}

interface AthleteContextValue {
  athleteProfile:      AthleteProfile | null
  athleteRecord:       any | null
  programs:            AssignedProgram[]
  notifications:       AthleteNotification[]
  unreadCount:         number
  conversation:        Conversation | null
  isLoading:           boolean

  markNotificationRead:     (id: string) => void
  markAllNotificationsRead: () => void
  completeTask: (params: {
    taskId: string; programId: string; rating?: number; feedback?: string
    difficulty?: number; moodAfter?: number; durationActual?: number
  }) => Promise<void>
  sendMessage: (conversationId: string, content: string) => Promise<void>
  sendRequest: (params: {
    type: string; title: string; description?: string; urgency?: string
    preferredDate?: string; preferredTime?: string
  }) => Promise<void>
}

const AthleteContext = createContext<AthleteContextValue | null>(null)

export function useAthlete() {
  const ctx = useContext(AthleteContext)
  if (!ctx) throw new Error('useAthlete must be used within AthleteProvider')
  return ctx
}

// ── No-op warning (logged once per session per call) ───────────────────────
const warnedMethods = new Set<string>()
function warnOnce(method: string) {
  if (warnedMethods.has(method)) return
  warnedMethods.add(method)
  console.warn(
    `[v2 transition] ${method}() is a no-op. ` +
    `This feature is being rebuilt in an upcoming phase.`
  )
}

/**
 * v2 transition provider. Wraps the app (used by pages that still import
 * the v1 `useAthlete()` API) and provides empty/no-op values sourced from
 * the v2 auth + portal state.
 */
export function AthleteProvider({ children }: { children: ReactNode }) {
  const { user, athlete, loading: authLoading } = useAuth()
  const { isLoading: portalLoading, activeLinks } = usePortal()

  // Build a v1-shaped profile that's "good enough" for read-only rendering.
  // athlete_id is the same as auth user id in v2.
  const athleteProfile: AthleteProfile | null = athlete
    ? {
        id:                 user?.id ?? '',
        practitioner_id:    activeLinks[0]?.practitioner_id ?? '',  // best-effort fallback
        athlete_id:         athlete.id,
        email:              athlete.email,
        display_name:       `${athlete.first_name} ${athlete.last_name}`.trim(),
        avatar_url:         undefined,
        portal_enabled:     true,
        notification_push:  true,
        notification_email: true,
        timezone:           athlete.timezone,
        language:           athlete.language,
      }
    : null

  // Ship an empty athleteRecord; pages that use this are scheduled for rewrite.
  const athleteRecord = athlete ?? null

  // No v2 implementations yet — ship empty collections, stubbed mutations.
  const value: AthleteContextValue = {
    athleteProfile,
    athleteRecord,
    programs: [],
    notifications: [],
    unreadCount: 0,
    conversation: null,
    isLoading: authLoading || portalLoading,

    markNotificationRead:     () => warnOnce('markNotificationRead'),
    markAllNotificationsRead: () => warnOnce('markAllNotificationsRead'),
    completeTask:     async () => { warnOnce('completeTask') },
    sendMessage:      async () => { warnOnce('sendMessage') },
    sendRequest:      async () => { warnOnce('sendRequest') },
  }

  return (
    <AthleteContext.Provider value={value}>
      {children}
    </AthleteContext.Provider>
  )
}
