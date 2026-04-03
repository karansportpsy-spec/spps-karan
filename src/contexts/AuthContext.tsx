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
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!mounted) return
      if (error) { console.error('[SPPS Auth] getSession:', error.message); setLoading(false); return }
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      setSession(session); setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && session?.user) await loadProfile(session.user.id)
      if (event === 'SIGNED_OUT') setPractitioner(null)
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
      options: { data: { first_name: meta?.first_name ?? '', last_name: meta?.last_name ?? '', role: meta?.role ?? 'sport_psychologist' } },
    })
    if (error) { const m = humanize(error); setAuthError(m); throw new Error(m) }
    if (data.user) {
      await supabase.from('practitioners').upsert({
        id: data.user.id, email,
        first_name: meta?.first_name ?? '',
        last_name:  meta?.last_name  ?? '',
        role:       meta?.role ?? 'sport_psychologist',
        hipaa_acknowledged: false, compliance_completed: false,
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
  if (m.includes('email not confirmed'))         return 'Please confirm your email before signing in.'
  if (m.includes('user already registered'))     return 'An account with this email already exists.'
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (m.includes('rate limit'))                  return 'Too many attempts — please wait a moment.'
  return error.message
}
