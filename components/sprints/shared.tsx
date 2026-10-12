'use client'

import * as React from 'react'
import { AlertCircle, Check, Clock, Database, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/erp/empty-state'
import type { AssignmentStatus } from '@/lib/sprints'

/** The API answered 503: migration 016 is not applied yet. */
export class MigrationRequired extends Error {}

/** JSON request to our API with readable errors. */
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 503 && body?.error === 'migration_required') throw new MigrationRequired(body.message)
  if (!res.ok || body?.error) throw new Error(body?.error || `Сервер ответил ${res.status}`)
  return body as T
}

export function MigrationNotice({ className }: { className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={Database}
      title="Спринты ещё не подключены"
      description={
        <>
          Нужно один раз создать таблицы: откройте Supabase → SQL Editor и выполните файл{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">migrations/016_sprints.sql</code>. После этого обновите страницу.
        </>
      }
    />
  )
}

/** Cell state in the curator's matrix: an assignment status, overdue, or no task for this person. */
export type CellState = AssignmentStatus | 'overdue' | 'none'

export const CELL: Record<CellState, { label: string; cls: string }> = {
  done: { label: 'выполнено', cls: 'bg-success-soft text-success' },
  review: { label: 'на проверке', cls: 'bg-info-soft text-info' },
  rework: { label: 'на доработке', cls: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' },
  overdue: { label: 'просрочено', cls: 'bg-destructive-soft text-destructive' },
  todo: { label: 'не сдано', cls: 'border border-dashed border-muted-foreground/50 text-muted-foreground' },
  none: { label: 'не назначено', cls: 'text-muted-foreground/50' },
}

export function CellIcon({ state, className }: { state: CellState; className?: string }) {
  const c = cn('size-3.5', className)
  switch (state) {
    case 'done':
      return <Check className={c} strokeWidth={3} />
    case 'review':
      return <Clock className={c} />
    case 'rework':
      return <RotateCcw className={c} />
    case 'overdue':
      return <AlertCircle className={c} />
    default:
      return null
  }
}

export function StatusCell({
  state,
  label,
  onClick,
}: {
  state: CellState
  label: string
  onClick?: () => void
}) {
  if (state === 'none') return <span className="text-muted-foreground/50" aria-label={label}>—</span>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-9 items-center justify-center rounded-md transition-[filter] outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/30',
        CELL[state].cls
      )}
    >
      <CellIcon state={state} />
    </button>
  )
}

export function Legend({ className }: { className?: string }) {
  const states: CellState[] = ['done', 'review', 'rework', 'overdue', 'todo']
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground', className)}>
      {states.map(s => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-flex h-3 w-3.5 items-center justify-center rounded-[3px]', CELL[s].cls)} />
          {CELL[s].label}
        </span>
      ))}
    </div>
  )
}

/** Persists a small per-viewer choice (selected program) in localStorage. */
export function useStoredState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(initial)
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(key)
      if (v) setValue(v as T)
    } catch {}
  }, [key])
  const set = React.useCallback(
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(key, v)
      } catch {}
    },
    [key]
  )
  return [value, set]
}
