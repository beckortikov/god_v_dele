import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export function Field({
  label,
  htmlFor,
  hint,
  required,
  aside,
  className,
  children,
}: {
  label: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  required?: boolean
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/85">
          <span>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </span>
        </Label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-4', className)} {...props} />
}
