'use client'

import * as React from 'react'
import { Loader2, PlugZap, RotateCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Panel } from '@/components/erp/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber } from '@/lib/format'

export interface TelegramSetupInfo {
  configured: boolean
  botUsername: string | null
  hasToken?: boolean
  hasSecret?: boolean
  migrationApplied?: boolean | null
  expectedUrl?: string
  usernameMismatch?: boolean
  bot?: { id: number; username?: string; first_name?: string } | null
  webhook?: {
    url: string
    pending_update_count: number
    last_error_date?: number
    last_error_message?: string
  } | null
}

/** Admin card: bot status, webhook status, «Подключить вебхук» and setup instructions. */
export function TelegramSettings() {
  const [info, setInfo] = React.useState<TelegramSetupInfo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/telegram/setup', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.message || json.error || 'Не удалось получить статус бота')
      } else {
        setError(null)
        setInfo(json)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const connect = async () => {
    const res = await fetch('/api/telegram/setup', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (json.configured === false) throw new Error('Сначала добавьте токен и имя бота в переменные окружения.')
    if (!res.ok) throw new Error(json.message || json.error || 'Не удалось подключить вебхук')
    await load()
  }

  return <TelegramSettingsView info={info} error={error} loading={loading} onReload={load} onConnect={connect} />
}

/** Presentational part, exported for previews. */
export function TelegramSettingsView({
  info,
  error,
  loading,
  onReload,
  onConnect,
}: {
  info: TelegramSetupInfo | null
  error?: string | null
  loading?: boolean
  onReload?: () => void
  onConnect?: () => Promise<void>
}) {
  const [connecting, setConnecting] = React.useState(false)

  const webhookUrl = info?.webhook?.url || ''
  const webhookOk = !!webhookUrl && webhookUrl === info?.expectedUrl
  const canConnect = !!info?.configured && !!info?.hasSecret

  async function handleConnect() {
    if (!onConnect) return
    setConnecting(true)
    try {
      await onConnect()
      toast.success('Вебхук подключён', { description: 'Бот готов принимать сообщения.' })
    } catch (e) {
      toast.error('Не удалось подключить вебхук', { description: (e as Error).message })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Send className="size-[18px]" />
        </span>
        <div className="min-w-[min(100%,15rem)] flex-1">
          <h3 className="font-semibold">Telegram-бот</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Напоминания об оплате участникам. Участники привязывают Telegram в личном кабинете.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onReload && (
            <Button type="button" size="icon-sm" variant="ghost" onClick={onReload} disabled={loading} aria-label="Обновить статус">
              <RotateCw className={loading ? 'animate-spin' : undefined} />
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleConnect} disabled={!canConnect || connecting}>
            {connecting ? <Loader2 className="animate-spin" /> : <PlugZap />}
            {webhookOk ? 'Переподключить вебхук' : 'Подключить вебхук'}
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 sm:px-5">
        {loading && !info ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : error ? (
          <p className="rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">{error}</p>
        ) : info ? (
          <dl className="divide-y text-sm">
            <StatusRow label="Бот">
              {info.configured ? (
                <>
                  <Badge variant="success">Подключён</Badge>
                  <a
                    href={`https://t.me/${info.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate underline-offset-4 hover:text-primary hover:underline"
                  >
                    @{info.botUsername}
                  </a>
                  {info.usernameMismatch && info.bot?.username && (
                    <span className="text-xs text-warning">У токена другой бот: @{info.bot.username}. Исправьте TELEGRAM_BOT_USERNAME.</span>
                  )}
                </>
              ) : (
                <>
                  <Badge variant="secondary">Не подключён</Badge>
                  <span className="text-muted-foreground">
                    {info.hasToken ? 'Не указан TELEGRAM_BOT_USERNAME' : 'Telegram-бот ещё не подключён'}
                  </span>
                </>
              )}
            </StatusRow>

            <StatusRow label="Секрет вебхука">
              {info.hasSecret ? <Badge variant="success">Задан</Badge> : <Badge variant="warning">Не задан</Badge>}
            </StatusRow>

            <StatusRow label="База данных">
              {info.migrationApplied === true && <Badge variant="success">Готова</Badge>}
              {info.migrationApplied === false && (
                <>
                  <Badge variant="warning">Нужна миграция</Badge>
                  <span className="text-muted-foreground">Примените migrations/015_telegram.sql</span>
                </>
              )}
              {info.migrationApplied == null && <span className="text-muted-foreground">Не удалось проверить</span>}
            </StatusRow>

            <StatusRow label="Вебхук">
              {!info.configured ? (
                <span className="text-muted-foreground">Появится после подключения бота</span>
              ) : webhookOk ? (
                <>
                  <Badge variant="success">Работает</Badge>
                  {!!info.webhook?.pending_update_count && (
                    <span className="text-muted-foreground">в очереди {formatNumber(info.webhook.pending_update_count)}</span>
                  )}
                </>
              ) : webhookUrl ? (
                <>
                  <Badge variant="warning">Другой адрес</Badge>
                  <span className="truncate font-mono text-xs text-muted-foreground" title={webhookUrl}>
                    {webhookUrl}
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="warning">Не подключён</Badge>
                  <span className="text-muted-foreground">Нажмите «Подключить вебхук»</span>
                </>
              )}
            </StatusRow>

            {info.webhook?.last_error_message && (
              <StatusRow label="Последняя ошибка">
                <span className="text-destructive">{info.webhook.last_error_message}</span>
                {info.webhook.last_error_date && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(info.webhook.last_error_date * 1000).toLocaleString('ru-RU')}
                  </span>
                )}
              </StatusRow>
            )}
          </dl>
        ) : null}
      </div>

      <details className="border-t px-4 py-3 text-sm sm:px-5" open={!info?.configured || undefined}>
        <summary className="cursor-pointer font-medium text-foreground select-none">Как подключить бота</summary>
        <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-muted-foreground marker:text-muted-foreground">
          <li>
            В Telegram откройте <span className="text-foreground">@BotFather</span>, отправьте <Code>/newbot</Code>, задайте название
            (например, «Год в деле») и имя бота, оканчивающееся на <Code>bot</Code>. BotFather пришлёт токен.
          </li>
          <li>
            В Vercel откройте проект → Settings → Environment Variables и добавьте:
            <ul className="mt-1.5 space-y-1">
              <li>
                <Code>TELEGRAM_BOT_TOKEN</Code> — токен от BotFather;
              </li>
              <li>
                <Code>TELEGRAM_BOT_USERNAME</Code> — имя бота без @;
              </li>
              <li>
                <Code>TELEGRAM_WEBHOOK_SECRET</Code> — случайная строка из латиницы и цифр, 32+ символа.
              </li>
            </ul>
            Затем сделайте Redeploy, чтобы переменные применились.
          </li>
          <li>
            В Supabase → SQL Editor выполните <Code>migrations/015_telegram.sql</Code>.
          </li>
          <li>Откройте эту страницу на опубликованном сайте (https) и нажмите «Подключить вебхук».</li>
          <li>Проверьте: в карточке участника получите ссылку для привязки, откройте её в Telegram и нажмите «Старт».</li>
        </ol>
      </details>
    </Panel>
  )
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-3 py-2.5 max-sm:grid-cols-1 max-sm:gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>
}
