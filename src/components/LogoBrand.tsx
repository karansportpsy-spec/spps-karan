// src/components/LogoBrand.tsx
// WinMindPerform logo — renders SVG in sidebar, full version in PDF/print header
// Place your actual PNG at public/logo.png to override the SVG version

import { useTheme } from '@/contexts/ThemeContext'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'sidebar' | 'full' | 'print'
  className?: string
}

// ── SVG emblem (approximates the WMP circular logo) ───────────────────────────

function WMPEmblem({ size = 36, glowColor }: { size?: number; glowColor?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      style={glowColor ? { filter: `drop-shadow(0 0 6px ${glowColor})` } : undefined}
    >
      {/* Outer green ring */}
      <circle cx="40" cy="40" r="38" fill="none" stroke="#3DDC84" strokeWidth="4" />

      {/* Inner dark navy circle */}
      <circle cx="40" cy="40" r="33" fill="#1A2D4A" />

      {/* Subtle inner texture */}
      <circle cx="40" cy="40" r="33" fill="url(#woodGrain)" opacity="0.3" />

      {/* Forward chevrons (movement / performance arrows) */}
      <g fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {/* Left chevron */}
        <polyline points="18,27 28,40 18,53" />
        {/* Right chevron */}
        <polyline points="32,27 42,40 32,53" />
        {/* Far right chevron (thinner, accent) */}
        <polyline points="46,27 56,40 46,53" strokeWidth="3.5" opacity="0.6" />
      </g>

      <defs>
        <radialGradient id="woodGrain" cx="40%" cy="40%">
          <stop offset="0%" stopColor="#2D4A6A" />
          <stop offset="100%" stopColor="#0D1F35" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── Full logo with text ────────────────────────────────────────────────────────

export default function LogoBrand({ size = 'md', variant = 'sidebar', className = '' }: Props) {
  const { base, currentAccent } = useTheme()
  const isDark = base === 'dark'
  const glowColor = isDark ? currentAccent.color : undefined

  if (variant === 'print') {
    // Used in PDF export header — always full colour on white
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <WMPEmblem size={48} />
        <div>
          <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.1 }}>
            <span style={{ color: '#1A2D4A' }}>WIN</span>
            <span style={{ color: '#2D7DD2' }}>MIND</span>
            <span style={{ color: '#1A2D4A' }}>PERFORM</span>
          </p>
          <p style={{ fontSize: 9, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            one team one mission
          </p>
        </div>
      </div>
    )
  }

  const emblemSize = size === 'sm' ? 28 : size === 'lg' ? 48 : 36

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Try real PNG first, fallback to SVG */}
      <div className="shrink-0 relative">
        <img
          src="/logo.png"
          alt="WinMindPerform"
          width={emblemSize}
          height={emblemSize}
          className="object-contain"
          onError={e => {
            // PNG not found → show SVG
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const next = target.nextElementSibling as HTMLElement
            if (next) next.style.display = 'block'
          }}
          style={{ display: 'block' }}
        />
        <div style={{ display: 'none' }}>
          <WMPEmblem size={emblemSize} glowColor={glowColor} />
        </div>
      </div>

      {variant !== 'sidebar' || size !== 'sm' ? (
        <div className="min-w-0">
          <p
            className="font-bold tracking-wide leading-tight"
            style={{ fontSize: size === 'lg' ? 16 : 13 }}
          >
            <span className="text-white">WIN</span>
            <span style={{ color: isDark ? currentAccent.color : '#3DB3F0' }}
                  className={isDark ? 'wmp-glow-text' : ''}>
              MIND
            </span>
            <span className="text-white">PERFORM</span>
          </p>
          {size !== 'sm' && (
            <p
              className="leading-tight"
              style={{
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: isDark ? currentAccent.color : 'rgba(200,214,229,0.7)',
                opacity: 0.9,
              }}
            >
              one team one mission
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── Print logo (for use in PDF/print headers without hook dependency) ─────────

export function PrintLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <img
        src="/logo.png"
        alt="WinMindPerform"
        width={48}
        height={48}
        style={{ objectFit: 'contain' }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
      <div>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          <span style={{ color: '#1A2D4A' }}>WIN</span>
          <span style={{ color: '#2D7DD2' }}>MIND</span>
          <span style={{ color: '#1A2D4A' }}>PERFORM</span>
        </p>
        <p style={{ margin: 0, fontSize: 9, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Sport Psychology Practitioner Suite
        </p>
      </div>
    </div>
  )
}
