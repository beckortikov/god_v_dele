'use client'

import * as React from 'react'
import { BadgeCheck, Copy, Loader2, Phone, RotateCw, Send, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Panel } from '@/components/erp/page-header'
import { useConfirm } from '@/components/erp/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { telegramDisplayName } from '@/lib/telegram'
import {
  TelegramNotConfiguredError,
  copyText,
  createTelegramLink,
  unlinkTelegram,
  useTelegramLink,
  type TelegramLinkState,
} from '@/components/telegram/use-telegram'

/**
 * Telegram card for the participant's own cabinet: link the account to get
 * payment reminders, see the status, unlink.
 */
export function TelegramLinkCard({ participantId, participantName }: { participantId: string; participantName?: string | null }) {
  const { state, reload, watch, stopWatching, watching } = useTelegramLink(participantId)
  return (
    <TelegramLinkCardView
      participantName={participantName}
      state={state}
      watching={watching}
      onReload={() => void reload()}
      onCreateLink={async () => {
        const { url } = await createTelegramLink(participantId)
        watch()
        return url
      }}
      onUnlink={async () => {
        await unlinkTelegram(participantId)
        stopWatching()
        await reload({ silent: true })
      }}
    />
  )
}

/**
 * Opens a t.me link in the tab opened during the click (so popup blockers
 * allow it). Returns false when no tab could be opened.
 */
function openDeepLink(url: string, pending: Window | null) {
  if (pending && !pending.closed) {
    pending.location.href = url
    return true
  }
  return !!window.open(url, '_blank', 'noopener')
}

/** Presentational part, exported for previews and tests. */
export function TelegramLinkCardView({
  participantName,
  state,
  watching = false,
  onReload,
  onCreateLink,
  onUnlink,
}: {
  participantName?: string | null
  state: TelegramLinkState
  watching?: boolean
  onReload?: () => void
  /** Creates (or reuses) the personal t.me link and starts watching for the link to appear. */
  onCreateLink?: () => Promise<string>
  onUnlink?: () => Promise<void>
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState<null | 'open' | 'copy' | 'unlink'>(null)
  const [lastUrl, setLastUrl] = React.useState<string | null>(null)

  const link = state.status === 'ready' ? state.link : null

  async function handleLink(target: 'open' | 'copy') {
    if (!onCreateLink) return
    // Open the tab inside the click handler; navigate it once the link is ready.
    const pending = target === 'open' ? window.open('about:blank', '_blank') : null
    if (pending) pending.opener = null
    setBusy(target)
    try {
      const url = await onCreateLink()
      setLastUrl(url)
      if (target === 'open') {
        if (!openDeepLink(url, pending)) toast.info('Откройте бота по ссылке ниже')
      } else if (await copyText(url)) toast.success('Ссылка скопирована', { description: 'Откройте её на телефоне, где установлен Telegram.' })
      else toast.error('Не удалось скопировать', { description: url })
    } catch (e) {
      pending?.close()
      if (e instanceof TelegramNotConfiguredError) toast.error('Telegram-бот ещё не подключён', { description: 'Попробуйте позже.' })
      else toast.error('Не удалось получить ссылку', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleUnlink() {
    if (!onUnlink) return
    const ok = await confirm({
      title: 'Отвязать Telegram?',
      description: 'Напоминания об оплате и новости перестанут приходить в Telegram. Привязать аккаунт снова можно в любой момент.',
      confirmText: 'Отвязать',
      destructive: true,
    })
    if (!ok) return
    setBusy('unlink')
    try {
      await onUnlink()
      toast.success('Telegram отвязан')
    } catch (e) {
      toast.error('Не удалось отвязать Telegram', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
          <Send className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold">Telegram</h3>
            {link && <Badge variant="success">Подключён</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {link
              ? 'Напоминания об оплате и важные новости приходят в Telegram.'
              : 'Получайте напоминания об оплате и важные новости в Telegram.'}
          </p>
        </div>
      </div>

      <div className="mt-4">
        {state.status === 'loading' && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-44" />
          </div>
        )}

        {state.status === 'unavailable' && state.reason !== 'error' && (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            Telegram-бот ещё не подключён. Как только он заработает, здесь можно будет привязать аккаунт.
          </p>
        )}

        {state.status === 'unavailable' && state.reason === 'error' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">Не удалось загрузить статус Telegram.</span>
            {onReload && (
              <Button type="button" size="sm" variant="ghost" onClick={onReload}>
                <RotateCw /> Повторить
              </Button>
            )}
          </div>
        )}

        {state.status === 'ready' && !link && (
          <div className="space-y-3">
            <ol className="space-y-1 text-sm text-muted-foreground">
              <li>1. Нажмите «Привязать Telegram», откроется наш бот.</li>
              <li>2. В боте нажмите «Старт», затем «Поделиться номером».</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => handleLink('open')} disabled={busy !== null}>
                {busy === 'open' ? <Loader2 className="animate-spin" /> : <Send />}
                Привязать Telegram
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => handleLink('copy')} disabled={busy !== null}>
                {busy === 'copy' ? <Loader2 className="animate-spin" /> : <Copy />}
                Скопировать ссылку
              </Button>
            </div>
            {watching && (
              <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm" aria-live="polite">
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                <p>
                  Ждём подтверждения из Telegram. Нажмите «Старт» в боте.{' '}
                  {lastUrl && (
                    <a href={lastUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-primary underline-offset-4 hover:underline">
                      Открыть бота
                    </a>
                  )}
                </p>
              </div>
            )}
            {participantName && (
              <p className="text-xs text-muted-foreground">Ссылка личная: по ней бот узнает, что это вы ({participantName}). Не пересылайте её другим.</p>
            )}
          </div>
        )}

        {state.status === 'ready' && link && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{telegramDisplayName(link)}</p>
                <p className="text-xs text-muted-foreground">Привязан {formatDate(link.linkedAt, 'long')}</p>
              </div>
              {link.phoneVerified ? (
                <Badge variant="success">
                  <BadgeCheck /> Телефон подтверждён
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Phone /> Телефон не подтверждён
                </Badge>
              )}
            </div>
            {!link.phoneVerified && (
              <p className="text-sm text-muted-foreground">
                {link.phone
                  ? 'Номер, которым вы поделились в Telegram, не совпадает с номером у нас. Сообщите менеджеру, если вы сменили номер.'
                  : 'Откройте бота и нажмите «Поделиться номером»: так мы убедимся, что это именно вы.'}
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                onClick={handleUnlink}
                disabled={busy !== null}
              >
                {busy === 'unlink' ? <Loader2 className="animate-spin" /> : <Unlink />}
                Отвязать
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
