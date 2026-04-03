// src/components/ThemePanel.tsx
// Premium floating theme switcher — slide-in panel from right
// Dark/Light toggle + 6 neon accent swatches

import { useState } from 'react'
import { Sun, Moon, Palette, X, Check } from 'lucide-react'
import { useTheme, type AccentDef } from '@/contexts/ThemeContext'

// ── Swatch component ──────────────────────────────────────────────────────────

function Swatch({ accent, active, isDark, onClick }: {
  accent: AccentDef
  active: boolean
  isDark: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={accent.label}
      className="relative flex flex-col items-center gap-1.5 group transition-all"
    >
      <div
        className="w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center"
        style={{
          background: accent.color,
          boxShadow: active
            ? isDark
              ? `0 0 0 2px ${accent.color}, 0 0 16px ${accent.colorGlow}, 0 0 32px ${accent.colorGlow}`
              : `0 0 0 2px ${accent.color}, 0 0 8px ${accent.colorDim}`
            : isDark
              ? `0 0 8px ${accent.colorDim}`
              : 'none',
          transform: active ? 'scale(1.12)' : 'scale(1)',
          border: active ? `2px solid ${accent.color}` : '2px solid transparent',
        }}
      >
        {active && (
          <Check size={16} color={accent.textColor} strokeWidth={3} />
        )}
      </div>
      <span
        className="text-xs font-medium leading-tight text-center"
        style={{
          color: active
            ? accent.color
            : isDark ? 'rgba(160,160,200,0.8)' : '#6b7280',
          textShadow: active && isDark ? `0 0 8px ${accent.colorGlow}` : 'none',
        }}
      >
        {accent.label.replace('Neon ', '')}
      </span>
    </button>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function ThemePanel() {
  const { base, accent, accents, currentAccent, setBase, setAccent } = useTheme()
  const [open, setOpen] = useState(false)
  const isDark = base === 'dark'

  return (
    <>
      {/* ── Trigger button (always visible, bottom-right) ──────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch Theme"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95"
        style={{
          background: currentAccent.color,
          color: currentAccent.textColor,
          boxShadow: isDark
            ? `0 0 0 2px ${currentAccent.color}40, 0 0 20px ${currentAccent.colorGlow}, 0 4px 16px rgba(0,0,0,0.6)`
            : `0 4px 16px ${currentAccent.colorDim}, 0 2px 8px rgba(0,0,0,0.15)`,
        }}
      >
        {open ? <X size={20} /> : <Palette size={20} />}
      </button>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-20 right-6 z-40 w-72 rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          background: isDark ? '#13131E' : '#ffffff',
          border: isDark ? `1px solid ${currentAccent.color}30` : '1px solid #e5e7eb',
          boxShadow: isDark
            ? `0 0 0 1px ${currentAccent.color}20, 0 20px 60px rgba(0,0,0,0.8), 0 0 40px ${currentAccent.colorGlow}`
            : '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: isDark ? '#0F0F1A' : '#f8f8fc',
            borderBottom: isDark ? `1px solid ${currentAccent.color}20` : '1px solid #e5e7eb',
          }}
        >
          <div className="flex items-center gap-2">
            <Palette size={16} style={{ color: currentAccent.color }} />
            <span className="text-sm font-bold"
              style={{ color: isDark ? '#eeeef5' : '#111827' }}>
              Theme
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: currentAccent.colorDim,
                color: currentAccent.color,
              }}>
              {isDark ? 'Dark' : 'Light'} · {currentAccent.label.replace('Neon ', '')}
            </span>
          </div>
          <button onClick={() => setOpen(false)}
            style={{ color: isDark ? '#5c5c78' : '#9ca3af' }}
            className="hover:opacity-70 transition-opacity">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* ── Base theme toggle ────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2.5"
              style={{ color: isDark ? '#5c5c78' : '#9ca3af' }}>
              Base Theme
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['light', 'dark'] as const).map(b => {
                const isActive = base === b
                return (
                  <button
                    key={b}
                    onClick={() => setBase(b)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95"
                    style={{
                      background: isActive
                        ? b === 'dark' ? '#1E1E2E' : '#F0F0F5'
                        : 'transparent',
                      border: isActive
                        ? `1.5px solid ${currentAccent.color}`
                        : isDark ? '1.5px solid #23233A' : '1.5px solid #e5e7eb',
                      color: isActive
                        ? currentAccent.color
                        : isDark ? '#a0a0b8' : '#6b7280',
                      boxShadow: isActive && isDark
                        ? `inset 0 0 12px ${currentAccent.colorDim}, 0 0 8px ${currentAccent.colorDim}`
                        : 'none',
                    }}
                  >
                    {b === 'dark'
                      ? <Moon size={15} />
                      : <Sun size={15} />
                    }
                    {b === 'dark' ? 'Dark' : 'Light'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Accent color swatches ────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: isDark ? '#5c5c78' : '#9ca3af' }}>
              Accent Colour
            </p>
            <div className="grid grid-cols-3 gap-3">
              {accents.map(a => (
                <Swatch
                  key={a.key}
                  accent={a}
                  active={accent === a.key}
                  isDark={isDark}
                  onClick={() => setAccent(a.key)}
                />
              ))}
            </div>
          </div>

          {/* ── Preview strip ────────────────────────────────────────────── */}
          <div
            className="rounded-xl p-3 flex items-center gap-3"
            style={{
              background: isDark ? '#0F0F1A' : '#f8f8fc',
              border: isDark ? '1px solid #23233A' : '1px solid #e5e7eb',
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: currentAccent.color,
                color: currentAccent.textColor,
                boxShadow: isDark ? `0 0 12px ${currentAccent.colorGlow}` : 'none',
              }}
            >
              W
            </div>
            <div>
              <p className="text-xs font-semibold"
                style={{ color: isDark ? '#eeeef5' : '#111827' }}>
                WinMindPerform
              </p>
              <p className="text-xs"
                style={{ color: isDark ? currentAccent.color : currentAccent.color }}>
                {currentAccent.label} · {isDark ? 'Dark' : 'Light'} Mode
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
