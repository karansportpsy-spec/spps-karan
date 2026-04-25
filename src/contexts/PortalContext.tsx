import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { shouldFallbackToDirectDb } from '@/lib/apiFallback'
import { useAuth } from '@/contexts/AuthContext'

export interface AthleteSelf {
  id: string
  email: string
  first_name: string
  last_name: string
  status: 'unverified' | 'linked' | 'discontinued'
  uid_code: string | null
  sport: string | null
  timezone: string
  language: string
}

export interface ActiveLink {
  link_id: string
  status: 'active'
  linked_at: string
  archived_at: string | null
  practitioner_id: string
  practitioner_first_name: string
  practitioner_last_name: string
  practitioner_email: string
  practitioner_avatar: string | null
  conversation_id: string | null
  athlete_unread: number | null
  last_message_at: string | null
  last_message_preview: string | null
}

export interface ArchivedLink {
  link_id: string
  status: 'archived_by_practitioner' | 'archived_by_athlete'
  linked_at: string
  archived_at: string
  practitioner_id: string
  practitioner_first_name: string
  practitioner_last_name: string
  practitioner_email: string
}

export interface PortalSummary {
  ok: true
  athlete: AthleteSelf
  active_links: ActiveLink[]
  archived_links: ArchivedLink[]
  unread_notifications: number
}

interface PortalContextValue {
  summary: PortalSummary | null
  isLoading: boolean
  isError: boolean
  error: string | null
  refresh: () => Promise<void>
  activeLinks: ActiveLink[]
  archivedLinks: ArchivedLink[]
  totalUnread: number
  unreadMessages: number
  unreadNotifications: number
  hasAnyActiveLink: boolean
}

interface AthleteRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  status: string | null
  uid_code: string | null
  sport: string | null
  timezone: string | null
  language: string | null
  practitioner_id?: string | null
}

interface LinkRow {
  id: string
  practitioner_id: string
  linked_at: string
  status: string
  archived_at: string | null
}

interface PractitionerRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
}

const PortalContext = createContext<PortalContextValue | null>(null)

function normalizeAthleteStatus(rawStatus: string | null | undefined, activeLinkCount: number): AthleteSelf['status'] {
  if (rawStatus === 'unverified' || rawStatus === 'linked' || rawStatus === 'discontinued') {
    return rawStatus
  }
  if (activeLinkCount > 0) return 'linked'
  if (rawStatus === 'inactive' || rawStatus === 'on_hold') return 'discontinued'
  return 'unverified'
}

