// src/pages/athlete/AcceptInvitePage.tsx
// Athlete opens invite link, sets password, gets portal access

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LogoBrand from '@/components/LogoBrand'

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const emailParam = searchParams.get('email') ?? ''

  const [step, setStep] = useState<'loading' | 'set-password' | 'done' | 'error'>('loading')
  const [invite, setInvite] = useState<any>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Validate token on mount
  useEffect(() => {
    if (!token) { setStep('error'); return }
    async function validateToken() {
      const { data, error } = await supabase
        .from('athlete_invites')
        .select('*, athlete:athletes(first_name, last_name, sport)')
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (error || !data) {
        setStep('error')
        return
      }
      setInvite(data)
      setStep('set-password')
    }
    validateToken()
  }, [token])

  async function handleAccept() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setError('')
    setSaving(true)

    try {
      // 1. Sign up with Supabase Auth (athlete role in metadata)
      const { data: auth, error: signUpErr } = await supabase.auth.signUp({
        email: emailParam || invite.email,
        password,
        options: {
          data: {
            role: 'athlete',
            athlete_id: invite.athlete_id,
            practitioner_id: invite.practitioner_id,
            first_name: invite.athlete?.first_name,
            last_name: invite.athlete?.last_name,
          },
        },
      })

      if (signUpErr) throw signUpErr
      if (!auth.user) throw new Error('Account creation failed')

      // 2. The DB trigger (handle_new_athlete) creates the athlete_profiles
      //    row server-side. No client-side insert needed.

      // 3. Mark invite as accepted
      await supabase.from('athlete_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)

      // 4. If session exists (email confirmation disabled), go to dashboard
      if (auth.session) {
        setStep('done')
        setTimeout(() => navigate('/athlete/dashboard', { replace: true }), 2000)
      } else {
        // Email confirmation required
        setStep('done')
      }

    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1A2D4A] to-[#1e3a5f] px-6 py-4">
        <LogoBrand size="md" variant="sidebar" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <p className="text-gray-500">Validating your invitation…</p>
            </div>
          )}

          {step === 'error' && (
            <div className="bg-white rounded-2xl border border-red-200 p-6 text-center space-y-3">
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h2 className="font-bold text-gray-900">Invite Invalid or Expired</h2>
              <p className="text-sm text-gray-500">
                This invite link is either invalid or has expired (invites expire after 48 hours).
                Please ask your practitioner to send a new invite.
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-white rounded-2xl border border-green-200 p-6 text-center space-y-3">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <h2 className="font-bold text-gray-900">Welcome to SPPS!</h2>
              <p className="text-sm text-gray-500">Your account is set up. Taking you to your dashboard…</p>
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {step === 'set-password' && invite && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Welcome header */}
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white text-center">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl">
                  🏆
                </div>
                <h1 className="text-xl font-black">You're invited!</h1>
                <p className="text-blue-200 text-sm mt-1">
                  {invite.athlete?.first_name}, your sport psychologist has set up your personal performance portal.
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Info */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                  <p><strong>Your portal gives you access to:</strong></p>
                  <ul className="mt-1 space-y-0.5 text-blue-600 text-xs">
                    <li>✓ Daily tasks and mental performance exercises</li>
                    <li>✓ Direct messaging with your practitioner</li>
                    <li>✓ AI mental performance assistant (24/7)</li>
                    <li>✓ Progress tracking and session schedule</li>
                  </ul>
                </div>

                {/* Email display */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                  <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-600">
                    {emailParam || invite.email}
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Create Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
                    />
                    <button onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
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
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle size={13} /> {error}
                  </div>
                )}

                <button onClick={handleAccept} disabled={saving || !password || !confirmPassword}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {saving
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Setting up your account…</>
                    : <><CheckCircle size={16} /> Create Account & Enter Portal</>
                  }
                </button>

                <p className="text-xs text-gray-400 text-center">
                  By continuing you agree to SPPS Terms of Service. Your data is protected under DPDP Act 2023.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
