// src/components/layout/AppShell.tsx
import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, Activity, ClipboardList,
  Lightbulb, Bot, FileText, Settings, LogOut, Menu, Brain, Heart, Globe, Shield, FlaskConical,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
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
    </div>
  )
}
