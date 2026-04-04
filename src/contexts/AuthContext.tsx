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
  try {
    const { data, error } = await supabase
      .from('practitioners')
      .select('*, organisation:organisations(id,name,type,country,state_province,city,website_url)')
      .eq('id', userId)
      .maybeSingle()
    if (error) { console.error('[SPPS Auth] fetchProfile:', error.message); return null }
    return data as Practitioner | null
  } catch (e) {
    console.error('[SPPS Auth] fetchProfile exception:', e)
    return null
  }
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

    // Hard timeout - loading MUST end within 4 seconds no matter what
    const hardTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[SPPS Auth] Hard timeout — forcing loading=false')
        setLoading(false)
      }
    }, 4000)

    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (!mounted) return
        if (error) {
          console.error('[SPPS Auth] getSession:', error.message)
          clearTimeout(hardTimeout)
          setLoading(false)
          return
        }
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          const profile = await Promise.race([
            fetchProfile(session.user.id),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
          ])
          if (mounted) setPractitioner(profile)
        }
        clearTimeout(hardTimeout)
        if (mounted) setLoading(false)
      })
      .catch((e) => {
        console.error('[SPPS Auth] getSession exception:', e)
        clearTimeout(hardTimeout)
        if (mounted) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (event === 'TOKEN_REFRESHED') { setSession(session); return }
      if (event === 'SIGNED_IN') {
        setSession(session); setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        return
      }
      if (event === 'SIGNED_OUT') { setSession(null); setUser(null); setPractitioner(null); return }
      if (event === 'USER_UPDATED') {
        setSession(session); setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        return
      }
      setSession(session); setUser(session?.user ?? null)
    })

    return () => { mounted = false; clearTimeout(hardTimeout); subscription.unsubscribe() }
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
      options: { data: { first_name: meta?.first_name ?? '', last_name: meta?.last_name ?? '', role: meta?.role ?? 'sport_psychologist' } },
    })
    if (error) { const m = humanize(error); setAuthError(m); throw new Error(m) }
    if (data.user) {
      await supabase.from('practitioners').upsert({
        id: data.user.id, email,
        first_name: meta?.first_name ?? '', last_name: meta?.last_name ?? '',
        role: meta?.role ?? 'sport_psychologist',
        hipaa_acknowledged: false, compliance_completed: false,
        notification_email: true, notification_sms: false,
      }, { onConflict: 'id' })
      await loadProfile(data.user.id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setSession(null); setPractitioner(null)
  }

  async function refreshProfile() { if (user) await loadProfile(user.id) }
  function clearError() { setAuthError(null) }

  return (
    <AuthContext.Provider value={{ user, session, practitioner, loading, authError, signIn, signUp, signOut, refreshProfile, clearError }}>
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
  if (m.includes('invalid login credentials'))   return 'Incorrect email or password.'
  if (m.includes('email not confirmed'))         return 'Please check your email and click the confirmation link.'
  if (m.includes('user already registered'))     return 'An account with this email already exists. Please sign in.'
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (m.includes('rate limit'))                  return 'Too many attempts — please wait a moment and try again.'
  return error.message
}
