import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface Stat {
  label: React.ReactNode
  value: React.ReactNode
  /** Small line under the value (count, delta, explanation). */
  sub?: React.ReactNode
  /** Colour dot before the label, e.g. 'var(--chart-income)'. */
  dot?: string
  tone?: 'default' | 'success' | 'destructive' | 'warning'
  onClick?: () => void
}

const toneCls = {
  default: '',
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
}

/**
 * One bordered surface split into equal cells. Use instead of a grid of
 * separate KPI cards.
 */
export function StatStrip({ stats, loading, className }: { stats: Stat[]; loading?: boolean; className?: string }) {
  // Phones: two columns (an odd last cell spans the row) so the strip stays short
  const cols =
    stats.length >= 4
      ? 'grid-cols-2 lg:grid-cols-4'
      : stats.length === 3
        ? 'grid-cols-2 sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2'
        : stats.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-1'
  return (
    <section
      className={cn('grid gap-px overflow-hidden rounded-xl border bg-border shadow-xs', cols, className)}
    >
      {stats.map((s, i) => {
        const Comp = s.onClick ? 'button' : 'div'
        return (
          <Comp
            key={i}
            onClick={s.onClick}
            className={cn('min-w-0 bg-card px-4 py-3.5 text-left sm:px-5 sm:py-4', s.onClick && 'transition-colors hover:bg-accent')}
          >
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground sm:text-sm">
              {s.dot && <span className="size-2 rounded-full" style={{ background: s.dot }} />}
              {s.label}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <>
                <p className={cn('num mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl', toneCls[s.tone ?? 'default'])}>{s.value}</p>
                {s.sub && <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>}
              </>
            )}
          </Comp>
        )
      })}
    </section>
  )
}
