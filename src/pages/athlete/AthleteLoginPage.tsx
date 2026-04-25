import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Target, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LogoBrand from '@/components/LogoBrand'

type Mode = 'signin' | 'reset' | 'reset_sent'

function humanizeResetError(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Reconnect to the internet and try sending the reset link again.'
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('network request failed')
  ) {
    return 'Unable to reach the password reset service right now. Check your internet connection and try again.'
  }

  return message || 'Unable to send the reset link right now.'
}

export default function AthleteLoginPage() {
  const { signIn, authError, clearError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/athlete/dashboard'

  const [mode, setMode]         = useState<Mode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [resetErr, setResetErr] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch {
      // error shown via authError
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetErr('')
    setLoading(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/athlete/login`,
      })
      if (error) throw error
      setMode('reset_sent')
    } catch (err) {
      setResetErr(humanizeResetError(err))
    } finally {
      setLoading(false)
    }
  }

  // ── UI: reset email sent ─────────────────────────────────────────────
  if (mode === 'reset_sent') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
          <LogoBrand size="md" variant="full" />
          <h1 className="text-xl font-bold text-gray-900 mt-6 mb-2">Reset link sent</h1>
          <p className="text-sm text-gray-600 mb-6">
            If <span className="font-medium">{email}</span> is a registered athlete account,
            you'll receive a password reset link shortly.
          </p>
          <button
            onClick={() => { setMode('signin'); setEmail(''); setPassword('') }}
            className="text-teal-600 hover:underline text-sm font-medium"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  // ── UI: reset request ────────────────────────────────────────────────
  if (mode === 'reset') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center gap-2 mb-6">
            <LogoBrand size="sm" variant="full" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter your email and we'll send a reset link.
          </p>
          <form onSubmit={handleReset} className="space-y-4">
            {resetErr && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {resetErr}
              </div>
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── UI: default sign-in ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">
        <div className="flex items-center gap-2 mb-2">
          <LogoBrand size="sm" variant="full" />
        </div>
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
          <Target size={12} /> Athlete portal
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in to your athlete account.</p>

        <form onSubmit={handleSignIn} className="space-y-4">
          {authError && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => { clearError(); setMode('reset') }}
            className="block text-center w-full text-xs text-gray-500 hover:text-gray-700"
          >
            Forgot your password?
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-600 mb-2">New to SPPS?</p>
          <Link
            to="/athlete/signup"
            className="inline-block w-full py-2.5 bg-white border border-teal-200 text-teal-700 text-sm font-semibold rounded-xl hover:bg-teal-50 transition-colors"
          >
            Create an athlete account
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
          Are you a practitioner?{' '}
          <Link to="/auth/login" className="text-blue-600 hover:underline">
            Use the practitioner portal
          </Link>
        </div>
      </div>
    </div>
  )
}
