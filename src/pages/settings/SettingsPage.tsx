import { useState, useEffect } from 'react'
import { CheckCircle, Shield, Bell } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { PageHeader, Card, Button, Input, Alert } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

type Tab = 'profile' | 'security' | 'notifications' | 'compliance'

export default function SettingsPage() {
  const { practitioner, refreshProfile } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Sync profile state whenever practitioner data arrives/changes
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    bio: '',
  })

  const [notifications, setNotifications] = useState({
    notification_email: true,
    notification_sms: false,
  })

  useEffect(() => {
    if (practitioner) {
      setProfile({
        first_name: practitioner.first_name ?? '',
        last_name:  practitioner.last_name  ?? '',
        phone:      practitioner.phone      ?? '',
        bio:        practitioner.bio        ?? '',
      })
      setNotifications({
        notification_email: practitioner.notification_email ?? true,
        notification_sms:   practitioner.notification_sms   ?? false,
      })
    }
  }, [practitioner])

  const [passwords, setPasswords] = useState({ next: '', confirm: '' })

  function clearFeedback() { setSuccess(''); setError('') }

  async function saveProfile() {
    if (!practitioner) return
    setSaving(true); clearFeedback()
    const { error: err } = await supabase.from('practitioners').update(profile).eq('id', practitioner.id)
    if (err) setError(err.message)
    else { await refreshProfile(); setSuccess('Profile updated successfully.') }
    setSaving(false)
  }

  async function saveNotifications() {
    if (!practitioner) return
    setSaving(true); clearFeedback()
    const { error: err } = await supabase.from('practitioners').update(notifications).eq('id', practitioner.id)
    if (err) setError(err.message)
    else { await refreshProfile(); setSuccess('Notification preferences saved.') }
    setSaving(false)
  }

  async function changePassword() {
    if (passwords.next !== passwords.confirm) { setError('Passwords do not match'); return }
    if (passwords.next.length < 6) { setError('Password must be at least 6 characters'); return }
    setSaving(true); clearFeedback()
    const { error: err } = await supabase.auth.updateUser({ password: passwords.next })
    if (err) setError(err.message)
    else { setSuccess('Password updated.'); setPasswords({ next: '', confirm: '' }) }
    setSaving(false)
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'profile',       label: 'Profile' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'security',      label: 'Security' },
    { key: 'compliance',    label: 'Compliance' },
  ]

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); clearFeedback() }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}
      {error   && <div className="mb-4"><Alert type="error"   message={error}   /></div>}

      {/* ── Profile ── */}
      {tab === 'profile' && (
        <Card className="p-6 max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" value={profile.first_name}
                onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} />
              <Input label="Last name"  value={profile.last_name}
                onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} />
            </div>
            <Input label="Email address" value={practitioner?.email ?? ''} disabled
              hint="Email cannot be changed here." />
            <Input label="Phone" value={profile.phone}
              onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
              placeholder="+1 555 000 0000" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Bio</label>
              <textarea value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                rows={3} placeholder="Brief professional bio…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="pt-2">
              <Button onClick={saveProfile} loading={saving}>Save Changes</Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Notifications ── */}
      {tab === 'notifications' && (
        <Card className="p-6 max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-1">Notification Preferences</h2>
          <p className="text-sm text-gray-500 mb-5">Choose how you'd like to receive alerts and reminders.</p>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg">
              <div className="mt-0.5 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Bell size={16} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Email notifications</p>
                <p className="text-xs text-gray-400 mt-0.5">Session reminders, check-in alerts, and risk flag summaries</p>
              </div>
              <input type="checkbox" checked={notifications.notification_email}
                onChange={e => setNotifications(n => ({ ...n, notification_email: e.target.checked }))}
                className="mt-1 w-4 h-4 rounded border-gray-300 accent-blue-600" />
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg">
              <div className="mt-0.5 w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                <Bell size={16} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">SMS notifications</p>
                <p className="text-xs text-gray-400 mt-0.5">Critical risk alerts and urgent session reminders via text</p>
              </div>
              <input type="checkbox" checked={notifications.notification_sms}
                onChange={e => setNotifications(n => ({ ...n, notification_sms: e.target.checked }))}
                className="mt-1 w-4 h-4 rounded border-gray-300 accent-blue-600" />
            </label>

            <div className="pt-2">
              <Button onClick={saveNotifications} loading={saving}>Save Preferences</Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Security ── */}
      {tab === 'security' && (
        <Card className="p-6 max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Change Password</h2>
          <div className="space-y-4">
            <Input label="New password" type="password" value={passwords.next}
              onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
              placeholder="Min. 6 characters" />
            <Input label="Confirm new password" type="password" value={passwords.confirm}
              onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
              placeholder="Repeat new password" />
            <div className="pt-2">
              <Button onClick={changePassword} loading={saving} disabled={!passwords.next}>
                Update Password
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Compliance ── */}
      {tab === 'compliance' && (
        <Card className="p-6 max-w-lg">
          <h2 className="font-semibold text-gray-900 mb-4">Compliance Status</h2>
          <div className="space-y-3">
            {[
              { label: 'HIPAA Acknowledgement', done: practitioner?.hipaa_acknowledged },
              { label: 'User Agreement',         done: practitioner?.compliance_completed },
              { label: 'Terms of Service',       done: practitioner?.compliance_completed },
              { label: 'Data Privacy Policy',    done: practitioner?.compliance_completed },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" />
                  <span className="text-sm text-gray-700">{label}</span>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${done ? 'text-emerald-600' : 'text-amber-500'}`}>
                  <CheckCircle size={15} />
                  {done ? 'Completed' : 'Pending'}
                </div>
              </div>
            ))}
          </div>
          {!practitioner?.compliance_completed && (
            <div className="mt-4">
              <Button variant="secondary" onClick={() => window.location.href = '/compliance/hipaa'}>
                Complete Compliance Setup
              </Button>
            </div>
          )}
        </Card>
      )}
    </AppShell>
  )
}
