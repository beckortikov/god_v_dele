'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableHead } from '@/components/ui/table'

// ---------------------------------------------------------------------------
// Selection state

export interface RowSelection {
  /** Selected ids that are still in `ids` (hidden rows never count). */
  selectedIds: string[]
  count: number
  isSelected: (id: string) => boolean
  toggle: (id: string, on?: boolean) => void
  /** Select every row in `ids`, or clear when all are already selected. */
  toggleAll: () => void
  clear: () => void
  allSelected: boolean
  someSelected: boolean
}

/**
 * Row selection for a table. `ids` are the visible, selectable rows; pass a
 * `resetKey` built from the filters (tab, search, page…) so the selection
 * clears whenever the filter changes.
 *
 *   const sel = useRowSelection(filtered.map(e => e.id), `${statusFilter}|${search}`)
 */
export function useRowSelection(ids: string[], resetKey?: string | number): RowSelection {
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set())

  // Clear on filter change (state adjustment during render, no effect needed)
  const [lastKey, setLastKey] = React.useState(resetKey)
  if (lastKey !== resetKey) {
    setLastKey(resetKey)
    if (picked.size) setPicked(new Set())
  }

  const selectedIds = React.useMemo(() => ids.filter(id => picked.has(id)), [ids, picked])
  const count = selectedIds.length
  const allSelected = ids.length > 0 && count === ids.length

  const toggle = React.useCallback((id: string, on?: boolean) => {
    setPicked(prev => {
      const next = new Set(prev)
      if (on ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleAll = React.useCallback(() => {
    setPicked(prev => {
      const every = ids.length > 0 && ids.every(id => prev.has(id))
      return every ? new Set() : new Set(ids)
    })
  }, [ids])

  const clear = React.useCallback(() => setPicked(new Set()), [])
  const isSelected = React.useCallback((id: string) => picked.has(id), [picked])

  return { selectedIds, count, isSelected, toggle, toggleAll, clear, allSelected, someSelected: count > 0 && !allSelected }
}

// ---------------------------------------------------------------------------
// Checkbox cells

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

/** A bare selection checkbox that never triggers the row click. */
export function SelectCheckbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange: (v: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={v => onCheckedChange(v === true)}
      onClick={stop}
      onKeyDown={stop}
      aria-label={label}
      disabled={disabled}
      className={className}
    />
  )
}

const cellCls = 'w-10 pr-0 pl-3 sm:pl-4'

/** Header cell with «select all» (shows the indeterminate state). */
export function SelectHeadCell({ selection, label = 'Выбрать все', disabled }: { selection: RowSelection; label?: string; disabled?: boolean }) {
  return (
    <TableHead className={cellCls} onClick={stop}>
      <SelectCheckbox
        checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
        onCheckedChange={() => selection.toggleAll()}
        label={label}
        disabled={disabled}
        className="translate-y-[2px]"
      />
    </TableHead>
  )
}

/**
 * Body cell with the row checkbox. The whole cell is a click target (a
 * larger hit area on touch) and stops propagation, so the row click still
 * opens the card everywhere else.
 */
export function SelectCell({ selection, id, label, disabled }: { selection: RowSelection; id: string; label: string; disabled?: boolean }) {
  return (
    <TableCell
      className={cn(cellCls, !disabled && 'cursor-default')}
      onClick={e => {
        e.stopPropagation()
        if (!disabled && e.target === e.currentTarget) selection.toggle(id)
      }}
    >
      <SelectCheckbox
        checked={selection.isSelected(id)}
        onCheckedChange={v => selection.toggle(id, v)}
        label={label}
        disabled={disabled}
        className="translate-y-[2px]"
      />
    </TableCell>
  )
}

// ---------------------------------------------------------------------------
// Bulk bar

const noopSubscribe = () => () => {}

export interface BulkProgress {
  done: number
  total: number
}

/**
 * Floating bar at the bottom of the screen while rows are selected:
 * «Выбрано N», the actions (`children`, Buttons size="sm") and «Снять выделение».
 * While `progress` is set, the actions are replaced by a progress line.
 */
export function BulkBar({
  count,
  onClear,
  children,
  progress,
  summary,
}: {
  count: number
  onClear: () => void
  children?: React.ReactNode
  progress?: BulkProgress | null
  /** Extra text after the count, e.g. a sum: «· 12 400 TJS». */
  summary?: React.ReactNode
}) {
  // Portals need the DOM: render nothing on the server pass
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false)

  const visible = count > 0 || !!progress
  if (!visible || !mounted) return null

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <>
      {/* Keeps the last rows reachable above the bar */}
      <div aria-hidden className="h-20" />
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5">
          <div
            role="region"
            aria-label="Действия с выбранными"
            className="pointer-events-auto relative flex w-full max-w-2xl animate-in flex-wrap items-center gap-x-2 gap-y-2 overflow-hidden rounded-xl border bg-card py-2 pr-2 pl-4 text-sm shadow-pop duration-200 ease-[var(--ease-out)] fade-in slide-in-from-bottom-4 sm:w-auto sm:flex-nowrap"
          >
            <div className="mr-auto flex min-w-0 items-baseline gap-1.5 py-1 sm:mr-2" aria-live="polite">
              {progress ? (
                <span className="font-medium">
                  Обработано <span className="num">{formatNumber(progress.done)}</span> из <span className="num">{formatNumber(progress.total)}</span>…
                </span>
              ) : (
                <>
                  <span className="font-medium whitespace-nowrap">
                    Выбрано <span className="num">{formatNumber(count)}</span>
                  </span>
                  {summary && <span className="num truncate text-muted-foreground">{summary}</span>}
                </>
              )}
            </div>
            {!progress && (
              <>
                <div className="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:w-full [&>*]:max-sm:flex-1">{children}</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground max-sm:size-8 max-sm:px-0"
                  onClick={onClear}
                  aria-label="Снять выделение"
                >
                  <X /> <span className="max-sm:hidden">Снять выделение</span>
                </Button>
              </>
            )}
            {progress && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Running a bulk action

/** fetch() that throws with the server's `error` message on failure. */
export async function requestOk(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `Ошибка ${res.status}`)
  return body
}

export interface BulkMessages<T> {
  /** Toast title on success, e.g. «Статус изменён». */
  done: string
  /** Word forms for the count, e.g. ['сотрудник', 'сотрудника', 'сотрудников']. */
  noun: [string, string, string]
  /** Name of an item for the error description. */
  label?: (item: T) => string
}

/**
 * Runs one request per item, sequentially (gentle on the server and keeps
 * the audit log in order), reports progress for `BulkBar` and finishes with a
 * toast summary of successes and failures.
 *
 *   const bulk = useBulkRunner()
 *   await bulk.run(items, it => requestOk(`/api/x/${it.id}`, { method: 'PUT', … }), { done: 'Готово', noun: [...] })
 *   <BulkBar progress={bulk.progress} … />
 */
export function useBulkRunner() {
  const [progress, setProgress] = React.useState<BulkProgress | null>(null)

  const run = React.useCallback(async <T,>(items: T[], fn: (item: T) => Promise<unknown>, msg: BulkMessages<T>) => {
    const total = items.length
    let ok = 0
    const failures: { item: T; error: string }[] = []
    setProgress({ done: 0, total })
    for (let i = 0; i < items.length; i++) {
      try {
        await fn(items[i])
        ok++
      } catch (err) {
        failures.push({ item: items[i], error: (err instanceof Error && err.message) || 'Ошибка' })
      }
      setProgress({ done: i + 1, total })
    }
    setProgress(null)

    const words = (n: number) => `${formatNumber(n)} ${plural(n, msg.noun)}`
    const firstError = failures[0] ? `${msg.label ? `${msg.label(failures[0].item)}: ` : ''}${failures[0].error}` : undefined
    if (!failures.length) toast.success(msg.done, { description: words(ok) })
    else if (!ok) toast.error('Не удалось выполнить действие', { description: `${words(failures.length)} · ${firstError}` })
    else
      toast.warning(`Готово ${formatNumber(ok)} из ${formatNumber(total)}`, {
        description: `Не получилось: ${words(failures.length)}. ${firstError}`,
      })
    return { ok, failed: failures.length, failures }
  }, [])

  return { run, progress, running: !!progress }
}
