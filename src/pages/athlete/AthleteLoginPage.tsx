// src/pages/athlete/AthleteLoginPage.tsx
//
// Athlete-side entry: Sign In or Sign Up, on the same page.
//
// Sign-up flow:
//   1. Athlete types their email (the one the practitioner authorized)
//   2. We call is_athlete_email_authorized(email) to check BEFORE password entry.
//      If not authorized, show a clear error. (Server also enforces this via
//      the handle_new_athlete trigger — this client check is for UX.)
//   3. Athlete sets a password, signs up with role='athlete' metadata.
//   4. On success, land on /athlete/dashboard.
//
// Sign-in flow: standard Supabase email+password.
// Reset password: Supabase resetPasswordForEmail (transactional email from
// Supabase's built-in provider — not ours).

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LogIn, Shield, Eye, EyeOff, AlertCircle, Loader2, Mail,
  CheckCircle, UserPlus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

type Mode = 'signin' | 'signup' | 'reset' | 'reset_sent'

export default function AthleteLoginPage() {
  const navigate = useNavigate()
  const [mode,            setMode]            = useState<Mode>('signin')
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName,       setFirstName]       = useState('')
  const [showPw,          setShowPw]          = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [info,            setInfo]            = useState('')

  // Skip the page entirely if an athlete is already signed in
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

  function resetForm() {
    setError('')
    setInfo('')
    setPassword('')
    setConfirmPassword('')
  }

  // ── Sign in ─────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
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
        await supabase.auth.signOut()
        throw new Error(
          'This is a practitioner account. Please sign in on the main practitioner page.'
        )
      }
      navigate('/athlete/dashboard', { replace: true })
    } catch (err: any) {
      setError(humanize(err?.message))
    } finally {
      setLoading(false)
    }
  }

  // ── Sign up ─────────────────────────────────────────────────────────────
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    const trimmed = email.trim().toLowerCase()
    if (!trimmed)                         { setError('Please enter your email.');                    return }
    if (password.length < 8)              { setError('Password must be at least 8 characters.');     return }
    if (password !== confirmPassword)     { setError('Passwords do not match.');                     return }

    setLoading(true)
    try {
      // 1. Pre-check: is this email authorized? (pure UX improvement; the DB
      //    trigger also enforces this).
      const { data: authorized, error: rpcErr } = await supabase
        .rpc('is_athlete_email_authorized', { p_email: trimmed })

      if (rpcErr) {
        throw new Error('Could not verify email authorization. Please try again.')
      }
      if (authorized === false) {
        throw new Error(
          'This email is not authorized yet. Please ask your practitioner to authorize it first.'
        )
      }

      // 2. Sign up with Supabase Auth
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email:    trimmed,
        password,
        options: {
          data: {
            role:       'athlete',
            first_name: firstName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/athlete/login`,
        },
      })

      if (signUpErr) {
        // Trigger error bubbles up with the "EMAIL_NOT_AUTHORIZED" prefix
        if (/EMAIL_NOT_AUTHORIZED/.test(signUpErr.message)) {
          throw new Error(
            'This email is not authorized. Please ask your practitioner to authorize it.'
          )
        }
        throw signUpErr
      }

      // 3. If email confirmation is on, show a notice.
      //    If off, we have a session and can go straight to the dashboard.
      if (data.session) {
        navigate('/athlete/dashboard', { replace: true })
      } else {
        setInfo(
          'Account created! Please check your email for a confirmation link, ' +
          'then come back here to sign in.'
        )
        setMode('signin')
      }
    } catch (err: any) {
      setError(humanize(err?.message))
    } finally {
      setLoading(false)
    }
  }

  // ── Reset password ──────────────────────────────────────────────────────
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

            {/* Brand header */}
            <div className="bg-gradient-to-r from-[#1A2D4A] to-[#0D7C8E] px-6 py-5">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={16} className="text-white/90" />
                <p className="text-xs font-semibold text-white/90 uppercase tracking-[0.1em]">
                  Athlete Portal
                </p>
              </div>
              <h1 className="text-xl font-black text-white">
                {mode === 'signin'      && 'Welcome back'}
                {mode === 'signup'      && 'Create your account'}
                {mode === 'reset'       && 'Reset your password'}
                {mode === 'reset_sent'  && 'Check your email'}
              </h1>
              <p className="text-sm text-white/75 mt-0.5">
                {mode === 'signin'      && 'Sign in to your performance portal'}
                {mode === 'signup'      && 'Use the email authorized by your practitioner'}
                {mode === 'reset'       && "We'll email you a reset link"}
                {mode === 'reset_sent'  && 'A reset link is on its way'}
              </p>
            </div>

            <div className="p-6">
              {/* Sign in/up tab toggle (only shown on signin & signup screens) */}
              {(mode === 'signin' || mode === 'signup') && (
                <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 mb-5">
                  <button
                    type="button"
                    onClick={() => { resetForm(); setMode('signin') }}
                    className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'signin'
                        ? 'bg-white text-[#1A2D4A] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetForm(); setMode('signup') }}
                    className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'signup'
                        ? 'bg-white text-[#1A2D4A] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              )}

              {/* Info banner (e.g. "Check your email to confirm") */}
              {info && (
                <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
                  <CheckCircle size={13} className="mt-0.5 shrink-0 text-blue-500" />
                  <span>{info}</span>
                </div>
              )}

              {/* ── SIGN IN ─────────────────────────────────────────────── */}
              {mode === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <EmailField value={email} onChange={setEmail} />

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">Password</label>
                      <button
                        type="button"
                        onClick={() => { resetForm(); setMode('reset') }}
                        className="text-xs font-medium text-[#0D7C8E] hover:underline"
                      >
                        Forgot?
                      </button>
                    </div>
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      show={showPw}
                      toggle={() => setShowPw(v => !v)}
                      autoComplete="current-password"
                    />
                  </div>

                  {error && <ErrorBanner error={error} />}

                  <SubmitButton
                    loading={loading}
                    disabled={!email || !password}
                    icon={<LogIn size={14} />}
                    loadingLabel="Signing in…"
                    label="Sign In"
                  />
                </form>
              )}

              {/* ── SIGN UP ─────────────────────────────────────────────── */}
              {mode === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Your first name <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="Your first name"
                      autoComplete="given-name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                    />
                  </div>

                  <EmailField
                    value={email}
                    onChange={setEmail}
                    label="Email authorized by your practitioner"
                  />

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      show={showPw}
                      toggle={() => setShowPw(v => !v)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Confirm password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                    />
                  </div>

                  {error && <ErrorBanner error={error} />}

                  <SubmitButton
                    loading={loading}
                    disabled={!email || !password || !confirmPassword}
                    icon={<UserPlus size={14} />}
                    loadingLabel="Creating account…"
                    label="Create account"
                  />

                  <p className="text-xs text-gray-400 text-center">
                    By continuing you agree to the WinMindPerform Terms of Service.
                    Your data is protected under DPDP Act 2023.
                  </p>
                </form>
              )}

              {/* ── RESET REQUEST ──────────────────────────────────────── */}
              {mode === 'reset' && (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <EmailField
                    value={email}
                    onChange={setEmail}
                    hint="Enter the email your practitioner authorized."
                  />

                  {error && <ErrorBanner error={error} />}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { resetForm(); setMode('signin') }}
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

              {/* ── RESET SENT ─────────────────────────────────────────── */}
              {mode === 'reset_sent' && (
                <div className="space-y-4 text-center py-2">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-green-500" />
                  </div>
                  <p className="text-sm text-gray-700">
                    If an account exists for <strong>{email}</strong>, a reset link is on its way.
                  </p>
                  <p className="text-xs text-gray-500">
                    Check your inbox and spam folder. The link expires in 1 hour.
                  </p>
                  <button
                    onClick={() => { resetForm(); setMode('signin') }}
                    className="text-sm font-medium text-[#0D7C8E] hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              )}
            </div>
          </div>

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

// ──────────────────────────────────────────────────────────────────────────
// Small helper components
// ──────────────────────────────────────────────────────────────────────────

function EmailField({
  value, onChange, label = 'Email', hint,
}: { value: string; onChange: (s: string) => void; label?: string; hint?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
        placeholder="athlete@email.com"
        autoComplete="email"
        required
      />
      {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
    </div>
  )
}

function PasswordField({
  value, onChange, show, toggle, placeholder = '••••••••',
  autoComplete = 'current-password',
}: {
  value: string
  onChange: (s: string) => void
  show: boolean
  toggle: () => void
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <AlertCircle size={13} className="mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  )
}

function SubmitButton({
  loading, disabled, icon, loadingLabel, label,
}: {
  loading: boolean
  disabled: boolean
  icon: React.ReactNode
  loadingLabel: string
  label: string
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full bg-[#0D7C8E] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#0a6a7a] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
    >
      {loading
        ? <><Loader2 size={14} className="animate-spin" /> {loadingLabel}</>
        : <>{icon} {label}</>
      }
    </button>
  )
}

function humanize(raw: string | undefined): string {
  if (!raw) return 'Something went wrong. Please try again.'
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials'))   return 'Incorrect email or password.'
  if (m.includes('email not confirmed'))         return 'Please confirm your email first. Check your inbox for the confirmation link.'
  if (m.includes('rate limit'))                  return 'Too many attempts — please wait a moment and try again.'
  if (m.includes('user not found'))              return 'No account found for that email.'
  if (m.includes('user already registered'))     return 'An account with this email already exists. Please sign in instead.'
  if (m.includes('password should be at least')) return 'Password must be at least 6 characters.'
  if (m.includes('email_not_authorized'))        return 'This email is not authorized. Please ask your practitioner to authorize it first.'
  return raw
}
