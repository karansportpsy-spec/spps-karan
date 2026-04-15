// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Practitioner } from '@/types'

interface AuthContextValue {
  user:             User | null
  session:          Session | null
  practitioner:     Practitioner | null
  loading:          boolean        // auth session loading
  profileLoading:   boolean        // practitioner profile loading
  authError:        string | null
  signIn:           (email: string, password: string) => Promise<void>
  signUp:           (email: string, password: string, meta?: Partial<Practitioner>) => Promise<{ confirmEmail: boolean }>
  signOut:          () => Promise<void>
  refreshProfile:   () => Promise<void>
  clearError:       () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Practitioner | null> {
  const { data, error } = await supabase
    .from('practitioners')
    .select('*, organisation:organisations(id,name,type,country,state_province,city,website_url)')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[SPPS Auth] fetchProfile error:', error.message)
    return null
  }
  return data as Practitioner | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null)
  const [session, setSession]             = useState<Session | null>(null)
  const [practitioner, setPractitioner]   = useState<Practitioner | null>(null)
  const [loading, setLoading]             = useState(true)      // blocks the whole app
  const [profileLoading, setProfileLoading] = useState(false)  // just profile fetch
  const [authError, setAuthError]         = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try {
      // Use a sentinel to distinguish "timed out" from "no row found".
      // "timed out" → keep existing practitioner (don't flash null during tab switch).
      // "null row"  → practitioners row missing; create it then retry once.
      const TIMED_OUT = Symbol('timed_out')
      const timeout   = new Promise<typeof TIMED_OUT>(resolve =>
        setTimeout(() => resolve(TIMED_OUT), 6000)
      )
      const result = await Promise.race([fetchProfile(userId), timeout])

      if (result === TIMED_OUT) {
        // Slow DB — keep whatever we already have; do NOT set null
        console.warn('[SPPS Auth] loadProfile timed out — keeping existing state')
        return
      }

      if (result !== null) {
        // Happy path: row exists and loaded fine
        setPractitioner(result)
        return
      }

      // result === null → no practitioners row exists yet.
      // This happens when the DB trigger hasn't fired yet or the client-side
      // upsert in signUp failed. Attempt to create the row from auth metadata.
      console.warn('[SPPS Auth] No practitioners row — attempting recovery create')
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        await supabase.from('practitioners').upsert({
          id:                   authUser.id,
          email:                authUser.email ?? '',
          first_name:           authUser.user_metadata?.first_name ?? '',
          last_name:            authUser.user_metadata?.last_name  ?? '',
          role:                 authUser.user_metadata?.role ?? 'sport_psychologist',
          hipaa_acknowledged:   false,
          compliance_completed: false,
          profile_completed:    false,
          notification_email:   true,
          notification_sms:     false,
        }, { onConflict: 'id' })

        // Retry fetch once after creating the row
        const recovered = await fetchProfile(authUser.id)
        setPractitioner(recovered)  // may still be null if RLS blocks — that's ok,
                                    // router will redirect to login
      } else {
        setPractitioner(null)
      }
    } catch (e) {
      console.error('[SPPS Auth] loadProfile failed:', e)
      setPractitioner(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // ── Initial session check ─────────────────────────────────────────────────
    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (!mounted) return

        if (error) {
          // Corrupted token — clear ALL auth-related storage so user sees login page
          // Clears both the default sb-* key AND the legacy 'spps-auth' custom key
          console.warn('[SPPS Auth] Corrupted session detected, clearing storage:', error.message)
          Object.keys(localStorage)
            .filter(k => k.startsWith('sb-') || k === 'spps-auth')
            .forEach(k => localStorage.removeItem(k))
          if (mounted) setLoading(false)
          return
        }

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          // Athletes don't have a practitioners row — skip profile loading
          const role = session.user.user_metadata?.role
          if (role !== 'athlete') {
            await loadProfile(session.user.id)
          }
        }

        if (mounted) setLoading(false)
      })
      .catch((err) => {
        // Catches JSON parse errors from malformed localStorage values
        console.error('[SPPS Auth] getSession threw unexpectedly:', err)
        Object.keys(localStorage).filter(k => k.startsWith('sb-') || k === 'spps-auth').forEach(k => localStorage.removeItem(k))
        if (mounted) setLoading(false)
      })

    // ── Auth state listener ───────────────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      // TOKEN_REFRESHED fires every ~55 min — silently update session
      // without re-fetching profile or triggering re-renders
      if (event === 'TOKEN_REFRESHED') {
        setSession(session)
        return
      }

      if (event === 'SIGNED_IN') {
        setSession(session)
        setUser(session?.user ?? null)
        // Athletes don't have a practitioners row — skip
        if (session?.user && session.user.user_metadata?.role !== 'athlete') {
          setPractitioner(prev => {
            if (prev === null) loadProfile(session.user!.id)
            return prev
          })
        }
        return
      }

      if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        setPractitioner(null)
        // Only clear Supabase keys, not the whole localStorage
        Object.keys(localStorage).filter(k => k.startsWith('sb-') || k === 'spps-auth').forEach(k => localStorage.removeItem(k))
        return
      }

      if (event === 'USER_UPDATED') {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        return
      }

      // INITIAL_SESSION, PASSWORD_RECOVERY — update silently
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  // ── Sign In ─────────────────────────────────────────────────────────────────
  async function signIn(email: string, password: string) {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const m = humanize(error)
      setAuthError(m)
      throw new Error(m)
    }
    if (data.user) {
      if (data.user.user_metadata?.role !== 'athlete') {
        await loadProfile(data.user.id)
      }
    }
  }

  // ── Sign Up ─────────────────────────────────────────────────────────────────
  async function signUp(email: string, password: string, meta?: Partial<Practitioner>): Promise<{ confirmEmail: boolean }> {
    setAuthError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: meta?.first_name ?? '',
          last_name:  meta?.last_name  ?? '',
          role:       meta?.role ?? 'sport_psychologist',
        },
      },
    })
    if (error) {
      const m = humanize(error)
      setAuthError(m)
      throw new Error(m)
    }

    // ── Email confirmation is enabled ──────────────────────────────
    // data.session is null when Supabase requires email confirmation.
    // In that case auth.uid() is null, RLS blocks everything, and we
    // must NOT attempt loadProfile or client-side upserts.  The DB
    // trigger (handle_new_user) has already created the practitioners
    // row server-side.  We just tell the UI to show a "check email"
    // message.
    if (!data.session) {
      console.info('[SPPS Auth] signUp: email confirmation required — skipping loadProfile')
      return { confirmEmail: true }
    }

    // ── Email confirmation is disabled — session available ─────────
    if (data.user) {
      // Safety-net upsert in case the trigger isn't deployed yet
      const { error: profileError } = await supabase.from('practitioners').upsert({
        id:                   data.user.id,
        email,
        first_name:           meta?.first_name ?? '',
        last_name:            meta?.last_name  ?? '',
        role:                 'sport_psychologist',
        hipaa_acknowledged:   false,
        compliance_completed: false,
        profile_completed:    false,
        notification_email:   true,
        notification_sms:     false,
      }, { onConflict: 'id' })

      if (profileError) {
        console.warn('[SPPS Auth] Client-side profile upsert failed (trigger is primary):', profileError.message)
      }

      await loadProfile(data.user.id)
    }

    return { confirmEmail: false }
  }

  // ── Sign Out ────────────────────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setPractitioner(null)
  }

  // ── Refresh Profile ─────────────────────────────────────────────────────────
  // Called after compliance completion so the router guard sees the updated state
  async function refreshProfile() {
    if (user) await loadProfile(user.id)
  }

  function clearError() { setAuthError(null) }

  return (
    <AuthContext.Provider value={{
      user, session, practitioner, loading, profileLoading, authError,
      signIn, signUp, signOut, refreshProfile, clearError,
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
  return error.message
}
