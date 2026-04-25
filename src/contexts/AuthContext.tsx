import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthError, type Session, type User } from '@supabase/supabase-js'

import { apiJson } from '@/lib/apiClient'
import { supabase, isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase'
import type { Practitioner } from '@/types'

export type AppRole = 'practitioner' | 'athlete'

export interface AthleteProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  sport: string | null
  team: string | null
  status: 'unverified' | 'linked' | 'discontinued'
  uid_code: string | null
  timezone: string
  language: string
  created_at: string
  updated_at: string
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  role: AppRole | null
  practitioner: Practitioner | null
  athlete: AthleteProfile | null
  loading: boolean
  profileLoading: boolean
  authError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUpPractitioner: (
    email: string,
    password: string,
    meta: { first_name: string; last_name: string }
  ) => Promise<{ confirmEmail: boolean }>
  signUpAthlete: (
    email: string,
    password: string,
    meta: { first_name: string; last_name: string; sport?: string }
  ) => Promise<{ confirmEmail: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function provisionPractitioner(user: User): Promise<Practitioner | null> {
  try {
    const data = await apiJson<{ practitioner: Practitioner | null }>('/api/profile/bootstrap', {
      method: 'POST',
    })

    if (data.practitioner) {
      return data.practitioner
    }
  } catch (error) {
    console.error('[SPPS Auth] provisionPractitioner bootstrap failed:', error)
  }

  const firstName = typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name.trim() : ''
  const lastName = typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name.trim() : ''

  return {
    id: user.id,
    email: user.email ?? '',
    first_name: firstName || 'Practitioner',
    last_name: lastName,
    role: 'sport_psychologist',
    hipaa_acknowledged: false,
    compliance_completed: false,
    profile_completed: false,
    notification_email: true,
    notification_sms: false,
  }
}

async function provisionAthlete(user: User): Promise<AthleteProfile | null> {
  try {
    const data = await apiJson<{ athlete: AthleteProfile | null }>('/api/profile/bootstrap', {
      method: 'POST',
    })

    if (data.athlete) {
      return data.athlete
    }
  } catch (error) {
    console.error('[SPPS Auth] provisionAthlete bootstrap failed:', error)
  }

  const firstName = typeof user.user_metadata?.first_name === 'string'
    ? user.user_metadata.first_name.trim()
    : ''
  const lastName = typeof user.user_metadata?.last_name === 'string'
    ? user.user_metadata.last_name.trim()
    : ''
  const sport = typeof user.user_metadata?.sport === 'string' ? user.user_metadata.sport.trim() : ''

  return {
    id: typeof user.user_metadata?.athlete_id === 'string' && user.user_metadata.athlete_id.trim()
      ? user.user_metadata.athlete_id.trim()
      : user.id,
    email: user.email ?? '',
    first_name: firstName || 'Athlete',
    last_name: lastName,
    sport: sport || null,
    team: null,
    status: 'unverified',
    uid_code: null,
    timezone: 'Asia/Kolkata',
    language: 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function fetchPractitioner(user: User): Promise<Practitioner | null> {
  const idCandidates = [user.id, user.user_metadata?.practitioner_id]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  for (const practitionerId of idCandidates) {
    const { data, error } = await supabase
      .from('practitioners')
      .select('*')
      .eq('id', practitionerId)
      .maybeSingle()

    if (!error && data) {
      return data as Practitioner
    }

    if (error && error.code !== 'PGRST116') {
      console.error('[SPPS Auth] fetchPractitioner by id error:', error.message)
    }
  }

  if (user.email) {
    const { data, error } = await supabase
      .from('practitioners')
      .select('*')
      .eq('email', user.email)
      .maybeSingle()

    if (!error && data) {
      return data as Practitioner
    }

    if (error && error.code !== 'PGRST116' && error.code !== '42703') {
      console.error('[SPPS Auth] fetchPractitioner by email error:', error.message)
    }
  }

  return provisionPractitioner(user)
}

async function fetchAthlete(user: User): Promise<AthleteProfile | null> {
  const athleteIdFromMeta = typeof user.user_metadata?.athlete_id === 'string'
    ? user.user_metadata.athlete_id.trim()
    : ''

  const idCandidates = [user.id, athleteIdFromMeta].filter(Boolean)

  for (const athleteId of idCandidates) {
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .maybeSingle()

    if (!error && data) {
      if (athleteId !== user.id) {
        void supabase
          .from('athletes')
          .update({ portal_user_id: user.id, is_portal_activated: true })
          .eq('id', data.id)
      }
      return data as AthleteProfile
    }

    if (error && error.code !== 'PGRST116') {
      console.error('[SPPS Auth] fetchAthlete by id error:', error.message)
    }
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('athletes')
    .select('*')
    .eq('portal_user_id', user.id)
    .maybeSingle()

  if (!legacyError && legacyData) {
    return legacyData as AthleteProfile
  }

  if (legacyError && legacyError.code !== '42703' && legacyError.code !== 'PGRST116') {
    console.error('[SPPS Auth] fetchAthlete by portal_user_id error:', legacyError.message)
  }

  if (user.email) {
    const { data: emailData, error: emailError } = await supabase
      .from('athletes')
      .select('*')
      .eq('email', user.email)
      .maybeSingle()

    if (!emailError && emailData) {
      void supabase
        .from('athletes')
        .update({ portal_user_id: user.id, is_portal_activated: true })
        .eq('id', emailData.id)
      return emailData as AthleteProfile
    }

    if (emailError && emailError.code !== '42703' && emailError.code !== 'PGRST116') {
      console.error('[SPPS Auth] fetchAthlete by email error:', emailError.message)
    }
  }

  return provisionAthlete(user)
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function roleFromUser(user: User | null): AppRole | null {
  if (!user) return null
  const role = user.user_metadata?.role ?? user.app_metadata?.role
  if (role === 'athlete') return 'athlete'
  if (role === 'practitioner' || role === 'sport_psychologist') return 'practitioner'
  return null
}

function clearSupabaseStorage() {
  Object.keys(localStorage)
    .filter(key => key.startsWith('sb-') || key === 'spps-auth')
    .forEach(key => localStorage.removeItem(key))
}

function humanize(error: AuthError): string {
  const message = error.message.toLowerCase()
  if (message.includes('invalid login credentials')) return 'Incorrect email or password.'
  if (message.includes('email not confirmed')) return 'Please check your email and click the confirmation link first.'
  if (message.includes('user already registered')) return 'An account with this email already exists. Please sign in instead.'
  if (message.includes('password should be at least')) return 'Password must be at least 6 characters long.'
  if (message.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.'
  if (message.includes('email address') && message.includes('invalid')) return 'Please enter a valid email address.'
  if (message.includes('signup is disabled')) return 'New registrations are currently paused. Please contact support.'
  if (message.includes('email_already_used_as_practitioner')) return 'This email is already registered as a practitioner account.'
  if (message.includes('email_already_used_as_athlete')) return 'This email is already registered as an athlete account.'
  return error.message
}

function humanizeUnexpectedAuthError(error: unknown, action: 'sign in' | 'sign up' | 'reset your password'): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return `You appear to be offline. Reconnect to the internet and try to ${action} again.`
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return `Unable to reach Supabase right now. Check your internet connection and auth configuration, then try to ${action} again.`
  }

  if (lower.includes('fetch')) {
    return `The authentication service could not be reached. Please try to ${action} again in a moment.`
  }

  return message || `Unable to ${action} right now. Please try again.`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null)
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const authStateRef = useRef<{
    user: User | null
    practitioner: Practitioner | null
    athlete: AthleteProfile | null
  }>({
    user: null,
    practitioner: null,
    athlete: null,
  })
  const lastAuthUserIdRef = useRef<string | null>(null)
  const lastSessionExpiryRef = useRef<number | null>(null)

  const role = roleFromUser(user)

  useEffect(() => {
    authStateRef.current = {
      user,
      practitioner,
      athlete,
    }
  }, [user, practitioner, athlete])

  const loadProfileFor = useCallback(async (currentUser: User, options?: { background?: boolean }) => {
    const currentRole = roleFromUser(currentUser)
    if (currentRole === null) {
      console.warn('[SPPS Auth] User has no role metadata, signing out')
      setAuthError('Your account is missing role metadata. Please contact support.')
      await supabase.auth.signOut()
      return
    }

    const background = Boolean(options?.background)
    if (!background) {
      setProfileLoading(true)
    }
    try {
      if (currentRole === 'practitioner') {
        const data = await withTimeout(fetchPractitioner(currentUser), 10000, 'fetchPractitioner')
        setPractitioner(data)
        setAthlete(null)
        if (!data) {
          setAuthError('Signed in, but your practitioner profile could not be loaded.')
          await supabase.auth.signOut()
        }
        return
      }

      const data = await withTimeout(fetchAthlete(currentUser), 10000, 'fetchAthlete')
      setAthlete(data)
      setPractitioner(null)
      if (!data) {
        setAuthError('Signed in, but your athlete profile could not be loaded.')
        await supabase.auth.signOut()
      }
    } catch (error) {
      console.error('[SPPS Auth] loadProfileFor failed:', error)
      setAuthError((error as Error)?.message || 'Unable to load your account profile.')
      throw error
    } finally {
      if (!background) {
        setProfileLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true

    if (!isSupabaseConfigured) {
      setAuthError(getSupabaseConfigError())
      setLoading(false)
      return () => {
        mounted = false
      }
    }

    withTimeout(supabase.auth.getSession(), 10000, 'getSession')
      .then(async ({ data: { session }, error }) => {
        if (!mounted) return
        if (error) {
          console.warn('[SPPS Auth] corrupted session, clearing:', error.message)
          clearSupabaseStorage()
          setLoading(false)
          return
        }

        setSession(session)
        setUser(session?.user ?? null)
        lastAuthUserIdRef.current = session?.user?.id ?? null
        lastSessionExpiryRef.current = session?.expires_at ?? null

        if (session?.user) {
          await withTimeout(loadProfileFor(session.user), 10000, 'Initial profile load')
        }

        if (mounted) {
          setLoading(false)
        }
      })
      .catch(error => {
        console.error('[SPPS Auth] getSession threw:', error)
        clearSupabaseStorage()
        if (mounted) {
          setLoading(false)
        }
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (!mounted) return

        if (event === 'TOKEN_REFRESHED') {
          setSession(session)
          setUser(session?.user ?? null)
          lastAuthUserIdRef.current = session?.user?.id ?? null
          lastSessionExpiryRef.current = session?.expires_at ?? null
          return
        }

        if (event === 'SIGNED_IN') {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) {
            const currentRole = roleFromUser(session.user)
            const sameUser = authStateRef.current.user?.id === session.user.id
            const sameAuthUser = lastAuthUserIdRef.current === session.user.id
            const sessionStillValid = Boolean(
              session.expires_at && session.expires_at * 1000 > Date.now() + 15000
            )
            const hasProfile =
              currentRole === 'practitioner'
                ? Boolean(authStateRef.current.practitioner)
                : currentRole === 'athlete'
                  ? Boolean(authStateRef.current.athlete)
                  : false

            if (sameAuthUser && sessionStillValid && hasProfile) {
              lastSessionExpiryRef.current = session.expires_at ?? null
              return
            }

            lastAuthUserIdRef.current = session.user.id
            lastSessionExpiryRef.current = session.expires_at ?? null

            if (!sameUser || !hasProfile) {
              await withTimeout(
                loadProfileFor(session.user, { background: sameUser && hasProfile }),
                10000,
                'SIGNED_IN profile load'
              )
            }
          }
          return
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setPractitioner(null)
          setAthlete(null)
          lastAuthUserIdRef.current = null
          lastSessionExpiryRef.current = null
          clearSupabaseStorage()
          return
        }

        if (event === 'USER_UPDATED') {
          setSession(session)
          setUser(session?.user ?? null)
          lastAuthUserIdRef.current = session?.user?.id ?? null
          lastSessionExpiryRef.current = session?.expires_at ?? null
          if (session?.user) {
            await withTimeout(loadProfileFor(session.user, { background: true }), 10000, 'USER_UPDATED profile load')
          }
          return
        }

        setSession(session)
        setUser(session?.user ?? null)
        lastAuthUserIdRef.current = session?.user?.id ?? null
        lastSessionExpiryRef.current = session?.expires_at ?? null
      } catch (error) {
        console.error('[SPPS Auth] onAuthStateChange failed:', error)
        setAuthError((error as Error)?.message || 'Authentication state update failed.')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfileFor])

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured) {
      const message = getSupabaseConfigError()
      setAuthError(message)
      throw new Error(message)
    }

    setAuthError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        const message = humanize(error)
        setAuthError(message)
        throw new Error(message)
      }

      if (data.user) {
        await loadProfileFor(data.user)
      }
    } catch (error) {
      const message = humanizeUnexpectedAuthError(error, 'sign in')
      setAuthError(message)
      throw new Error(message)
    }
  }

  async function signUpPractitioner(
    email: string,
    password: string,
    meta: { first_name: string; last_name: string }
  ): Promise<{ confirmEmail: boolean }> {
    if (!isSupabaseConfigured) {
      const message = getSupabaseConfigError()
      setAuthError(message)
      throw new Error(message)
    }

    setAuthError(null)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'practitioner',
            first_name: meta.first_name,
            last_name: meta.last_name,
          },
          emailRedirectTo: typeof window !== 'undefined'
            ? new URL('/auth/login', window.location.origin).toString()
            : undefined,
        },
      })

      if (error) {
        const message = humanize(error)
        setAuthError(message)
        throw new Error(message)
      }

      if (!data.session) {
        return { confirmEmail: true }
      }

      if (data.user) {
        await loadProfileFor(data.user)
      }

      return { confirmEmail: false }
    } catch (error) {
      const message = humanizeUnexpectedAuthError(error, 'sign up')
      setAuthError(message)
      throw new Error(message)
    }
  }

  async function signUpAthlete(
    email: string,
    password: string,
    meta: { first_name: string; last_name: string; sport?: string }
  ): Promise<{ confirmEmail: boolean }> {
    if (!isSupabaseConfigured) {
      const message = getSupabaseConfigError()
      setAuthError(message)
      throw new Error(message)
    }

    setAuthError(null)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'athlete',
            first_name: meta.first_name,
            last_name: meta.last_name,
            sport: meta.sport ?? '',
          },
          emailRedirectTo: typeof window !== 'undefined'
            ? new URL('/athlete/login', window.location.origin).toString()
            : undefined,
        },
      })

      if (error) {
        const message = humanize(error)
        setAuthError(message)
        throw new Error(message)
      }

      if (!data.session) {
        return { confirmEmail: true }
      }

      if (data.user) {
        await loadProfileFor(data.user)
      }

      return { confirmEmail: false }
    } catch (error) {
      const message = humanizeUnexpectedAuthError(error, 'sign up')
      setAuthError(message)
      throw new Error(message)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setPractitioner(null)
    setAthlete(null)
  }

  async function refreshProfile() {
    if (user) {
      await loadProfileFor(user)
    }
  }

  function clearError() {
    setAuthError(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        practitioner,
        athlete,
        loading,
        profileLoading,
        authError,
        signIn,
        signUpPractitioner,
        signUpAthlete,
        signOut,
        refreshProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return context
}
