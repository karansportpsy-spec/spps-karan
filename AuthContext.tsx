import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Practitioner } from '@/types'

interface AuthContextValue {
  user:             User | null
  session:          Session | null
  practitioner:     Practitioner | null
  loading:          boolean
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
  if (error) { console.error('[SPPS Auth] fetchProfile:', error.message); return null }
  return data as Practitioner | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                 = useState<User | null>(null)
  const [session, setSession]           = useState<Session | null>(null)
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null)
  const [loading, setLoading]           = useState(true)
  const [authError, setAuthError]       = useState<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const profile = await fetchProfile(userId)
    setPractitioner(profile)
  }, [])

  useEffect(() => {
    let mounted = true

    // Initial session load
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!mounted) return
      
      if (error) { 
        console.error('[SPPS Auth] getSession error detected. Clearing corrupted storage:', error.message)
        // THE FIX: Automatically clear the bad token so the user isn't stuck
        localStorage.clear() 
        setLoading(false) 
        return 
      }
      
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      setLoading(false)
    }).catch((err) => {
      // Catch any unexpected local storage parsing errors
      console.error('[SPPS Auth] getSession unexpected error:', err)
      localStorage.clear()
      setLoading(false)
    })

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      // FIX: Only update state for meaningful auth events.
      // TOKEN_REFRESHED fires every ~55 min and was causing full re-renders
      // that appeared as "reloads" to users. We silently update the session
      // object without triggering profile re-fetches or loading state changes.
      if (event === 'TOKEN_REFRESHED') {
        setSession(session)  // keep session fresh but don't re-render pages
        return
      }

      if (event === 'SIGNED_IN') {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        return
      }

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        // Also clear storage on explicit sign out
        localStorage.clear() 
        setSession(null)
        setUser(null)
        setPractitioner(null)
        return
      }

      if (event === 'USER_UPDATED') {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        return
      }

      // PASSWORD_RECOVERY, INITIAL_SESSION — update session silently
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [loadProfile])

  async function signIn(email: string, password: string) {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { const m = humanize(error); setAuthError(m); throw new Error(m) }
    if (data.user) await loadProfile(data.user.id)
  }

  async function signUp(email: string, password: string, meta?: Partial<Practitioner>) {
    setAuthError(null)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: {
          first_name: meta?.first_name ?? '',
          last_name:  meta?.last_name  ?? '',
          role:       meta?.role ?? 'sport_psychologist',
        },
      },
    })
    if (error) { const m = humanize(error); setAuthError(m); throw new Error(m) }
    if (data.user) {
      // FIX: Use insert with conflict handling instead of upsert
      // to avoid issues when practitioners row doesn't exist yet
      const { error: profileError } = await supabase.from('practitioners').upsert({
        id:                  data.user.id,
        email,
        first_name:          meta?.first_name ?? '',
        last_name:           meta?.last_name  ?? '',
        role:                meta?.role ?? 'sport_psychologist',
        hipaa_acknowledged:  false,
        compliance_completed: false,
        notification_email:  true,
        notification_sms:    false,
      }, { onConflict: 'id' })

      if (profileError) {
        console.error('[SPPS Auth] Failed to create practitioner profile:', profileError.message)
      }

      await loadProfile(data.user.id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setPractitioner(null)
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id)
  }

  function clearError() { setAuthError(null) }

  return (
    <AuthContext.Provider value={{
      user, session, practitioner, loading, authError,
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

function humanize(error: AuthError): string {
  const m = error.message.toLowerCase()
  if (m.includes('invalid login credentials'))    return 'Incorrect email or password.'
  if (m.includes('email not confirmed'))          return 'Please check your email and click the confirmation link.'
  if (m.includes('user already registered'))      return 'An account with this email already exists. Please sign in.'
  if (m.includes('password should be at least'))  return 'Password must be at least 6 characters.'
  if (m.includes('rate limit'))                   return 'Too many attempts — please wait a moment and try again.'
  if (m.includes('email address') && m.includes('invalid')) return 'Please enter a valid email address.'
  return error.message
}