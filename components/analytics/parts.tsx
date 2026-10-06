'use client'

import * as React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer, Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { readPref, writePref } from '@/components/finance/types'

/** Title row inside a Panel: heading on the left, legend / link on the right. */
export function PanelHead({
  title,
  description,
  aside,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {aside}
    </div>
  )
}

/** Program filter for page headers. */
export function ProgramSelect({
  value,
  onChange,
  programs,
}: {
  value: string
  onChange: (v: string) => void
  programs: { id: string; name: string }[]
}) {
  // Keep the trigger readable while programs are still loading
  const known = value === 'all' || programs.some(p => p.id === value)
  return (
    <Select value={known ? value : 'all'} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-44" aria-label="Программа">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all">Все программы</SelectItem>
        {programs.map(p => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type Tone = 'success' | 'destructive' | 'muted'

export const toneText: Record<Tone, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
}

/** Rounds away float noise such as 1.1e-13 before comparing with zero. */
export const cents = (v: number) => Math.round((Number(v) || 0) * 100) / 100

/**
 * Tone of a deviation. For income more is better; for expenses
 * spending more than planned is bad (`inverse`).
 */
export function deviationTone(v: number, inverse = false): Tone {
  const n = cents(v)
  if (n === 0) return 'muted'
  return n > 0 !== inverse ? 'success' : 'destructive'
}

/** Signed money with a tone, «—» for zero. */
export function Deviation({ value, inverse, className }: { value: number; inverse?: boolean; className?: string }) {
  const n = cents(value)
  return (
    <span className={cn('num', toneText[deviationTone(n, inverse)], className)}>
      {n === 0 ? '—' : formatMoney(n, 'USD', { sign: true })}
    </span>
  )
}

/** Thin progress line, e.g. plan execution. */
export function Meter({
  value,
  tone = 'default',
  className,
}: {
  value: number
  tone?: 'default' | 'success' | 'warning' | 'destructive'
  className?: string
}) {
  const pct = Math.max(0, Math.min(value, 100))
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]',
          tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : tone === 'destructive' ? 'bg-destructive' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <Panel>
        <EmptyState
          icon={Inbox}
          title="Не удалось загрузить данные"
          description={message}
          action={
            <Button variant="outline" onClick={onRetry}>
              Повторить
            </Button>
          }
        />
      </Panel>
    </PageContainer>
  )
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <Panel className="p-4 sm:p-5">
      <Skeleton className="mb-5 h-5 w-48" />
      <Skeleton className="w-full" style={{ height }} />
    </Panel>
  )
}

/** Small persisted view state (program, tab…). Every storage access is guarded. */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(initial)
  React.useEffect(() => {
    const saved = readPref(key)
    if (saved) setValue(saved as T)
  }, [key])
  const set = React.useCallback(
    (v: T) => {
      setValue(v)
      writePref(key, v)
    },
    [key],
  )
  return [value, set]
}
