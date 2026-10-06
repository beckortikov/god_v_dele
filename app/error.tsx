'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/erp/error-boundary'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xs">
        <ErrorFallback error={error} onRetry={reset} />
      </div>
    </main>
  )
}
