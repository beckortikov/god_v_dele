'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU } from '@/lib/format'

/** «сен 26» for chart axes. */
export const shortMonth = (year: number, month: number) => `${MONTHS_SHORT_RU[month - 1]} ${String(year).slice(2)}`

/** «Сентябрь 2026» for tables. */
export const longMonth = (year: number, month: number) => `${MONTHS_RU[month - 1]} ${year}`

/** 0.934 → «93%»; null → «—». */
export const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`)

export const numCell = 'num text-right whitespace-nowrap'

/** Muted footnote at the bottom of a panel (formulas, data caveats). */
export function SectionNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('border-t px-3 py-2.5 text-xs text-muted-foreground sm:px-4', className)}>{children}</p>
}

/** Keyboard-accessible clickable table row props. */
export function rowLinkProps(onOpen: () => void) {
  return {
    role: 'link' as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
    className: 'group cursor-pointer outline-none focus-visible:bg-accent',
  }
}
