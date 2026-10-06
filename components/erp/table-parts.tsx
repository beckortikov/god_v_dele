import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel } from '@/components/erp/page-header'

/** Footer line with the total of the visible rows. */
export function TotalsBar({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: 'success' | 'destructive' }) {
  return (
    <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2.5 text-sm sm:px-4">
      <span className="text-muted-foreground">Итого · {label}</span>
      <span className={cn('num font-semibold', tone === 'success' && 'text-success', tone === 'destructive' && 'text-destructive')}>{value}</span>
    </div>
  )
}

export function TableSkeleton({ rows = 8, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <Panel>
      {toolbar && (
        <div className="border-b px-4 py-2.5">
          <Skeleton className="h-8 w-72 max-w-full" />
        </div>
      )}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 max-sm:hidden" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Panel>
  )
}

/**
 * Row actions that appear on hover on devices with a mouse and are always
 * visible on touch. Put `group` on the <TableRow>.
 */
export const rowActionsCls =
  'flex items-center justify-end gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 transition-opacity'

/** Ghost icon button class for a destructive row action. */
export const dangerIconCls = 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive'

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1.5 py-px font-sans text-[11px] text-muted-foreground">{children}</kbd>
}
