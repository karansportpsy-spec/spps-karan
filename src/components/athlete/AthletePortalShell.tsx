// src/components/athlete/AthletePortalShell.tsx
//
// Lightweight layout for the athlete portal. Teal-themed, mobile-first,
// with bottom nav on small screens and sidebar nav on desktop.
//
// Usage: wrap any athlete page:
//   <AthletePortalShell>{children}</AthletePortalShell>

import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, MessageCircle, BookOpen, ClipboardList, UserCircle,
  LogOut, Bell, Target, Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePortal } from '@/contexts/PortalContext'
import LogoBrand from '@/components/LogoBrand'

interface NavItem {
  label:    string
  href:     string
  Icon:     React.ElementType
  badge?:   number
}

export default function AthletePortalShell({ children }: { children: ReactNode }) {
  const { signOut, athlete } = useAuth()
  const { totalUnread, unreadMessages, unreadNotifications } = usePortal()
  const navigate = useNavigate()

  const navItems: NavItem[] = [
    { label: 'Home',          href: '/athlete/dashboard',   Icon: Home },
    { label: 'Practitioners', href: '/athlete/practitioners', Icon: Users },
    { label: 'Messages',      href: '/athlete/messages',    Icon: MessageCircle, badge: unreadMessages },
    { label: 'Daily Log',     href: '/athlete/daily-log',   Icon: BookOpen },
    { label: 'Programs',      href: '/athlete/programs',    Icon: ClipboardList },
  ]

  async function handleSignOut() {
    await signOut()
    navigate('/athlete/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* ── Header (sticky) ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-teal-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoBrand size="sm" variant="full" />
            <div className="hidden sm:flex items-center gap-1.5 bg-teal-50 text-teal-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
              <Target size={11} /> Athlete
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button
              className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Notifications"
              title={unreadNotifications > 0 ? `${unreadNotifications} unread` : 'Notifications'}
            >
              <Bell size={18} className="text-gray-600" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>

            {/* Avatar + name */}
            {athlete && (
              <div className="hidden sm:flex items-center gap-2 px-2 py-1">
                <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                  {(athlete.first_name?.[0] ?? '').toUpperCase()}
                  {(athlete.last_name?.[0]  ?? '').toUpperCase()}
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-gray-800 leading-tight">
                    {athlete.first_name} {athlete.last_name}
                  </p>
                  {athlete.uid_code && (
                    <p className="text-gray-400 leading-tight">{athlete.uid_code}</p>
                  )}
                </div>
              </div>
            )}

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: desktop sidebar + content ───────────────────────────── */}
      <div className="max-w-6xl mx-auto flex">
        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:block w-56 shrink-0 py-6 pl-4 pr-2">
          <nav className="space-y-1">
            {navItems.map(({ label, href, Icon, badge }) => (
              <NavLink
                key={href}
                to={href}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white hover:text-teal-700'
                  }`
                }
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="min-w-[18px] h-4 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Secondary links */}
          <div className="mt-6 pt-6 border-t border-teal-100 space-y-1">
            <NavLink
              to="/athlete/journal"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'bg-teal-100 text-teal-800' : 'text-gray-600 hover:bg-white hover:text-teal-700'
                }`
              }
            >
              <BookOpen size={14} /> Journal
            </NavLink>
            <NavLink
              to="/athlete/competitions"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'bg-teal-100 text-teal-800' : 'text-gray-600 hover:bg-white hover:text-teal-700'
                }`
              }
            >
              <Target size={14} /> Competitions
            </NavLink>
            <NavLink
              to="/athlete/requests"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'bg-teal-100 text-teal-800' : 'text-gray-600 hover:bg-white hover:text-teal-700'
                }`
              }
            >
              <ClipboardList size={14} /> Requests
            </NavLink>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 px-4 lg:px-6 py-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* ── Bottom nav (mobile only) ──────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-teal-100 z-30">
        <div className="max-w-6xl mx-auto grid grid-cols-5">
          {navItems.map(({ label, href, Icon, badge }) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium relative ${
                  isActive ? 'text-teal-600' : 'text-gray-500'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute top-1 right-[calc(50%-16px)] min-w-[14px] h-3.5 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Profile icon (mobile, top-right replacement would go here if needed) */}
      <div className="hidden">
        <UserCircle size={0} />
      </div>
    </div>
  )
}
