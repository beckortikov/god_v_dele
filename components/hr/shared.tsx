'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU } from '@/lib/format'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types shared by the HR pages

export type EmployeeStatus = 'active' | 'inactive' | 'terminated'

export interface HrEmployee {
  id: string
  first_name: string
  last_name: string
  position: string
  department?: string | null
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  hire_date?: string | null
  base_salary: number
  currency?: string | null
  responsibilities?: string | null
  valuable_final_product?: string | null
  status: EmployeeStatus
}

export type ShiftType = 'work' | 'day_off' | 'sick_leave' | 'vacation' | 'unpaid_leave'

export interface ScheduleItem {
  id?: string
  employee_id: string
  work_date: string
  shift_type: ShiftType
  start_time?: string | null
  end_time?: string | null
  employees?: { first_name: string; last_name: string; position?: string }
}

// ---------------------------------------------------------------------------
// Shift / absence types

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'

export const SHIFTS: Record<ShiftType, { label: string; short: string; code: string; badge: BadgeVariant; cell: string; dot: string }> = {
  work: {
    label: 'Рабочий день',
    short: 'Работа',
    code: 'Р',
    badge: 'default',
    cell: 'bg-primary-soft text-primary-soft-foreground',
    dot: 'bg-primary',
  },
  day_off: {
    label: 'Выходной',
    short: 'Выходной',
    code: 'В',
    badge: 'secondary',
    cell: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
  vacation: {
    label: 'Отпуск',
    short: 'Отпуск',
    code: 'О',
    badge: 'success',
    cell: 'bg-success-soft text-success',
    dot: 'bg-success',
  },
  sick_leave: {
    label: 'Больничный',
    short: 'Больничный',
    code: 'Б',
    badge: 'warning',
    cell: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
    dot: 'bg-warning',
  },
  unpaid_leave: {
    label: 'Отгул без сохранения',
    short: 'Отгул б/с',
    code: 'БС',
    badge: 'destructive',
    cell: 'bg-destructive-soft text-destructive',
    dot: 'bg-destructive',
  },
}

export const SHIFT_ORDER: ShiftType[] = ['work', 'day_off', 'vacation', 'sick_leave', 'unpaid_leave']
export const LEAVE_TYPES = ['vacation', 'sick_leave', 'unpaid_leave'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

// ---------------------------------------------------------------------------
// Helpers

export const fullName = (e?: { first_name?: string; last_name?: string } | null) =>
  e ? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() : ''

export const initials = (e?: { first_name?: string; last_name?: string } | null) =>
  `${e?.first_name?.[0] ?? ''}${e?.last_name?.[0] ?? ''}`.toUpperCase() || '?'

/** Local YYYY-MM-DD (toISOString shifts the day near midnight in non-UTC zones). */
export function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** First and last day of a month (month is 1–12) as YYYY-MM-DD. */
export function monthBounds(year: number, month: number): [string, string] {
  const mm = String(month).padStart(2, '0')
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`]
}

/** Inclusive list of YYYY-MM-DD between two dates (pure calendar arithmetic). */
export function dateRange(from: string, to: string) {
  const out: string[] = []
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  if (!y1 || !y2) return out
  const end = Date.UTC(y2, m2 - 1, d2)
  for (let t = Date.UTC(y1, m1 - 1, d1); t <= end && out.length < 400; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export function weekday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

export const isWeekend = (iso: string) => {
  const w = weekday(iso)
  return w === 0 || w === 6
}

/** "5 окт" / "5 окт – 12 окт 2026" */
export function formatDay(iso: string, withYear = false) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).replace('.', '')
}

export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '')

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Small UI pieces

export function Avatar({ person, className }: { person?: { first_name?: string; last_name?: string } | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground',
        className
      )}
    >
      {initials(person)}
    </span>
  )
}

export interface YearMonth {
  year: number
  month: number // 1–12
}

export const currentYearMonth = (): YearMonth => {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export const monthLabel = ({ year, month }: YearMonth) => `${MONTHS_RU[month - 1]} ${year}`

/** Prev / next month buttons with the current month label in between. */
export function MonthSwitcher({ value, onChange, className }: { value: YearMonth; onChange: (v: YearMonth) => void; className?: string }) {
  const shift = (delta: number) => {
    const d = new Date(value.year, value.month - 1 + delta, 1)
    onChange({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const now = currentYearMonth()
  const isCurrent = now.year === value.year && now.month === value.month
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {!isCurrent && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(now)}>
          Текущий
        </Button>
      )}
      <div className="flex h-8 items-center rounded-md border border-input bg-card shadow-xs dark:bg-input/25">
        <Button variant="ghost" size="icon-sm" className="rounded-r-none" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
          <ChevronLeft />
        </Button>
        <span className="min-w-32 px-1 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {monthLabel(value)}
        </span>
        <Button variant="ghost" size="icon-sm" className="rounded-l-none" onClick={() => shift(1)} aria-label="Следующий месяц">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/** Pill buttons for a short list of options (used inside sheets). */
export function ChoiceChips<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; dot?: string }[]
  className?: string
}) {
  return (
    <div role="radiogroup" className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              active
                ? 'border-primary bg-primary-soft font-medium text-primary-soft-foreground'
                : 'border-input bg-card text-foreground/80 hover:border-ring/40 hover:text-foreground'
            )}
          >
            {o.dot && <span className={cn('size-2 rounded-full', o.dot)} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Label / value row for detail sheets. */
export function DetailRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

export const errorHint = (msg?: string) => (msg ? <span className="text-destructive">{msg}</span> : undefined)
