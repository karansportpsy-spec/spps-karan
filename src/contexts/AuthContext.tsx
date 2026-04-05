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
  signUp:           (email: string, password: string, meta?: Partial<Practitioner>) => Promise<void>
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
      // 6s timeout — the organisations join can be slow on cold Supabase instances.
      // If it times out, we keep whatever practitioner state we already have.
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 6000))
      const profile = await Promise.race([fetchProfile(userId), timeout])
      // Only update if we got a real profile back — don't overwrite with null on timeout
      if (profile !== null) setPractitioner(profile)
    } catch (e) {
      console.error('[SPPS Auth] loadProfile failed:', e)
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
          await loadProfile(session.user.id)
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
        // Only fetch profile if we don't already have one loaded.
        // Tab-focus triggers SIGNED_IN repeatedly — re-fetching each time
        // causes the spinner to appear on every tab switch.
        if (session?.user) {
          setPractitioner(prev => {
            if (prev === null) {
              // No profile yet — load it (this is a genuine new sign-in)
              loadProfile(session.user!.id)
            }
            // Already have a profile — keep it, skip the slow DB fetch
            return prev
          })
        }
        return
      }

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
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
    if (data.user) await loadProfile(data.user.id)
  }

  // ── Sign Up ─────────────────────────────────────────────────────────────────
  async function signUp(email: string, password: string, meta?: Partial<Practitioner>) {
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
    if (data.user) {
      // Upsert practitioner profile — safe to re-run if signup was partially complete
      const { error: profileError } = await supabase.from('practitioners').upsert({
        id:                   data.user.id,
        email,
        first_name:           meta?.first_name ?? '',
        last_name:            meta?.last_name  ?? '',
        role:                 meta?.role ?? 'sport_psychologist',
        hipaa_acknowledged:   false,
        compliance_completed: false,
        notification_email:   true,
        notification_sms:     false,
      }, { onConflict: 'id' })

      if (profileError) {
        console.error('[SPPS Auth] Failed to create practitioner profile:', profileError.message)
      }

      await loadProfile(data.user.id)
    }
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
