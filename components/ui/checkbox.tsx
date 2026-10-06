'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { CheckIcon, MinusIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/** shadcn-style checkbox. Pass `checked="indeterminate"` for a partial selection. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input bg-card shadow-xs transition-[color,background-color,border-color,box-shadow] duration-150 outline-none',
        'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-40 dark:bg-input/30',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        // `dark:bg-input/30` would otherwise win over the checked fill
        'dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="group/ind flex items-center justify-center text-current">
        <CheckIcon className="size-3.5 group-data-[state=indeterminate]/ind:hidden" strokeWidth={3} />
        <MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/ind:block" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
