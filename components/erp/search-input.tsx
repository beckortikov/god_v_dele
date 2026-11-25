'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The app's search field: a grey pill with a magnifier and a round clear button; Esc clears. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('group relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="h-9 w-full rounded-full border border-transparent bg-muted pr-9 pl-9 text-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground hover:bg-muted/80 focus:border-ring/40 focus:bg-card focus:shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/20 text-foreground/70 outline-none hover:bg-muted-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Очистить поиск"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
