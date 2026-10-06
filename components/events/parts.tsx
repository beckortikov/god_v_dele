'use client'

import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Single-choice pill group: one click instead of opening a select. */
export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  'aria-label'?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
              active
                ? 'border-primary bg-primary-soft font-medium text-primary-soft-foreground'
                : 'border-input bg-card text-foreground/80 hover:border-ring/40 hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Visual checkbox (the row itself handles the click). */
export function CheckMark({ checked, indeterminate, className }: { checked: boolean; indeterminate?: boolean; className?: string }) {
  const on = checked || indeterminate
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
        className
      )}
    >
      {indeterminate && !checked ? <Minus className="size-3" strokeWidth={3} /> : checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  )
}

/** Small round initials avatar. */
export function Initials({ name, guest }: { name: string; guest?: boolean }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        guest ? 'bg-info-soft text-info' : 'bg-muted text-muted-foreground'
      )}
    >
      {letters || '·'}
    </span>
  )
}
