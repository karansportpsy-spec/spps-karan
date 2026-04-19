import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, MailCheck, UserCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Input, Alert } from '@/components/ui'
import LogoBrand from '@/components/LogoBrand'

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-96 bg-gradient-spps p-10 shrink-0">
        <LogoBrand size="md" variant="sidebar" />
        <div>
          <p className="text-blue-100 text-sm mb-2">Sport Psychology Practitioner Suite</p>
          <p className="text-white/60 text-xs">HIPAA-compliant · Secure · Purpose-built</p>
        </div>
      </div>
      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <LogoBrand size="md" variant="full" />
          </div>
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
            <UserCheck size={12} /> Practitioner portal
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
          <p className="text-sm text-gray-500 mb-8">{subtitle}</p>
          {children}
          <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
            Are you an athlete?{' '}
            <Link to="/athlete/login" className="text-blue-600 hover:underline">
              Use the athlete portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { signIn, authError, clearError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      await signIn(email, password)
      // router guards will redirect athlete/practitioner to the right place
      navigate(from, { replace: true })
    } catch {
      // error displayed via authError
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your SPPS practitioner account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {authError && <Alert type="error" message={authError} />}
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-gray-400">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full mt-2" loading={loading}>Sign In</Button>
        <p className="text-center text-sm text-gray-500">
          No practitioner account?{' '}
          <Link to="/auth/signup" className="text-blue-600 hover:underline font-medium">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  const { signUpPractitioner, authError, clearError } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      const result = await signUpPractitioner(form.email, form.password, {
        first_name: form.first_name,
        last_name:  form.last_name,
      })
      if (result.confirmEmail) {
        setConfirmEmail(true)
      } else {
        // Phase 2 minimal routing: land on dashboard. Compliance flow
        // can re-activate in a future phase.
        navigate('/dashboard', { replace: true })
      }
    } catch {
      // authError has the message
    } finally {
      setLoading(false)
    }
  }

  if (confirmEmail) {
    return (
      <AuthLayout title="Check your email" subtitle="We've sent a confirmation link">
        <div className="flex flex-col items-center text-center gap-4 py-6">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-gray-700 mb-1">A confirmation link has been sent to</p>
            <p className="font-semibold text-gray-900">{form.email}</p>
          </div>
          <p className="text-sm text-gray-500 max-w-sm">
            Click the link in the email to activate your account, then come back here to sign in.
            If you don't see it, check your spam folder.
          </p>
          <Link to="/auth/login" className="text-blue-600 hover:underline text-sm font-medium">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create a practitioner account" subtitle="You'll be able to link athletes after signup">
      <form onSubmit={handleSubmit} className="space-y-4">
        {authError && <Alert type="error" message={authError} />}
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" value={form.first_name} onChange={set('first_name')} required autoFocus />
          <Input label="Last name"  value={form.last_name}  onChange={set('last_name')}  required />
        </div>
        <Input
          label="Email address"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="you@example.com"
          required
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder="At least 8 characters"
              minLength={8}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-2.5 text-gray-400">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full mt-2" loading={loading}>Create account</Button>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
