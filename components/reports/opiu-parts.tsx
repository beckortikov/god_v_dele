'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU, formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'

export const pct = (v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

/** Signed money; negative results use the destructive token. */
export function Money({
  value,
  currency = 'USD',
  sign,
  className,
  muteZero,
}: {
  value: number
  currency?: string
  sign?: boolean
  className?: string
  muteZero?: boolean
}) {
  const n = Number(value) || 0
  if (muteZero && n === 0) return <span className={cn('num text-muted-foreground/70', className)}>—</span>
  return <span className={cn('num', n < 0 && 'text-destructive', className)}>{formatMoney(n, currency, { sign })}</span>
}

/** ‹ Месяц ▾ Год ▾ › compact period control. */
export function PeriodPicker({
  month,
  year,
  years,
  onChange,
}: {
  month: string
  year: string
  years: string[]
  onChange: (month: string, year: string) => void
}) {
  const m = Number(month)
  const y = Number(year)
  const minYear = Number(years[years.length - 1])
  const maxYear = Number(years[0])
  const canPrev = !(y <= minYear && m <= 1)
  const canNext = !(y >= maxYear && m >= 12)

  const shift = (d: number) => {
    const date = new Date(y, m - 1 + d, 1)
    onChange(String(date.getMonth() + 1), String(date.getFullYear()))
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Предыдущий месяц">
        <ChevronLeft />
      </Button>
      <Select value={month} onValueChange={v => onChange(v, year)}>
        <SelectTrigger size="sm" className="w-[118px]" aria-label="Месяц">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {MONTHS_RU.map((label, i) => (
            <SelectItem key={i} value={String(i + 1)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year} onValueChange={v => onChange(month, v)}>
        <SelectTrigger size="sm" className="w-[84px]" aria-label="Год">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {years.map(v => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon-sm" onClick={() => shift(1)} disabled={!canNext} aria-label="Следующий месяц">
        <ChevronRight />
      </Button>
    </div>
  )
}

/* ---------- Financial statement rows ---------- */

export function SectionRow({ label, cols }: { label: React.ReactNode; cols: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="bg-muted/45 pt-4 pb-1.5 text-xs font-semibold text-foreground/80">
        {label}
      </TableCell>
    </TableRow>
  )
}

export type LineKind = 'line' | 'muted' | 'subtotal' | 'result'

/**
 * One line of the statement. `share` is the % of revenue, `ytd` the
 * year-to-date value. Pass `null` to leave a cell blank.
 */
export function StatementRow({
  label,
  hint,
  value,
  share,
  ytd,
  kind = 'line',
  format = v => formatMoney(v),
  negativeIsBad = true,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  value: number | null
  share?: number | null
  ytd?: number | null
  kind?: LineKind
  format?: (v: number) => string
  negativeIsBad?: boolean
}) {
  const strong = kind === 'subtotal' || kind === 'result'
  const tone = (v: number | null | undefined) => (negativeIsBad && v != null && v < 0 ? 'text-destructive' : '')
  const cell = (v: number | null | undefined, extra?: string) =>
    v == null ? '' : <span className={cn('num', tone(v), extra)}>{v === 0 && kind === 'line' ? <span className="text-muted-foreground/70">—</span> : format(v)}</span>

  return (
    <TableRow
      className={cn(
        'hover:bg-muted/40',
        kind === 'subtotal' && 'border-t border-t-foreground/15 font-semibold',
        kind === 'result' && 'bg-muted/50 font-semibold hover:bg-muted/60'
      )}
    >
      <TableCell className={cn('py-2 whitespace-normal', (kind === 'line' || kind === 'muted') && 'pl-6')}>
        <span className={cn(kind === 'muted' && 'text-muted-foreground', kind === 'result' && 'text-[15px]')}>{label}</span>
        {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>}
      </TableCell>
      <TableCell className={cn('py-2 text-right', kind === 'muted' && 'text-muted-foreground', kind === 'result' && 'text-[15px]')}>
        {cell(value)}
      </TableCell>
      <TableCell className="py-2 text-right text-xs text-muted-foreground max-sm:hidden">
        {share == null ? '' : <span className="num">{pct(share)}</span>}
      </TableCell>
      <TableCell className={cn('py-2 text-right max-md:hidden', !strong && 'text-muted-foreground')}>{cell(ytd)}</TableCell>
    </TableRow>
  )
}

/** Thin progress bar on a muted track. */
export function Meter({ value, tone = 'primary', className }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'destructive'; className?: string }) {
  const w = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]',
          tone === 'primary' && 'bg-primary',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'destructive' && 'bg-destructive'
        )}
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

/** Label / value line for side panels. */
export function KV({ label, children, strong }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-sm', strong && 'font-semibold')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span className="num text-right">{children}</span>
    </div>
  )
}
