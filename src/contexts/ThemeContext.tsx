// src/contexts/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BaseTheme  = 'light' | 'dark'
export type AccentKey  = 'green' | 'pink' | 'magenta' | 'yellow' | 'orange' | 'purple'

export interface AccentDef {
  key:       AccentKey
  label:     string
  color:     string   // hex
  colorDim:  string   // rgba at 15%
  colorGlow: string   // rgba at 35%
  textColor: string   // auto-computed: black or white for text ON this bg
}

export interface ThemeState {
  base:   BaseTheme
  accent: AccentKey
}

interface ThemeContextValue extends ThemeState {
  setBase:   (b: BaseTheme) => void
  setAccent: (a: AccentKey) => void
  accents:   AccentDef[]
  currentAccent: AccentDef
}

// ── Accent definitions ────────────────────────────────────────────────────────
// textColor is auto-chosen via relative luminance:
//   Luminance > 0.35 → black text   (green, yellow)
//   Luminance ≤ 0.35 → white text   (pink, magenta, orange, purple)

export const ACCENTS: AccentDef[] = [
  {
    key: 'green',   label: 'Neon Green',
    color: '#00FF41', colorDim: 'rgba(0,255,65,0.15)',  colorGlow: 'rgba(0,255,65,0.35)',
    textColor: '#000000',
  },
  {
    key: 'pink',    label: 'Neon Pink',
    color: '#FF6EC7', colorDim: 'rgba(255,110,199,0.15)', colorGlow: 'rgba(255,110,199,0.35)',
    textColor: '#ffffff',
  },
  {
    key: 'magenta', label: 'Neon Magenta',
    color: '#FF00FF', colorDim: 'rgba(255,0,255,0.15)',  colorGlow: 'rgba(255,0,255,0.35)',
    textColor: '#ffffff',
  },
  {
    key: 'yellow',  label: 'Neon Yellow',
    color: '#FFE600', colorDim: 'rgba(255,230,0,0.15)',  colorGlow: 'rgba(255,230,0,0.35)',
    textColor: '#000000',
  },
  {
    key: 'orange',  label: 'Neon Orange',
    color: '#FF7F00', colorDim: 'rgba(255,127,0,0.15)',  colorGlow: 'rgba(255,127,0,0.35)',
    textColor: '#ffffff',
  },
  {
    key: 'purple',  label: 'Purple',
    color: '#BF00FF', colorDim: 'rgba(191,0,255,0.15)',  colorGlow: 'rgba(191,0,255,0.35)',
    textColor: '#ffffff',
  },
]

// ── Light / Dark palette definitions ─────────────────────────────────────────

interface Palette {
  bg:          string
  bgSecondary: string
  bgCard:      string
  border:      string
  text:        string
  textSec:     string
  textMuted:   string
  inputBg:     string
  sidebarBg:   string
  sidebarText: string
  sidebarHover:string
  shadow:      string
}

const LIGHT: Palette = {
  bg:           '#F5F5F7',
  bgSecondary:  '#EBEBED',
  bgCard:       '#FFFFFF',
  border:       '#E2E2E7',
  text:         '#111827',
  textSec:      '#4B5563',
  textMuted:    '#9CA3AF',
  inputBg:      '#FFFFFF',
  sidebarBg:    'linear-gradient(160deg,#1A2D4A 0%,#0D1F35 100%)',
  sidebarText:  '#C8D6E5',
  sidebarHover: 'rgba(255,255,255,0.10)',
  shadow:       '0 1px 3px rgba(0,0,0,0.08)',
}

const DARK: Palette = {
  bg:           '#08080F',
  bgSecondary:  '#0F0F1A',
  bgCard:       '#13131E',
  border:       '#23233A',
  text:         '#EEEEF5',
  textSec:      '#A0A0B8',
  textMuted:    '#5C5C78',
  inputBg:      '#1A1A28',
  sidebarBg:    'linear-gradient(160deg,#090912 0%,#06060E 100%)',
  sidebarText:  '#A0A0C0',
  sidebarHover: 'rgba(255,255,255,0.06)',
  shadow:       '0 1px 4px rgba(0,0,0,0.6)',
}

// ── CSS injection ─────────────────────────────────────────────────────────────

