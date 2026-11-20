'use client'

import * as React from 'react'
import { PhoneCall } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { FUNNEL, type FunnelStage, type FunnelVariant } from '@/lib/event-funnel'

export type StageFilter = 'all' | 'due' | FunnelStage

export const funnelDot: Record<FunnelVariant, string> = {
  secondary: 'bg-muted-foreground/45',
  warning: 'bg-warning',
  default: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  destructive: 'bg-destructive',
}

/**
 * Funnel counts at a glance; a tile filters the list to that stage, a second click clears it.
 * «Перезвонить» counts people whose callback date is today or already passed.
 */
export function FunnelStrip({
  counts,
  due,
  total,
  value,
  onChange,
}: {
  counts: Record<FunnelStage, number>
  due: number
  total: number
  value: StageFilter
  onChange: (v: StageFilter) => void
}) {
  const toggle = (v: StageFilter) => onChange(value === v ? 'all' : v)
  return (
    <div role="group" aria-label="Этапы приглашения" className="-mx-3 mb-3 flex snap-x scroll-px-3 gap-1.5 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-7">
      {FUNNEL.map(s => {
        const n = counts[s.value] ?? 0
        const active = value === s.value
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(s.value)}
            className={cn(
              'flex w-32 shrink-0 snap-start flex-col items-start gap-0.5 rounded-lg border bg-card px-3 py-2 text-left sm:w-auto sm:min-w-0 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              active ? 'border-primary ring-1 ring-primary/40' : 'hover:border-ring/40',
              n === 0 && !active && 'opacity-60'
            )}
          >
            <span className="flex w-full items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-full', funnelDot[s.variant])} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="num text-lg leading-tight font-semibold">
              {formatNumber(n)}
              {total > 0 && n > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{Math.round((n / total) * 100)}%</span>}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={value === 'due'}
        onClick={() => toggle('due')}
        className={cn(
          'order-first flex w-32 shrink-0 snap-start flex-col items-start gap-0.5 rounded-lg border px-3 py-2 sm:order-none text-left sm:w-auto sm:min-w-0 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          due > 0 ? 'border-warning/50 bg-warning-soft' : 'bg-card opacity-60',
          value === 'due' ? 'border-primary ring-1 ring-primary/40 opacity-100' : 'hover:border-ring/40'
        )}
      >
        <span className="flex w-full items-center gap-1.5 truncate text-xs text-muted-foreground">
          <PhoneCall className="size-3 shrink-0" />
          <span className="truncate">Перезвонить</span>
        </span>
        <span className="num text-lg leading-tight font-semibold">{formatNumber(due)}</span>
      </button>
    </div>
  )
}
