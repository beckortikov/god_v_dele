'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'light'}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group !bg-popover !text-popover-foreground !border-border !shadow-pop !rounded-xl !font-sans',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground !rounded-md !font-medium',
          cancelButton: '!bg-muted !text-muted-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-destructive',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
