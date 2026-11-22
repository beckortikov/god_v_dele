'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft, Trash2, UserPlus, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/erp/confirm'
import { COMMENT_MAX, describeMark, type AttendeeComment } from '@/lib/event-funnel'

/** «20 ноя, 14:32»; the year only when it is not this year. */
export function commentTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace('.', '')
  return `${day}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

/** `base` is the attendee's API url, e.g. /api/calls/<event>/attendees/<id>. */
export async function postComment(base: string, body: string): Promise<AttendeeComment> {
  const res = await fetch(`${base}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || result.error) throw new Error(result.message || result.error || `Ошибка ${res.status}`)
  return result.data
}

const ACTION_ICON = { stage: ArrowRightLeft, payment: Wallet, added: UserPlus } as const

/**
 * One person's feed: call notes and who did what (stage changes, payments, adding to the list),
 * each with the author and time. A note is saved at once, apart from the sheet's «Сохранить»;
 * the draft lives in the parent so that saving the sheet keeps an unsent note too.
 */
export function AttendeeComments({
  base,
  draft,
  setDraft,
  onChanged,
}: {
  base: string
  draft: string
  setDraft: (v: string) => void
  onChanged: () => void
}) {
  const confirm = useConfirm()
  const [items, setItems] = React.useState<AttendeeComment[] | null>(null)
  const [unavailable, setUnavailable] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setItems(null)
    setUnavailable(null)
    fetch(`${base}/comments`)
      .then(async r => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!alive) return
        if (!ok || body.error) {
          setUnavailable(body.message || body.error || 'Не удалось загрузить историю')
          setItems([])
        } else setItems(body.data ?? [])
      })
      .catch(() => alive && (setUnavailable('Не удалось загрузить историю'), setItems([])))
    return () => {
      alive = false
    }
  }, [base])

  const add = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const made = await postComment(base, text)
      setItems(list => [made, ...(list ?? [])])
      setDraft('')
      onChanged()
    } catch (err: any) {
      toast.error('Не удалось добавить комментарий', { description: err.message })
    } finally {
      setSending(false)
    }
  }

  const remove = async (c: AttendeeComment) => {
    const ok = await confirm({ title: 'Удалить комментарий?', description: c.body.slice(0, 140), confirmText: 'Удалить', destructive: true })
    if (!ok) return
    const prev = items
    setItems(list => (list ?? []).filter(x => x.id !== c.id))
    try {
      const res = await fetch(`${base}/comments/${c.id}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      onChanged()
    } catch (err: any) {
      setItems(prev)
      toast.error('Не удалось удалить', { description: err.message })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <Textarea
          id="att-comment"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={COMMENT_MAX}
          placeholder="Что сказал: перезвонить после зарплаты, едет с партнёром…"
          className="min-h-14"
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              add()
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{draft.trim() ? '⌘/Ctrl + Enter: добавить' : ''}</span>
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim() || sending}>
            {sending ? 'Добавляю…' : 'Добавить комментарий'}
          </Button>
        </div>
      </div>

      {items === null ? (
        <div className="grid gap-2 pt-1">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-4/5" />
        </div>
      ) : unavailable ? (
        <p className="text-xs text-muted-foreground">{unavailable}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока ничего: ни комментариев, ни отметок</p>
      ) : (
        <ol className="flex flex-col">
          {items.map(c => {
            const kind = c.kind || 'note'
            if (kind !== 'note') {
              const Icon = ACTION_ICON[kind]
              return (
                <li key={c.id} className="flex items-start gap-2 border-l-2 border-transparent py-1.5 pl-3 text-xs text-muted-foreground">
                  <Icon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-medium text-foreground/85">{c.author_name || 'Без имени'}</span>
                    <span className="text-foreground/80">: {describeMark(c)}</span>
                    <span className="num"> · {commentTime(c.created_at)}</span>
                  </span>
                </li>
              )
            }
            return (
              <li key={c.id} className="group relative border-l-2 border-primary/50 py-2 pr-8 pl-3">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/85">{c.author_name || 'Без имени'}</span>
                  <span className="num"> · {commentTime(c.created_at)}</span>
                </div>
                <p className={cn('mt-0.5 text-sm whitespace-pre-wrap break-words')}>{c.body}</p>
                {c.can_delete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Удалить комментарий"
                    className="absolute top-1.5 right-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60"
                    onClick={() => remove(c)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
