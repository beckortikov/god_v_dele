'use client'

import * as React from 'react'
import { AlertTriangle, Check, Copy, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ErrorWithDigest = Error & { digest?: string }

/** Plain-text report a user can paste into a chat with support. */
export function errorDetails(error: ErrorWithDigest | null | undefined, scope?: string) {
  const lines = [
    `Время: ${new Date().toISOString()}`,
    scope ? `Раздел: ${scope}` : null,
    typeof window !== 'undefined' ? `Адрес: ${window.location.href}` : null,
    typeof navigator !== 'undefined' ? `Браузер: ${navigator.userAgent}` : null,
    error?.digest ? `Код: ${error.digest}` : null,
    `Ошибка: ${error?.name ?? 'Error'}: ${error?.message || 'без описания'}`,
    error?.stack ? `\n${error.stack}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API is unavailable on http or in some webviews.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function ErrorFallback({
  error,
  scope,
  title = 'Что-то пошло не так',
  description = 'Мы не смогли показать этот экран. Данные не потеряны: обновите страницу, а если ошибка повторится, скопируйте детали и отправьте их администратору.',
  onRetry,
  className,
}: {
  error?: ErrorWithDigest | null
  scope?: string
  title?: string
  description?: React.ReactNode
  onRetry?: () => void
  className?: string
}) {
  const [copied, setCopied] = React.useState<'idle' | 'ok' | 'fail'>('idle')

  const handleCopy = async () => {
    const ok = await copyText(errorDetails(error, scope))
    setCopied(ok ? 'ok' : 'fail')
    window.setTimeout(() => setCopied('idle'), 2000)
  }

  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {error?.digest && <p className="mt-2 text-xs text-muted-foreground num">Код ошибки: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw />
          Обновить страницу
        </Button>
        <Button variant="outline" onClick={handleCopy}>
          {copied === 'ok' ? <Check /> : <Copy />}
          {copied === 'ok' ? 'Скопировано' : copied === 'fail' ? 'Не удалось скопировать' : 'Скопировать детали'}
        </Button>
        {onRetry && (
          <Button variant="ghost" onClick={onRetry}>
            <RotateCcw />
            Попробовать ещё раз
          </Button>
        )}
      </div>
    </div>
  )
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Human name of what is wrapped (page title), included in the copied details. */
  scope?: string
  /** Custom fallback; receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors in a subtree so one broken page does not take down the
 * app shell. Give it a `key` (e.g. the current page) to reset on navigation.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.scope ? `: ${this.props.scope}` : ''}]`, error, info.componentStack)
    this.props.onError?.(error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <ErrorFallback
        error={error}
        scope={this.props.scope}
        description="Этот раздел не загрузился. Остальные разделы работают: выберите другой в меню, обновите страницу или скопируйте детали для администратора."
        onRetry={this.reset}
      />
    )
  }
}
