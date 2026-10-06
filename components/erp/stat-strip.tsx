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
  const cols =
    stats.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : stats.length === 2 ? 'sm:grid-cols-2' : ''
  return (
    <section
      className={cn('grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border shadow-xs', cols, className)}
    >
      {stats.map((s, i) => {
        const Comp = s.onClick ? 'button' : 'div'
        return (
          <Comp
            key={i}
            onClick={s.onClick}
            className={cn('bg-card px-5 py-4 text-left', s.onClick && 'transition-colors hover:bg-accent')}
          >
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {s.dot && <span className="size-2 rounded-full" style={{ background: s.dot }} />}
              {s.label}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <>
                <p className={cn('num mt-1 text-2xl font-semibold tracking-tight', toneCls[s.tone ?? 'default'])}>{s.value}</p>
                {s.sub && <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>}
              </>
            )}
          </Comp>
        )
      })}
    </section>
  )
}
