// src/pages/athlete/AthleteLoginPage.tsx
// Athlete sign-in using Supabase Auth (unified with AcceptInvitePage flow).
// Replaces the legacy custom-backend flow that depended on columns
// (portal_user_id, is_portal_activated) no longer in the schema.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, Shield, Eye, EyeOff, AlertCircle, Loader2, Mail, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

type Mode = 'signin' | 'reset' | 'reset_sent'

export default function AthleteLoginPage() {
  const navigate = useNavigate()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // If already authenticated as an athlete, skip straight to the dashboard
  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      const role = data.session?.user?.user_metadata?.role
      if (data.session && role === 'athlete') {
        navigate('/athlete/dashboard', { replace: true })
      }
    }
    check()
    return () => { cancelled = true }
  }, [navigate])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInErr) throw signInErr
      if (!data.user) throw new Error('Sign-in failed. Please try again.')

      const role = data.user.user_metadata?.role
      if (role !== 'athlete') {
        // Sign out so we don't leave a practitioner session on an athlete device
        await supabase.auth.signOut()
        throw new Error(
          'This account is a practitioner account. Please use the main sign-in page.'
        )
      }

      navigate('/athlete/dashboard', { replace: true })
    } catch (err: any) {
      const msg = humanize(err?.message)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/athlete/login` }
      )
      if (resetErr) throw resetErr
      setMode('reset_sent')
    } catch (err: any) {
      setError(humanize(err?.message))
    } finally {
      setLoading(false)
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#1A2D4A] via-[#1e3a5f] to-[#0D7C8E]">
      <div className="px-6 py-4">
        <LogoBrand size="md" variant="sidebar" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* Brand bar */}
            <div className="bg-gradient-to-r from-[#1A2D4A] to-[#0D7C8E] px-6 py-5">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={16} className="text-white/90" />
                <p className="text-xs font-semibold text-white/90 uppercase tracking-[0.1em]">
                  Athlete Portal
                </p>
              </div>
              <h1 className="text-xl font-black text-white">
                {mode === 'signin'     && 'Welcome back'}
                {mode === 'reset'      && 'Reset your password'}
                {mode === 'reset_sent' && 'Check your email'}
              </h1>
              <p className="text-sm text-white/75 mt-0.5">
                {mode === 'signin'     && 'Sign in to your performance portal'}
                {mode === 'reset'      && 'We\'ll email you a reset link'}
                {mode === 'reset_sent' && 'A reset link is on its way'}
              </p>
            </div>

            <div className="p-6">
              {/* ── SIGN IN ─────────────────────────────────────────────────── */}
              {mode === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                      placeholder="athlete@email.com"
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">Password</label>
                      <button
                        type="button"
                        onClick={() => { setError(''); setMode('reset') }}
                        className="text-xs font-medium text-[#0D7C8E] hover:underline"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
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

                  {error && (
                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email || !password}
                    className="w-full bg-[#0D7C8E] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#0a6a7a] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                  >
                    {loading
                      ? <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                      : <><LogIn size={14} /> Sign In</>
                    }
                  </button>

                  <p className="text-xs text-gray-400 text-center pt-2">
                    First time here? Check your email for the invite from your practitioner.
                  </p>
                </form>
              )}

              {/* ── RESET REQUEST ────────────────────────────────────────────── */}
              {mode === 'reset' && (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                      placeholder="athlete@email.com"
                      autoComplete="email"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Enter the email your practitioner used to invite you.
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setError(''); setMode('signin') }}
                      className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !email}
                      className="flex-1 bg-[#0D7C8E] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#0a6a7a] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {loading
                        ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                        : <><Mail size={14} /> Send link</>
                      }
                    </button>
                  </div>
                </form>
              )}

              {/* ── RESET SENT ──────────────────────────────────────────────── */}
              {mode === 'reset_sent' && (
                <div className="space-y-4 text-center py-2">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">
                      If an account exists for <strong>{email}</strong>, a reset link is on its way.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Check your inbox (and spam folder). The link expires in 1 hour.
                    </p>
                  </div>
                  <button
                    onClick={() => { setPassword(''); setError(''); setMode('signin') }}
                    className="text-sm font-medium text-[#0D7C8E] hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Practitioner link */}
          <p className="text-center text-xs text-white/70 mt-4">
            Are you a practitioner?{' '}
            <Link to="/auth/login" className="text-white underline hover:text-white/90">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Human-friendly auth error messages ──────────────────────────────────────
function humanize(raw: string | undefined): string {
  if (!raw) return 'Something went wrong. Please try again.'
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials'))   return 'Incorrect email or password.'
  if (m.includes('email not confirmed'))         return 'Please confirm your email first. Check your inbox for the confirmation link.'
  if (m.includes('rate limit'))                  return 'Too many attempts — please wait a moment and try again.'
  if (m.includes('user not found'))              return 'No account found for that email.'
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  return raw
}