function buildCSS(palette: Palette, accent: AccentDef, base: BaseTheme): string {
  const dark = base === 'dark'
  return `
:root {
  --t-bg:            ${palette.bg};
  --t-bg2:           ${palette.bgSecondary};
  --t-card:          ${palette.bgCard};
  --t-border:        ${palette.border};
  --t-text:          ${palette.text};
  --t-text2:         ${palette.textSec};
  --t-muted:         ${palette.textMuted};
  --t-input-bg:      ${palette.inputBg};
  --t-sidebar-bg:    ${palette.sidebarBg};
  --t-sidebar-text:  ${palette.sidebarText};
  --t-sidebar-hover: ${palette.sidebarHover};
  --t-shadow:        ${palette.shadow};
  --t-accent:        ${accent.color};
  --t-accent-text:   ${accent.textColor};
  --t-accent-dim:    ${accent.colorDim};
  --t-accent-glow:   ${accent.colorGlow};
}

/* ── Page background & cards ───────────────────────────────────── */
body { background-color: var(--t-bg) !important; }
.main-content { background-color: var(--t-bg) !important; }

/* ── Tailwind bg overrides ─────────────────────────────────────── */
${dark ? `
html .bg-white            { background-color: var(--t-card)   !important; }
html .bg-gray-50          { background-color: var(--t-bg2)    !important; }
html .bg-gray-100         { background-color: #1E1E2E         !important; }
html .bg-gradient-spps    { background: var(--t-sidebar-bg)   !important; }
` : ''}

/* ── Border overrides ──────────────────────────────────────────── */
${dark ? `
html .border-gray-50,
html .border-gray-100,
html .border-gray-200  { border-color: var(--t-border) !important; }
` : ''}

/* ── Text overrides ────────────────────────────────────────────── */
${dark ? `
html .text-gray-900, html .text-gray-800 { color: var(--t-text)  !important; }
html .text-gray-700, html .text-gray-600 { color: var(--t-text2) !important; }
html .text-gray-500, html .text-gray-400 { color: var(--t-muted) !important; }
` : ''}

/* ── Form inputs ───────────────────────────────────────────────── */
${dark ? `
html input:not([type=checkbox]):not([type=radio]),
html select,
html textarea {
  background-color: var(--t-input-bg) !important;
  border-color:     var(--t-border)   !important;
  color:            var(--t-text)     !important;
}
html input::placeholder,
html textarea::placeholder { color: var(--t-muted) !important; }
html select option { background-color: #1A1A28; color: var(--t-text); }
` : ''}

/* ── Shadow overrides ──────────────────────────────────────────── */
${dark ? `
html .shadow-sm,
html .shadow   { box-shadow: var(--t-shadow) !important; }
` : ''}

/* ── Accent utilities ───────────────────────────────────────────── */
.wmp-accent-bg  { background-color: var(--t-accent) !important; color: var(--t-accent-text) !important; }
.wmp-accent-text{ color: var(--t-accent) !important; }
.wmp-accent-border { border-color: var(--t-accent) !important; }
.wmp-accent-dim { background-color: var(--t-accent-dim) !important; color: var(--t-accent) !important; }
.focus\\:ring-2:focus { --tw-ring-color: var(--t-accent) !important; }

/* ── Neon glow (dark mode only) ─────────────────────────────────── */
${dark ? `
.wmp-glow {
  box-shadow: 0 0 12px var(--t-accent-glow), 0 0 30px var(--t-accent-glow) !important;
}
.wmp-glow-text {
  text-shadow: 0 0 8px var(--t-accent-glow), 0 0 20px var(--t-accent-glow);
}
` : `
.wmp-glow {}
.wmp-glow-text {}
`}

/* ── Primary buttons ─────────────────────────────────────────────── */
html .bg-gradient-spps-btn,
html .btn-primary {
  background-color: var(--t-accent) !important;
  color:            var(--t-accent-text) !important;
  ${dark ? `box-shadow: 0 0 14px var(--t-accent-glow);` : ''}
}
html .btn-primary:hover {
  filter: brightness(1.15);
}

/* ── Nav active state glow ───────────────────────────────────────── */
.nav-active-accent {
  background: var(--t-accent-dim) !important;
  color: var(--t-accent) !important;
  ${dark ? `box-shadow: inset 0 0 12px var(--t-accent-dim);` : ''}
}

/* ── Scrollbar (dark mode) ───────────────────────────────────────── */
${dark ? `
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--t-bg); }
::-webkit-scrollbar-thumb { background: var(--t-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--t-accent); }
` : ''}

/* ── Modal / overlay ─────────────────────────────────────────────── */
${dark ? `
html .bg-white.rounded-2xl,
html .bg-white.rounded-xl,
html .bg-white.rounded-lg { background-color: var(--t-card) !important; }
` : ''}

/* ── Print / PDF: always light ───────────────────────────────────── */
@media print {
  body, .main-content { background-color: #fff !important; }
  * { color: #111 !important; border-color: #e5e7eb !important; }
}
`
}

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  base: 'light',
  accent: 'green',
  accents: ACCENTS,
  currentAccent: ACCENTS[0],
  setBase: () => {},
  setAccent: () => {},
})

const STORAGE_KEY = 'wmp_theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (s) return JSON.parse(s)
    } catch {}
    return { base: 'dark', accent: 'green' } // default: dark + neon green
  })

  const applyTheme = useCallback((s: ThemeState) => {
    const palette = s.base === 'dark' ? DARK : LIGHT
    const accent  = ACCENTS.find(a => a.key === s.accent) ?? ACCENTS[0]

    let el = document.getElementById('wmp-theme') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'wmp-theme'
      document.head.insertBefore(el, document.head.firstChild)
    }
    el.textContent = buildCSS(palette, accent, s.base)

    // Tailwind dark class + data attribute
    document.documentElement.classList.toggle('dark', s.base === 'dark')
    document.documentElement.setAttribute('data-theme', s.base)
    document.documentElement.setAttribute('data-accent', s.accent)

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  }, [])

  useEffect(() => { applyTheme(state) }, [state])

  const setBase   = (base: BaseTheme)  => setState(s => ({ ...s, base }))
  const setAccent = (accent: AccentKey) => setState(s => ({ ...s, accent }))
  const currentAccent = ACCENTS.find(a => a.key === state.accent) ?? ACCENTS[0]

  return (
    <ThemeContext.Provider value={{ ...state, setBase, setAccent, accents: ACCENTS, currentAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
