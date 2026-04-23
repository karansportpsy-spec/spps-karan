// src/contexts/AuthContext.tsx
//
// v2 dual-role auth context.
//
//   • Practitioner signup  → signUp(email, password, { role: 'practitioner', ... })
//   • Athlete signup       → signUp(email, password, { role: 'athlete', ... })
//
// For BOTH roles, the database trigger (handle_new_user in migration 3)
// creates the corresponding profile row automatically. This context loads
// that profile on sign-in / session-restore and exposes it via:
//
//   user           — Supabase auth user (either role)
//   role           — 'practitioner' | 'athlete' | null
//   practitioner   — the practitioners row (only when role='practitioner')
//   athlete        — the athletes row (only when role='athlete')
//
// Router guards route based on `role` first; use `practitioner`/`athlete`
// for page-level reads.

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase'
import type { Practitioner } from '@/types'

export type AppRole = 'practitioner' | 'athlete'

export interface AthleteProfile {
  id:            string
  email:         string
  first_name:    string
  last_name:     string
  sport:         string | null
  team:          string | null
  status:        'unverified' | 'linked' | 'discontinued'
  uid_code:      string | null
  timezone:      string
  language:      string
  created_at:    string
  updated_at:    string
}

interface AuthContextValue {
  user:            User | null
  session:         Session | null
  role:            AppRole | null
  practitioner:    Practitioner | null
  athlete:         AthleteProfile | null
  loading:         boolean        // session restoring
  profileLoading:  boolean        // profile row loading
  authError:       string | null
  signIn:          (email: string, password: string) => Promise<void>
  signUpPractitioner: (email: string, password: string, meta: { first_name: string; last_name: string }) => Promise<{ confirmEmail: boolean }>
  signUpAthlete:      (email: string, password: string, meta: { first_name: string; last_name: string; sport?: string }) => Promise<{ confirmEmail: boolean }>
  signOut:         () => Promise<void>
  refreshProfile:  () => Promise<void>
  clearError:      () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Profile fetchers ─────────────────────────────────────────────────────────
async function fetchPractitioner(userId: string): Promise<Practitioner | null> {
  const { data, error } = await supabase
    .from('practitioners')
    .select('*, organisation:organisations(id,name,type,country,state_province,city,website_url)')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[SPPS Auth] fetchPractitioner error:', error.message)
    return null
  }
  return data as Practitioner | null
}

async function fetchAthlete(userId: string): Promise<AthleteProfile | null> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[SPPS Auth] fetchAthlete error:', error.message)
    return null
  }
  return data as AthleteProfile | null
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function roleFromUser(u: User | null): AppRole | null {
  if (!u) return null
  const r = u.user_metadata?.role
  if (r === 'athlete') return 'athlete'
  // Accept both 'practitioner' and legacy 'sport_psychologist' metadata
  if (r === 'practitioner' || r === 'sport_psychologist') return 'practitioner'
  return null
}

// ── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                     = useState<User | null>(null)
  const [session, setSession]               = useState<Session | null>(null)
  const [practitioner, setPractitioner]     = useState<Practitioner | null>(null)
  const [athlete, setAthlete]               = useState<AthleteProfile | null>(null)
  const [loading, setLoading]               = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [authError, setAuthError]           = useState<string | null>(null)

  const role = roleFromUser(user)

  const loadProfileFor = useCallback(async (u: User) => {
    const r = roleFromUser(u)
    if (r === null) {
      console.warn('[SPPS Auth] User has no role metadata — signing out')
      setAuthError('Your account is missing role metadata. Please contact support.')
      await supabase.auth.signOut()
      return
    }

    setProfileLoading(true)
    try {
      if (r === 'practitioner') {
        const p = await withTimeout(fetchPractitioner(u.id), 10000, 'fetchPractitioner')
        setPractitioner(p)
        setAthlete(null)
        if (!p) {
          setAuthError('Signed in, but your practitioner profile could not be loaded.')
          await supabase.auth.signOut()
        }
      } else {
        const a = await withTimeout(fetchAthlete(u.id), 10000, 'fetchAthlete')
        setAthlete(a)
        setPractitioner(null)
        if (!a) {
          setAuthError('Signed in, but your athlete profile could not be loaded.')
          await supabase.auth.signOut()
        }
      }
    } catch (err) {
      console.error('[SPPS Auth] loadProfileFor failed:', err)
      setAuthError((err as Error)?.message || 'Unable to load your account profile.')
      throw err
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    if (!isSupabaseConfigured) {
      setAuthError(getSupabaseConfigError())
      setLoading(false)
      return () => { mounted = false }
    }

    // ── Initial session ─────────────────────────────────────────────
    withTimeout(supabase.auth.getSession(), 10000, 'getSession')
      .then(async ({ data: { session }, error }) => {
        if (!mounted) return
        if (error) {
          console.warn('[SPPS Auth] corrupted session, clearing:', error.message)
          Object.keys(localStorage).filter(k => k.startsWith('sb-') || k === 'spps-auth').forEach(k => localStorage.removeItem(k))
          if (mounted) setLoading(false)
          return
        }
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) await withTimeout(loadProfileFor(session.user), 10000, 'Initial profile load')
        if (mounted) setLoading(false)
      })
      .catch(err => {
        console.error('[SPPS Auth] getSession threw:', err)
        Object.keys(localStorage).filter(k => k.startsWith('sb-') || k === 'spps-auth').forEach(k => localStorage.removeItem(k))
        if (mounted) setLoading(false)
      })

    // ── Auth event stream ───────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (!mounted) return

        if (event === 'TOKEN_REFRESHED') {
          setSession(session)
          return
        }

        if (event === 'SIGNED_IN') {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) await withTimeout(loadProfileFor(session.user), 10000, 'SIGNED_IN profile load')
          return
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setPractitioner(null)
          setAthlete(null)
          Object.keys(localStorage).filter(k => k.startsWith('sb-') || k === 'spps-auth').forEach(k => localStorage.removeItem(k))
          return
        }

        if (event === 'USER_UPDATED') {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user) await withTimeout(loadProfileFor(session.user), 10000, 'USER_UPDATED profile load')
          return
        }

        setSession(session)
        setUser(session?.user ?? null)
      } catch (err) {
        console.error('[SPPS Auth] onAuthStateChange failed:', err)
        setAuthError((err as Error)?.message || 'Authentication state update failed.')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfileFor])

  // ── Sign In (role-agnostic) ─────────────────────────────────────────
  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured) {
      const message = getSupabaseConfigError()
      setAuthError(message)
      throw new Error(message)
    }
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      const m = humanize(error)
      setAuthError(m)
      throw new Error(m)
    }
    if (data.user) {
      await loadProfileFor(data.user)
    }
  }

  // ── Sign Up (practitioner) ──────────────────────────────────────────
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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role: 'practitioner',
          first_name: meta.first_name,
          last_name:  meta.last_name,
        },
        emailRedirectTo: typeof window !== 'undefined'
          ? new URL('/auth/login', window.location.origin).toString()
          : undefined,
      },
    })
    if (error) {
      const m = humanize(error)
      setAuthError(m)
      throw new Error(m)
    }

    // Email confirmation enabled → no session yet
    if (!data.session) {
      return { confirmEmail: true }
    }

    // Session available → trigger has already created the practitioners row
    if (data.user) {
      await loadProfileFor(data.user)
    }
    return { confirmEmail: false }
  }

  // ── Sign Up (athlete) ───────────────────────────────────────────────
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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role: 'athlete',
          first_name: meta.first_name,
          last_name:  meta.last_name,
          sport:      meta.sport ?? '',
        },
        emailRedirectTo: typeof window !== 'undefined'
          ? new URL('/athlete/login', window.location.origin).toString()
          : undefined,
      },
    })
    if (error) {
      const m = humanize(error)
      setAuthError(m)
      throw new Error(m)
    }

    if (!data.session) return { confirmEmail: true }

    if (data.user) {
      await loadProfileFor(data.user)
    }
    return { confirmEmail: false }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setPractitioner(null)
    setAthlete(null)
  }

  async function refreshProfile() {
    if (user) await loadProfileFor(user)
  }

  function clearError() { setAuthError(null) }

  return (
    <AuthContext.Provider value={{
      user, session, role, practitioner, athlete,
      loading, profileLoading, authError,
      signIn, signUpPractitioner, signUpAthlete,
      signOut, refreshProfile, clearError,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

// ── Human-readable auth error messages ─────────────────────────────────────
function humanize(error: AuthError): string {
  const m = error.message.toLowerCase()
  if (m.includes('invalid login credentials'))              return 'Incorrect email or password.'
  if (m.includes('email not confirmed'))                    return 'Please check your email and click the confirmation link first.'
  if (m.includes('user already registered'))                return 'An account with this email already exists. Please sign in instead.'
  if (m.includes('password should be at least'))            return 'Password must be at least 6 characters long.'
  if (m.includes('rate limit'))                             return 'Too many attempts — please wait a moment and try again.'
  if (m.includes('email address') && m.includes('invalid')) return 'Please enter a valid email address.'
  if (m.includes('signup is disabled'))                     return 'New registrations are currently paused. Please contact support.'
  if (m.includes('email_already_used_as_practitioner'))     return 'This email is already registered as a practitioner account.'
  if (m.includes('email_already_used_as_athlete'))          return 'This email is already registered as an athlete account.'
  return error.message
}