async function fetchAthleteRowByAuthUserId(authUserId: string): Promise<AthleteRow> {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, email, first_name, last_name, status, uid_code, sport, timezone, language, practitioner_id')
    .eq('id', authUserId)
    .maybeSingle()

  if (data) return data as AthleteRow
  if (error) {
    console.error('[PortalContext] fetch athlete by id failed:', error.message)
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('athletes')
    .select('id, email, first_name, last_name, status, uid_code, sport, timezone, language, practitioner_id')
    .eq('portal_user_id', authUserId)
    .maybeSingle()

  if (legacyError) {
    if (legacyError.code !== '42703') {
      console.error('[PortalContext] fetch athlete by portal_user_id failed:', legacyError.message)
      throw legacyError
    }
  }

  if (!legacyData) {
    throw new Error('Athlete profile not found for this session.')
  }

  return legacyData as AthleteRow
}

async function fetchUnreadMessages(authUserId: string) {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', authUserId)
    .eq('receiver_role', 'athlete')
    .eq('is_read', false)

  if (error) {
    return 0
  }

  return count ?? 0
}

async function fetchPortalSummaryDirect(authUserId: string): Promise<PortalSummary> {
  const athlete = await fetchAthleteRowByAuthUserId(authUserId)

  const { data: linkData, error: linkError } = await supabase
    .from('practitioner_athlete_links')
    .select('id, practitioner_id, linked_at, status, archived_at')
    .eq('athlete_id', athlete.id)
    .order('linked_at', { ascending: false })

  let activeLinks: ActiveLink[] = []
  let archivedLinks: ArchivedLink[] = []

  if (!linkError) {
    const links = (linkData ?? []) as LinkRow[]
    const practitionerIds = Array.from(new Set(links.map(link => link.practitioner_id).filter(Boolean)))

    let practitionerById = new Map<string, PractitionerRow>()
    if (practitionerIds.length > 0) {
      const { data: practitionerData, error: practitionerError } = await supabase
        .from('practitioners')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', practitionerIds)

      if (practitionerError) throw practitionerError

      practitionerById = new Map(
        ((practitionerData ?? []) as PractitionerRow[]).map(practitioner => [practitioner.id, practitioner])
      )
    }

    activeLinks = links
      .filter(link => link.status === 'active')
      .map((link): ActiveLink | null => {
        const practitioner = practitionerById.get(link.practitioner_id)
        if (!practitioner) return null

        return {
          link_id: link.id,
          status: 'active' as const,
          linked_at: link.linked_at,
          archived_at: link.archived_at,
          practitioner_id: link.practitioner_id,
          practitioner_first_name: practitioner.first_name ?? '',
          practitioner_last_name: practitioner.last_name ?? '',
          practitioner_email: practitioner.email ?? '',
          practitioner_avatar: practitioner.avatar_url ?? null,
          conversation_id: null,
          athlete_unread: 0,
          last_message_at: null,
          last_message_preview: null,
        }
      })
      .filter((link): link is ActiveLink => link !== null)

    archivedLinks = links
      .filter(link => link.status !== 'active' && !!link.archived_at)
      .map((link): ArchivedLink | null => {
        const practitioner = practitionerById.get(link.practitioner_id)
        if (!practitioner || !link.archived_at) return null

        return {
          link_id: link.id,
          status:
            link.status === 'archived_by_athlete'
              ? 'archived_by_athlete'
              : 'archived_by_practitioner',
          linked_at: link.linked_at,
          archived_at: link.archived_at,
          practitioner_id: link.practitioner_id,
          practitioner_first_name: practitioner.first_name ?? '',
          practitioner_last_name: practitioner.last_name ?? '',
          practitioner_email: practitioner.email ?? '',
        }
      })
      .filter((link): link is ArchivedLink => link !== null)
  } else if (athlete.practitioner_id) {
    const { data: practitionerData, error: practitionerError } = await supabase
      .from('practitioners')
      .select('id, first_name, last_name, email, avatar_url')
      .eq('id', athlete.practitioner_id)
      .maybeSingle()

    if (practitionerError) throw practitionerError

    if (practitionerData) {
      const practitioner = practitionerData as PractitionerRow
      activeLinks = [
        {
          link_id: `legacy-${athlete.id}-${practitioner.id}`,
          status: 'active',
          linked_at: new Date().toISOString(),
          archived_at: null,
          practitioner_id: practitioner.id,
          practitioner_first_name: practitioner.first_name ?? '',
          practitioner_last_name: practitioner.last_name ?? '',
          practitioner_email: practitioner.email ?? '',
          practitioner_avatar: practitioner.avatar_url ?? null,
          conversation_id: null,
          athlete_unread: 0,
          last_message_at: null,
          last_message_preview: null,
        },
      ]
    }
  } else {
    throw linkError
  }

  const unreadMessages = await fetchUnreadMessages(authUserId)
  const activeLinksWithUnread = activeLinks.map((link, index) => ({
    ...link,
    athlete_unread: index === 0 ? unreadMessages : 0,
  }))

  return {
    ok: true,
    athlete: {
      id: athlete.id,
      email: athlete.email,
      first_name: athlete.first_name ?? '',
      last_name: athlete.last_name ?? '',
      status: normalizeAthleteStatus(athlete.status, activeLinks.length),
      uid_code: athlete.uid_code ?? null,
      sport: athlete.sport ?? null,
      timezone: athlete.timezone ?? 'UTC',
      language: athlete.language ?? 'en',
    },
    active_links: activeLinksWithUnread,
    archived_links: archivedLinks,
    unread_notifications: 0,
  }
}

async function fetchPortalSummary(authUserId: string): Promise<PortalSummary | null> {
  const { data, error } = await supabase.rpc('athlete_portal_summary')

  if (!error) {
    if (!data || (data as any).ok !== true) {
      return null
    }
    return data as PortalSummary
  }

  if (!shouldFallbackToDirectDb(error)) {
    console.error('[PortalContext] athlete_portal_summary failed:', error.message)
    throw error
  }

  console.warn('[PortalContext] Falling back to direct portal summary:', error.message)
  return fetchPortalSummaryDirect(authUserId)
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user, role, loading: authLoading } = useAuth()
  const qc = useQueryClient()

  const enabled = !!user && role === 'athlete' && !authLoading

  const {
    data: summary = null,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['athlete_portal_summary', user?.id],
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchPortalSummary(user!.id),
  })

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['athlete_portal_summary'] })
    await refetch()
  }

  useEffect(() => {
    if (!enabled || !user?.id) return

    const invalidateSummary = () => {
      void qc.invalidateQueries({ queryKey: ['athlete_portal_summary', user.id] })
    }

    const channel = supabase
      .channel(`athlete-sync:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practitioner_athlete_links',
          filter: `athlete_id=eq.${user.id}`,
        },
        invalidateSummary
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'athlete_intake_submissions',
          filter: `athlete_id=eq.${user.id}`,
        },
        invalidateSummary
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, qc, user?.id])

  const value = useMemo<PortalContextValue>(() => {
    const activeLinks = summary?.active_links ?? []
    const archivedLinks = summary?.archived_links ?? []
    const unreadMessages = activeLinks.reduce((sum, link) => sum + (link.athlete_unread ?? 0), 0)
    const unreadNotifications = summary?.unread_notifications ?? 0

    return {
      summary,
      isLoading: enabled && isLoading,
      isError,
      error: isError ? (error as Error)?.message ?? 'Failed to load portal' : null,
      refresh,
      activeLinks,
      archivedLinks,
      totalUnread: unreadMessages + unreadNotifications,
      unreadMessages,
      unreadNotifications,
      hasAnyActiveLink: activeLinks.length > 0,
    }
  }, [summary, isLoading, isError, error, enabled])

  return (
    <PortalContext.Provider value={value}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal() {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used within <PortalProvider>')
  return ctx
}
