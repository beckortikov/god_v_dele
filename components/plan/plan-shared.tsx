'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { STATE_META, type ActionState, type MyPlanData, type OpAction, type OpDirection, type OpGoal } from '@/lib/op-plan'
import { api } from '@/components/sprints/shared'

export { MigrationRequired } from '@/components/sprints/shared'

/** Request to /api/my-plan/<path> for this participant. */
export function planApi<T = unknown>(participantId: string, path: string, init?: RequestInit & { json?: unknown }) {
  const sep = path.includes('?') ? '&' : '?'
  return api<T>(`/api/my-plan${path}${sep}participant_id=${encodeURIComponent(participantId)}`, init)
}

/** «$1 000» — цена слова is kept in dollars, like in the participants' spreadsheets. */
export const usd = (n: number) => formatMoney(n, 'USD')

export function StatePill({ state, className }: { state: ActionState; className?: string }) {
  const m = STATE_META[state]
  return <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12.5px] font-semibold whitespace-nowrap', m.cls, className)}>{m.label}</span>
}

export function PriorityMark({ p, className }: { p: OpAction['priority']; className?: string }) {
  return (
    <span
      title={`Приоритет ${p}`}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
        p === 'A' ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {p}
    </span>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('flex h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <span className="rounded-full bg-success transition-[width] duration-300" style={{ width: `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` }} />
    </span>
  )
}

/** Lookups the screens need over and over. */
export function usePlanIndex(data: MyPlanData | null) {
  return React.useMemo(() => {
    const goals = new Map<string, OpGoal>()
    const directions = new Map<string, OpDirection>()
    const excusesOf = new Map<string, MyPlanData['excuses']>()
    for (const d of data?.directions ?? []) directions.set(d.id, d)
    for (const g of data?.goals ?? []) goals.set(g.id, g)
    for (const e of data?.excuses ?? []) excusesOf.set(e.action_id, [...(excusesOf.get(e.action_id) ?? []), e])
    const owners = [...new Set((data?.actions ?? []).flatMap(a => a.owners))].sort((a, b) => a.localeCompare(b, 'ru'))
    return { goals, directions, excusesOf, owners }
  }, [data])
}
