import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Shield } from 'lucide-react'

import { loginAthletePortal } from '@/services/athletePortalApi'
import { getAthleteAccessToken } from '@/lib/apiClient'

export default function AthleteLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (getAthleteAccessToken()) {
      navigate('/athlete/portal', { replace: true })
    }
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await loginAthletePortal(email.trim(), password)
      navigate('/athlete/portal', { replace: true })
    } catch (err: any) {
      setError(err?.message ?? 'Athlete login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-blue-600" />
          <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Athlete Portal</p>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Athlete Sign In</h1>
        <p className="text-sm text-gray-500 mt-1">
          Login is available only after practitioner portal activation.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="athlete@email.com"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <LogIn size={14} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
