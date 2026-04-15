// src/components/layout/AppShell.tsx
import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, Activity, ClipboardList,
  Lightbulb, Bot, FileText, Settings, LogOut, Menu, Brain, Heart, Globe, Shield, FlaskConical,
  MessageCircle, X, Star, Send, CheckCircle, Layers,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/contexts/LanguageContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/utils'
import { LANGUAGES } from '@/lib/translations'
import LogoBrand from '@/components/LogoBrand'
import ThemePanel from '@/components/ThemePanel'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { practitioner, signOut } = useAuth()
  const { t, lang, setLang, langMeta } = useLanguage()
  const { base, currentAccent } = useTheme()
  const navigate = useNavigate()

  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)

  const isDark = base === 'dark'

  const NAV_ITEMS = [
    { label: t.nav_dashboard,         href: '/dashboard',          Icon: LayoutDashboard },
    { label: t.nav_athletes,          href: '/athletes',            Icon: Users },
    { label: t.nav_sessions,          href: '/sessions',            Icon: Calendar },
    { label: t.nav_checkins,          href: '/checkins',            Icon: Activity },
    { label: t.nav_assessments,       href: '/assessments',         Icon: ClipboardList },
    { label: t.nav_mentalHealth,      href: '/assessments/ioc',     Icon: Heart },
    { label: t.nav_psychophysiology,  href: '/assessments/physio',  Icon: Activity },
    { label: t.nav_neurocognitive,    href: '/assessments/neuro',   Icon: Brain },
    { label: t.nav_interventions,     href: '/interventions',       Icon: Lightbulb },
    { label: 'Athlete Programs',       href: '/programs',           Icon: Layers },
    { label: 'Athlete Messages',       href: '/conversations',      Icon: MessageCircle },
    { label: 'Athlete Chat',          href: '/chat',                Icon: MessageCircle },
    { label: 'Consent Forms',          href: '/consent',             Icon: Shield },
    { label: 'Injury Psychology',      href: '/injury',              Icon: Activity },
    { label: 'Mental Performance Lab', href: '/lab',                Icon: FlaskConical },
    { label: t.nav_aiAssistant,        href: '/ai-assistant',        Icon: Bot },
    { label: t.nav_reports,           href: '/reports',             Icon: FileText },
    { label: t.nav_settings,          href: '/settings',            Icon: Settings },
  ]

  const indianLangs = LANGUAGES.filter(l => l.group === 'indian')
  const intlLangs   = LANGUAGES.filter(l => l.group === 'international')

  async function handleSignOut() {
    await signOut()
    navigate('/auth/login')
  }

  const sidebar = (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Logo */}
      <div className="px-4 py-4 border-b shrink-0"
        style={{ borderColor: isDark ? `${currentAccent.color}20` : 'rgba(255,255,255,0.1)' }}>
        <LogoBrand size="md" variant="sidebar" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map(({ label, href, Icon }) => (
          <NavLink
            key={href}
            to={href}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm transition-all duration-150',
              isActive ? 'font-semibold' : '',
            )}
            style={({ isActive }) => isActive
              ? { background: currentAccent.colorDim, color: currentAccent.color }
              : { color: isDark ? '#a0a0c0' : 'rgba(200,214,229,0.85)' }
            }
          >
            <Icon size={16} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Language switcher */}
      <div className="px-3 pb-1 relative shrink-0">
        <button
          onClick={() => setLangMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all"
          style={{ color: isDark ? '#a0a0c0' : 'rgba(200,214,229,0.85)' }}
        >
          <Globe size={16} />
          <span className="flex-1 text-left truncate">{langMeta.flag} {langMeta.nativeName}</span>
          <span className="text-xs opacity-50 uppercase">{lang}</span>
        </button>

        {langMenuOpen && (
          <div
            className="absolute bottom-full left-2 right-2 mb-1 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto"
            style={{
              background: isDark ? '#13131E' : '#fff',
              border: isDark ? `1px solid ${currentAccent.color}30` : '1px solid #e5e7eb',
            }}
          >
            <div className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                style={{ color: isDark ? '#5c5c78' : '#9ca3af' }}>
                {t.set_indian}
              </p>
              <div className="grid grid-cols-2 gap-0.5">
                {indianLangs.map(l => (
                  <button key={l.code}
                    onClick={() => { setLang(l.code); setLangMenuOpen(false) }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition-all"
                    style={{
                      background: lang === l.code ? currentAccent.colorDim : 'transparent',
                      color: lang === l.code ? currentAccent.color : isDark ? '#a0a0b8' : '#374151',
                      fontWeight: lang === l.code ? 700 : 400,
                    }}
                  >
                    <span>{l.flag}</span>
                    <span className="truncate">{l.nativeName}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t p-3" style={{ borderColor: isDark ? '#23233A' : '#e5e7eb' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                style={{ color: isDark ? '#5c5c78' : '#9ca3af' }}>
                {t.set_international}
              </p>
              <div className="grid grid-cols-2 gap-0.5">
                {intlLangs.map(l => (
                  <button key={l.code}
                    onClick={() => { setLang(l.code); setLangMenuOpen(false) }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition-all"
                    style={{
                      background: lang === l.code ? currentAccent.colorDim : 'transparent',
                      color: lang === l.code ? currentAccent.color : isDark ? '#a0a0b8' : '#374151',
                      fontWeight: lang === l.code ? 700 : 400,
                    }}
                  >
                    <span>{l.flag}</span>
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User footer */}
      {practitioner && (
        <div className="px-4 py-4 border-t shrink-0"
          style={{ borderColor: isDark ? `${currentAccent.color}20` : 'rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-3">
            <Avatar
              firstName={practitioner.first_name}
              lastName={practitioner.last_name}
              src={practitioner.avatar_url}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {practitioner.first_name} {practitioner.last_name}
              </p>
              <p className="text-xs truncate capitalize"
                style={{ color: currentAccent.color, opacity: 0.9 }}>
                {practitioner.role.replace(/_/g, ' ')}
              </p>
            </div>
            <button onClick={handleSignOut} title={t.signOut}
              className="p-1.5 rounded-lg transition-all hover:opacity-70"
              style={{ color: isDark ? '#5c5c78' : 'rgba(200,214,229,0.6)' }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const sidebarBg = isDark
    ? 'linear-gradient(160deg,#090912 0%,#06060E 100%)'
    : 'linear-gradient(160deg,#1A2D4A 0%,#0D1F35 100%)'

  return (
    <div className="flex h-screen overflow-hidden"
      style={{ background: 'var(--t-bg, #F5F5F7)' }}>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0"
        style={{ background: sidebarBg }}>
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64"
            style={{ background: sidebarBg }}>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{ background: 'var(--t-card, #fff)', borderColor: 'var(--t-border, #e5e7eb)' }}>
          <button onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--t-text, #111)' }}>
            <Menu size={20} />
          </button>
          <LogoBrand size="sm" variant="sidebar" />
        </header>

        <main className="main-content flex-1 overflow-y-auto"
          style={{ background: 'var(--t-bg, #F5F5F7)' }}>
          <div className="p-6 max-w-7xl mx-auto"
            style={{ color: 'var(--t-text, #111827)' }}>
            {children}
          </div>
        </main>
      </div>

      {/* Floating theme switcher */}
      <ThemePanel />

      {/* Floating feedback button */}
      <FeedbackButton practitioner={practitioner} />
    </div>
  )
}

// ── Floating Feedback Widget ──────────────────────────────────────────────────

const FEEDBACK_CATEGORIES = [
  { value: 'bug',        label: 'Bug Report',        emoji: '🐛' },
  { value: 'feature',    label: 'Feature Request',   emoji: '💡' },
  { value: 'usability',  label: 'Usability Issue',   emoji: '🧭' },
  { value: 'praise',     label: 'Something I Like',  emoji: '❤️' },
  { value: 'other',      label: 'Other Feedback',    emoji: '💬' },
]

function FeedbackButton({ practitioner }: { practitioner: any }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  function reset() {
    setCategory('')
    setRating(0)
    setHoverRating(0)
    setMessage('')
    setPage('')
    setSent(false)
  }

  async function handleSubmit() {
    if (!message.trim()) return
    setSending(true)
    try {
      await supabase.from('feedback').insert({
        practitioner_id: practitioner?.id ?? null,
        practitioner_email: practitioner?.email ?? 'anonymous',
        category: category || 'other',
        rating,
        message: message.trim(),
        page_context: page || window.location.pathname,
        user_agent: navigator.userAgent,
      })
      setSent(true)
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 2000)
    } catch (err) {
      console.error('[SPPS Feedback] Failed:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating button — bottom-right, above ThemePanel */}
      <button
        onClick={() => { setOpen(true); setPage(window.location.pathname) }}
        className="fixed bottom-20 right-5 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        title="Send Feedback"
      >
        <MessageCircle size={20} className="text-white" />
      </button>

      {/* Feedback modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setOpen(false); reset() }} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Share Feedback</h2>
                <p className="text-xs text-gray-400 mt-0.5">Help us improve WinMindPerform SPPS</p>
              </div>
              <button onClick={() => { setOpen(false); reset() }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col items-center py-10 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <CheckCircle size={28} className="text-green-500" />
                </div>
                <p className="text-lg font-bold text-gray-900">Thank you!</p>
                <p className="text-sm text-gray-500 mt-1">Your feedback helps shape the future of SPPS.</p>
              </div>
            ) : (
              <div className="px-5 pb-5 space-y-4">
                {/* Category pills */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What's this about?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_CATEGORIES.map(c => (
                      <button key={c.value}
                        onClick={() => setCategory(c.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                          category === c.value
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-100 text-gray-600 hover:border-gray-200'
                        }`}
                      >
                        <span>{c.emoji}</span> {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Star rating */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overall experience</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s}
                        onClick={() => setRating(s)}
                        onMouseEnter={() => setHoverRating(s)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star size={24}
                          fill={(hoverRating || rating) >= s ? '#f59e0b' : 'none'}
                          stroke={(hoverRating || rating) >= s ? '#f59e0b' : '#d1d5db'}
                          strokeWidth={1.5}
                        />
                      </button>
                    ))}
                    {rating > 0 && (
                      <span className="ml-2 text-xs text-gray-400 self-center">
                        {['', 'Needs work', 'Below average', 'Good', 'Very good', 'Excellent'][rating]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your feedback *</p>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    placeholder="What's working well? What could be better? Any feature you'd love to see?"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>

                {/* Current page context */}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Page:</span>
                  <code className="bg-gray-50 px-2 py-0.5 rounded text-gray-500">{page || window.location.pathname}</code>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!message.trim() || sending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  {sending ? 'Sending…' : <><Send size={14} /> Submit Feedback</>}
                </button>

                <p className="text-center text-xs text-gray-300">
                  Feedback is stored securely and only visible to the SPPS team.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
