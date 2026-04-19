import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Target, AlertCircle, MailCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import LogoBrand from '@/components/LogoBrand'

export default function AthleteSignupPage() {
  const { signUpAthlete, authError, clearError } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    email:       '',
    password:    '',
    first_name:  '',
    last_name:   '',
    sport:       '',
  })
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  function set<K extends keyof typeof form>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      const result = await signUpAthlete(form.email, form.password, {
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        sport:      form.sport.trim(),
      })
      if (result.confirmEmail) {
        setConfirmEmail(true)
      } else {
        navigate('/athlete/dashboard', { replace: true })
      }
    } catch {
      // authError
    } finally {
      setLoading(false)
    }
  }

  // ── Email confirmation sent ──────────────────────────────────────────
  if (confirmEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
          <LogoBrand size="md" variant="full" />
          <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto my-6">
            <MailCheck className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Confirm your email</h1>
          <p className="text-sm text-gray-600 mb-2">
            A confirmation link has been sent to
          </p>
          <p className="font-semibold text-gray-900 mb-6">{form.email}</p>
          <p className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
            Click the link in the email, then come back here to sign in.
            If you don't see it, check your spam folder.
          </p>
          <Link
            to="/athlete/login"
            className="inline-block text-teal-600 hover:underline text-sm font-medium"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-6 py-12">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full">
        <div className="flex items-center gap-2 mb-2">
          <LogoBrand size="sm" variant="full" />
        </div>
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
          <Target size={12} /> Athlete portal
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Create your account</h1>
        <p className="text-sm text-gray-500 mb-6">
          Once your account is active, your practitioner can link to you by your email.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authError && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">First name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={set('first_name')}
                required
                autoFocus
                autoComplete="given-name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Last name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={set('last_name')}
                required
                autoComplete="family-name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Sport <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.sport}
              onChange={set('sport')}
              placeholder="e.g. Archery, Football, Athletics"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
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
            disabled={loading || !form.email || !form.password || !form.first_name}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-xs text-gray-500">
            By creating an account you agree to our terms and acknowledge the privacy policy.
          </p>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/athlete/login" className="text-teal-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
          Are you a practitioner?{' '}
          <Link to="/auth/signup" className="text-blue-600 hover:underline">
            Use the practitioner portal
          </Link>
        </div>
      </div>
    </div>
  )
}
