import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1600px] px-3 pt-5 pb-10 sm:px-6 sm:pt-6', className)} {...props} />
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Bordered surface for tables and panels. */
export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('overflow-hidden rounded-xl border bg-card shadow-xs', className)} {...props} />
}

export function PanelToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4', className)} {...props} />
}
