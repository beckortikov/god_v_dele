'use client'

import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface ComboOption {
  value: string
  label: string
  hint?: string
  group?: string
  keywords?: string
}

export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  searchPlaceholder = 'Поиск…',
  emptyText = 'Ничего не найдено',
  className,
  size = 'default',
  invalid,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  size?: 'sm' | 'default'
  invalid?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find(o => o.value === value)

  const groups = React.useMemo(() => {
    const map = new Map<string, ComboOption[]>()
    for (const o of options) {
      const g = o.group ?? ''
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(o)
    }
    return Array.from(map.entries())
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs transition-[border-color,box-shadow] outline-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive dark:bg-input/25',
            size === 'sm' ? 'h-8' : 'h-9',
            className
          )}
        >
          <span className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
            {selected?.hint && <span className="ml-1.5 text-muted-foreground">· {selected.hint}</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group || '_'} heading={group || undefined}>
                {items.map(o => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''} ${o.value}`}
                    onSelect={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-4 !text-primary', o.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
