// src/pages/athletes/AcceptInvitePage.tsx
// Athlete opens invite link → sets password → portal activates.
// The handle_new_athlete DB trigger creates the athlete_profiles row
// automatically (see supabase/migrations/20260417000000_athlete_invite_email.sql).

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, Eye, EyeOff, Loader2, AlertCircle, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

type Step = 'loading' | 'set-password' | 'done' | 'done-confirm-email' | 'error'

interface InviteData {
  id:              string
  token:           string
  email:           string
  practitioner_id: string
  athlete_id:      string
  expires_at:      string
  athlete?: {
    first_name: string
    last_name:  string
    sport:      string
  } | null
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const token          = searchParams.get('token') ?? ''
  const emailParam     = searchParams.get('email') ?? ''

  const [step,            setStep]            = useState<Step>('loading')
  const [invite,          setInvite]          = useState<InviteData | null>(null)
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw,          setShowPw]          = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')
  const [errorDetail,     setErrorDetail]     = useState('')

  // ── Validate the token on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStep('error')
      setError('Invite link is missing its token.')
      return
    }

    let cancelled = false
    async function validateToken() {
      try {
        const { data, error: qErr } = await supabase
          .from('athlete_invites')
          .select('id, token, email, practitioner_id, athlete_id, expires_at, athlete:athletes(first_name, last_name, sport)')
          .eq('token', token)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (cancelled) return

        if (qErr) {
          setError('Could not validate invite.')
          setErrorDetail(qErr.message)
          setStep('error')
          return
        }
        if (!data) {
          setError('This invite link is invalid, already used, or expired.')
          setErrorDetail('Invites expire 48 hours after they are sent.')
          setStep('error')
          return
        }
        setInvite(data as unknown as InviteData)
        setStep('set-password')
      } catch (e: any) {
        if (cancelled) return
        setError('Could not load invite.')
        setErrorDetail(e?.message ?? '')
        setStep('error')
      }
    }
    validateToken()
    return () => { cancelled = true }
  }, [token])

  // ── Accept invite → sign up as athlete ────────────────────────────────────
  async function handleAccept() {
    if (password.length < 8)             { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword)    { setError('Passwords do not match.');                  return }
    if (!invite)                          return

    setError('')
    setErrorDetail('')
    setSaving(true)

    try {
      // Sign up with role='athlete' metadata — the handle_new_athlete trigger
      // will create athlete_profiles automatically.
      const signupEmail = (emailParam || invite.email).trim().toLowerCase()
      const { data: auth, error: signUpErr } = await supabase.auth.signUp({
        email:    signupEmail,
        password,
        options: {
          data: {
            role:            'athlete',
            athlete_id:      invite.athlete_id,
            practitioner_id: invite.practitioner_id,
            first_name:      invite.athlete?.first_name ?? '',
            last_name:       invite.athlete?.last_name  ?? '',
          },
          emailRedirectTo: `${window.location.origin}/athlete/login`,
        },
      })

      if (signUpErr) {
        // Common case: account already exists → try sign-in instead
        if (/already registered|already exists/i.test(signUpErr.message)) {
          const { error: sinErr } = await supabase.auth.signInWithPassword({
            email:    signupEmail,
            password,
          })
          if (sinErr) throw new Error(
            'An account already exists for this email but the password doesn\'t match. ' +
            'Use "Forgot password" on the athlete sign-in page to reset it.'
          )
        } else {
          throw signUpErr
        }
      }

      if (!auth?.user && !signUpErr) {
        throw new Error('Account creation failed. Please try again.')
      }

      // Mark the invite as accepted (RLS allows this update by token)
      await supabase.from('athlete_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)

      if (auth?.session) {
        // Email confirmation disabled → we have a session → go to dashboard
        setStep('done')
        setTimeout(() => navigate('/athlete/dashboard', { replace: true }), 1500)
      } else {
        // Email confirmation required → show "check your email" state
        setStep('done-confirm-email')
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#0D7C8E] px-6 py-4">
        <LogoBrand size="md" variant="sidebar" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">

          {/* ── Loading ─────────────────────────────────────────────────── */}
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 size={32} className="text-[#0D7C8E] animate-spin" />
              <p className="text-gray-500">Validating your invitation…</p>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="bg-white rounded-2xl border border-red-200 p-6 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg">Invite Invalid or Expired</h2>
              <p className="text-sm text-gray-500">{error}</p>
              {errorDetail && (
                <p className="text-xs text-gray-400 font-mono break-words">{errorDetail}</p>
              )}
              <p className="text-sm text-gray-500">
                Please ask your practitioner to send a new invite.
              </p>
              <Link
                to="/athlete/login"
                className="inline-block mt-2 text-sm font-medium text-[#0D7C8E] hover:underline"
              >
                Already have an account? Sign in →
              </Link>
            </div>
          )}

          {/* ── Done (session created) ──────────────────────────────────── */}
          {step === 'done' && (
            <div className="bg-white rounded-2xl border border-green-200 p-6 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg">Welcome to WinMindPerform!</h2>
              <p className="text-sm text-gray-500">Your portal is ready. Taking you there now…</p>
              <div className="w-6 h-6 border-2 border-[#0D7C8E] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {/* ── Done (awaiting email confirmation) ──────────────────────── */}
          {step === 'done-confirm-email' && (
            <div className="bg-white rounded-2xl border border-blue-200 p-6 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
                <Mail size={28} className="text-blue-500" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg">One last step</h2>
              <p className="text-sm text-gray-500">
                Please check your email and click the confirmation link to activate your account.
                After that, you'll be able to sign in with the password you just set.
              </p>
              <Link
                to="/athlete/login"
                className="inline-block mt-2 px-4 py-2 bg-[#0D7C8E] text-white rounded-xl text-sm font-semibold hover:bg-[#0a6a7a]"
              >
                Go to sign in
              </Link>
            </div>
          )}

          {/* ── Set password form ───────────────────────────────────────── */}
          {step === 'set-password' && invite && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-br from-[#1A2D4A] to-[#0D7C8E] p-6 text-white text-center">
                <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl">
                  🏆
                </div>
                <h1 className="text-xl font-black">You're invited!</h1>
                <p className="text-white/80 text-sm mt-1">
                  {invite.athlete?.first_name}, your sport psychologist has set up your performance portal.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800">
                  <p className="font-semibold mb-1">Your portal gives you access to:</p>
                  <ul className="space-y-0.5 text-blue-700 text-xs">
                    <li>✓ Daily tasks and mental performance exercises</li>
                    <li>✓ Direct messaging with your practitioner</li>
                    <li>✓ AI mental performance assistant (24/7)</li>
                    <li>✓ Progress tracking and session schedule</li>
                  </ul>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                  <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
                    {emailParam || invite.email}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Create Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E] pr-10"
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

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7C8E]"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleAccept}
                  disabled={saving || !password || !confirmPassword}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#0D7C8E] hover:bg-[#0a6a7a] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
                >
                  {saving
                    ? <><Loader2 size={16} className="animate-spin" /> Setting up your account…</>
                    : <><CheckCircle size={16} /> Create Account &amp; Enter Portal</>
                  }
                </button>

                <p className="text-xs text-gray-400 text-center">
                  By continuing you agree to the WinMindPerform Terms of Service.
                  Your data is protected under DPDP Act 2023.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
