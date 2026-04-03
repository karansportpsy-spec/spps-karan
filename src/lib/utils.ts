import { type ClassValue, clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import type { RiskLevel, AthleteStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function fmtDate(iso: string, fmt = 'dd MMM yyyy') {
  try { return format(parseISO(iso), fmt) } catch { return iso }
}

export function fmtTime(iso: string) {
  try { return format(parseISO(iso), 'HH:mm') } catch { return '' }
}

export function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function riskColor(level: RiskLevel): string {
  return {
    low: 'bg-emerald-100 text-emerald-700',
    moderate: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }[level] ?? 'bg-gray-100 text-gray-600'
}

export function statusColor(status: AthleteStatus): string {
  return {
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-gray-100 text-gray-500',
    on_hold: 'bg-amber-100 text-amber-700',
  }[status] ?? 'bg-gray-100 text-gray-600'
}

export function scoreColor(score: number): string {
  if (score >= 8) return '#10b981'
  if (score >= 5) return '#f59e0b'
  return '#ef4444'
}

export function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}
