'use client'

import * as React from 'react'
import { BadgeCheck, Copy, Link2, Loader2, MessageCircle, Phone, RotateCw, Send, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/erp/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import { formatPhone, phoneForWhatsApp, telegramDisplayName } from '@/lib/telegram'
import {
  TelegramNotConfiguredError,
  copyText,
  createTelegramLink,
  unlinkTelegram,
  useTelegramLink,
  type TelegramLinkState,
} from '@/components/telegram/use-telegram'

/**
 * Telegram section for the admin's participant detail sheet: status, a
 * personal link to send (copy or WhatsApp) and unlinking.
 */
export function TelegramAdminPanel({
  participantId,
  participantName,
  participantPhone,
}: {
  participantId: string
  participantName: string
  participantPhone?: string | null
}) {
  const { state, reload, watch, stopWatching, watching } = useTelegramLink(participantId)
  return (
    <TelegramAdminPanelView
      participantName={participantName}
      participantPhone={participantPhone}
      state={state}
      watching={watching}
      onReload={() => void reload()}
      onCreateLink={async () => {
        const res = await createTelegramLink(participantId)
        watch()
        return res
      }}
      onUnlink={async () => {
        await unlinkTelegram(participantId)
        stopWatching()
        await reload({ silent: true })
      }}
    />
  )
}

/** wa.me link with a ready message; without a phone WhatsApp asks whom to send it to. */
export function whatsappShareUrl(phone: string | null | undefined, url: string) {
  const text =
    `Здравствуйте! Чтобы получать напоминания об оплате «Год в деле» в Telegram, ` +
    `откройте ссылку и нажмите «Старт»: ${url}\n\nСсылка личная, не пересылайте её.`
  const to = phoneForWhatsApp(phone)
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}

/** Presentational part, exported for previews. */
export function TelegramAdminPanelView({
  participantName,
  participantPhone,
  state,
  watching = false,
  onReload,
  onCreateLink,
  onUnlink,
  initialLink = null,
}: {
  participantName: string
  participantPhone?: string | null
  state: TelegramLinkState
  watching?: boolean
  onReload?: () => void
  onCreateLink?: () => Promise<{ url: string; expiresAt: string }>
  onUnlink?: () => Promise<void>
  /** Pre-filled link, for previews. */
  initialLink?: { url: string; expiresAt: string } | null
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState<null | 'link' | 'unlink'>(null)
  const [invite, setInvite] = React.useState<{ url: string; expiresAt: string } | null>(initialLink)
  const link = state.status === 'ready' ? state.link : null

  async function handleCreate() {
    if (!onCreateLink) return
    setBusy('link')
    try {
      const res = await onCreateLink()
      setInvite(res)
      if (await copyText(res.url)) toast.success('Ссылка скопирована', { description: 'Отправьте её участнику.' })
    } catch (e) {
      if (e instanceof TelegramNotConfiguredError) toast.error('Telegram-бот ещё не подключён')
      else toast.error('Не удалось получить ссылку', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function handleCopy() {
    if (!invite) return
    if (await copyText(invite.url)) toast.success('Ссылка скопирована')
    else toast.error('Не удалось скопировать')
  }

  async function handleUnlink() {
    if (!onUnlink) return
    const ok = await confirm({
      title: 'Отвязать Telegram?',
      description: `${participantName} перестанет получать напоминания в Telegram. Привязать снова можно по новой ссылке.`,
      confirmText: 'Отвязать',
      destructive: true,
    })
    if (!ok) return
    setBusy('unlink')
    try {
      await onUnlink()
      setInvite(null)
      toast.success('Telegram отвязан')
    } catch (e) {
      toast.error('Не удалось отвязать Telegram', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Telegram</h3>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <Send className="size-4 shrink-0 text-muted-foreground" />

          {state.status === 'loading' && <Skeleton className="h-4 w-40" />}

          {state.status === 'unavailable' && state.reason !== 'error' && (
            <span className="text-sm text-muted-foreground">Telegram-бот ещё не подключён</span>
          )}

          {state.status === 'unavailable' && state.reason === 'error' && (
            <>
              <span className="text-sm text-muted-foreground">Не удалось загрузить статус</span>
              {onReload && (
                <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={onReload}>
                  <RotateCw /> Повторить
                </Button>
              )}
            </>
          )}

          {state.status === 'ready' && !link && (
            <>
              <span className="text-sm text-muted-foreground">Не привязан</span>
              <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={handleCreate} disabled={busy !== null}>
                {busy === 'link' ? <Loader2 className="animate-spin" /> : <Link2 />}
                Ссылка для привязки
              </Button>
            </>
          )}

          {state.status === 'ready' && link && (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{telegramDisplayName(link)}</p>
                <p className="text-xs text-muted-foreground">с {formatDate(link.linkedAt, 'long')}</p>
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                onClick={handleUnlink}
                disabled={busy !== null}
              >
                {busy === 'unlink' ? <Loader2 className="animate-spin" /> : <Unlink />}
                Отвязать
              </Button>
            </>
          )}
        </div>

        {state.status === 'ready' && link && !link.phoneVerified && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {link.phone
              ? `В Telegram указан ${formatPhone(link.phone)}, он не совпадает с телефоном в карточке.`
              : 'Участник ещё не поделился номером в боте.'}
          </p>
        )}

        {state.status === 'ready' && !link && invite && (
          <div className="space-y-2 border-t bg-muted/40 px-3 py-2.5">
            <div className="flex gap-2">
              <Input
                readOnly
                value={invite.url}
                aria-label="Ссылка для привязки Telegram"
                className="h-8 bg-card font-mono text-xs"
                onFocus={e => e.currentTarget.select()}
              />
              <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                <Copy /> <span className="max-sm:sr-only">Копировать</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Действует до {formatDate(invite.expiresAt, 'long')}
                {watching && (
                  <span className="ml-2 inline-flex items-center gap-1" aria-live="polite">
                    <Loader2 className="size-3 animate-spin" /> ждём привязку
                  </span>
                )}
              </span>
              <Button asChild size="xs" variant="ghost">
                <a href={whatsappShareUrl(participantPhone, invite.url)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle /> Отправить в WhatsApp
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
