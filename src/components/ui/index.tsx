import {
  type ButtonHTMLAttributes, type InputHTMLAttributes,
  type TextareaHTMLAttributes, type SelectHTMLAttributes,
  type ReactNode, forwardRef, useEffect
} from 'react'
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { scoreColor, initials } from '@/lib/utils'

// ── Spinner ────────────────────────────────────────────────────
export function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size]
  return <div className={`${s} rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin`} />
}

// ── Button ─────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}
export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary:   'bg-gradient-spps text-white hover:opacity-90',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    ghost:     'text-gray-600 hover:bg-gray-100',
    danger:    'bg-red-600 text-white hover:bg-red-700',
  }
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}

// ── Input ──────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string
}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, hint, className, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input ref={ref}
      className={cn('w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
        error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white', className)}
      {...props} />
    {error && <p className="text-xs text-red-600">{error}</p>}
    {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
  </div>
))
Input.displayName = 'Input'

// ── Textarea ───────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; error?: string
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <textarea ref={ref} rows={4}
      className={cn('w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none',
        error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white', className)}
      {...props} />
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
))
Textarea.displayName = 'Textarea'

// ── Select ─────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; options: { value: string; label: string }[]
}
export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <select className={cn('w-full rounded-lg border px-3 py-2 text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          error ? 'border-red-300' : 'border-gray-200', className)} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────
export function Badge({ label, className }: { label: string; className?: string }) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}>{label}</span>
}

// ── Card ───────────────────────────────────────────────────────
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 shadow-sm', onClick && 'cursor-pointer hover:shadow-md transition-shadow', className)} onClick={onClick}>
      {children}
    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon, className }: { label: string; value: string | number; sub?: string; icon?: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {icon && <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>}
      </div>
    </Card>
  )
}

// ── Modal ──────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; maxWidth?: string
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto', maxWidth)}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="text-gray-300 mb-4">{icon}</div>}
      <p className="text-gray-600 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── ScoreRing ──────────────────────────────────────────────────
export function ScoreRing({ score, label, size = 64 }: { score: number; label: string; size?: number }) {
  const r = 22; const circ = 2 * Math.PI * r; const dash = (score / 10) * circ
  const color = scoreColor(score)
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 26 26)" />
        <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">{score}</text>
      </svg>
      <span className="text-xs text-gray-500 capitalize">{label}</span>
    </div>
  )
}

// ── Alert ──────────────────────────────────────────────────────
type AlertType = 'info' | 'success' | 'error' | 'warning'
export function Alert({ type = 'info', message }: { type?: AlertType; message: string }) {
  const styles: Record<AlertType, string> = {
    info:    'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error:   'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
  }
  const icons: Record<AlertType, ReactNode> = {
    info:    <Info size={16} />,
    success: <CheckCircle size={16} />,
    error:   <AlertCircle size={16} />,
    warning: <AlertCircle size={16} />,
  }
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-4 py-3 text-sm', styles[type])}>
      {icons[type]}<p>{message}</p>
    </div>
  )
}

// ── PageHeader ─────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Avatar ─────────────────────────────────────────────────────
export function Avatar({ firstName, lastName, src, size = 'md' }: {
  firstName: string; lastName: string; src?: string; size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base' }
  if (src) return <img src={src} alt={`${firstName} ${lastName}`} className={cn('rounded-full object-cover', sizes[size])} />
  return (
    <div className={cn('rounded-full bg-gradient-spps flex items-center justify-center text-white font-semibold shrink-0', sizes[size])}>
      {initials(firstName, lastName)}
    </div>
  )
}
