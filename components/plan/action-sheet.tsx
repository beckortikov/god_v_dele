'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, ExternalLink, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/format'
import { addDays, shortDate } from '@/lib/sprints'
import { actionState, dueHint, type OpAction, type OpExcuse } from '@/lib/op-plan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useConfirm } from '@/components/erp/confirm'
import { PriorityMark, StatePill, planApi, usd } from './plan-shared'

type Choice = 'done' | 'excuse'

/** One action: what, by when and for how much, and the result: «Сделано» or «Отмазка». */
export function ActionSheet({
  action,
  excuses,
  place,
  participantId,
  readOnly = false,
  onClose,
  onEdit,
  onChanged,
}: {
  action: OpAction | null
  excuses: OpExcuse[]
  /** «Стратегия · Юридические вопросы» */
  place: string
  participantId: string
  /** A curator's view: the result and the history are shown, nothing can be changed. */
  readOnly?: boolean
  onClose: () => void
  onEdit: (a: OpAction) => void
  onChanged: () => Promise<void> | void
}) {
  const confirm = useConfirm()
  const today = todayISO()
  const [choice, setChoice] = React.useState<Choice | null>(null)
  const [note, setNote] = React.useState('')
  const [link, setLink] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [newDue, setNewDue] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const id = action?.id

  React.useEffect(() => {
    if (!action) return
    setChoice(null)
    setNote('')
    setLink('')
    setReason('')
    setNewDue(addDays(today, 7))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!action) return <Sheet open={false} onOpenChange={o => !o && onClose()} />
  const state = actionState(action, excuses, today)
  const overdue = state === 'waiting'
  const paid = excuses.reduce((s, e) => s + e.price, 0)

  const send = async (json: Record<string, unknown>, ok: string) => {
    setSaving(true)
    try {
      await planApi(participantId, `/actions/${action.id}/result`, { method: 'POST', json })
      toast.success(ok)
      await onChanged()
      if (json.type !== 'reopen') onClose()
    } catch (e) {
      toast.error('Не получилось сохранить', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Удалить действие?',
      description: `«${action.title}» исчезнет из плана вместе с историей отмазок.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await planApi(participantId, `/actions/${action.id}`, { method: 'DELETE' })
      toast.success('Действие удалено')
      onClose()
      await onChanged()
    } catch (e) {
      toast.error('Не удалось удалить', { description: (e as Error).message })
    }
  }

  return (
    <Sheet open onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatePill state={state} />
              <span className={cn('num inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium', overdue ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground')}>
                {action.due_date ? `${shortDate(action.due_date)} · ${dueHint(action.due_date, today)}` : 'без срока'}
              </span>
              <PriorityMark p={action.priority} />
            </div>
            <SheetTitle className="text-[22px] leading-tight font-bold tracking-tight">{action.title}</SheetTitle>
            <SheetDescription>{place}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Индикатор результата</dt>
                <dd className="mt-0.5 font-medium">{action.indicator || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ответственные</dt>
                <dd className="mt-0.5 font-medium">{action.owners.length ? action.owners.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Цена слова</dt>
                <dd className="num mt-0.5 font-medium">{usd(action.price)}</dd>
              </div>
            </dl>

            {action.status === 'done' ? (
              <section className="space-y-3 rounded-2xl bg-success-soft p-4">
                <p className="flex items-center gap-2 font-semibold text-success">
                  <Check className="size-4" strokeWidth={3} />
                  Сделано{action.done_at ? ` ${shortDate(action.done_at.slice(0, 10))}` : ''}
                </p>
                {action.result_note && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{action.result_note}</p>}
                {action.result_link && (
                  <a href={action.result_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
                    <ExternalLink className="size-4" />
                    Открыть результат
                  </a>
                )}
                {!readOnly && (
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => send({ type: 'reopen' }, 'Действие снова в работе')}>
                    <RotateCcw />
                    Вернуть в работу
                  </Button>
                )}
              </section>
            ) : readOnly ? (
              overdue && (
                <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm">Срок прошёл, участник ещё не отметил итог: сделано или отмазка.</p>
              )
            ) : (
              <section className="space-y-4 rounded-2xl border bg-card p-4">
                <h3 className="text-[17px] font-semibold">{overdue ? 'Срок прошёл. Что с результатом?' : 'Итог'}</h3>
                <div role="radiogroup" aria-label="Итог" className="grid grid-cols-2 gap-2">
                  <ChoiceCard
                    on={choice === 'done'}
                    onClick={() => setChoice('done')}
                    tone="success"
                    icon={<Check className="size-4" strokeWidth={3} />}
                    title="Сделано"
                    hint="Комментарий или ссылка на результат"
                  />
                  <ChoiceCard
                    on={choice === 'excuse'}
                    onClick={() => setChoice('excuse')}
                    tone="destructive"
                    icon={<X className="size-4" strokeWidth={3} />}
                    title="Отмазка"
                    hint="Отдаю цену слова, ставлю новый срок"
                  />
                </div>

                {choice === 'done' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="pr-note" className="text-[13px] font-medium">Что получилось</label>
                      <Textarea id="pr-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Коротко о результате (необязательно)" className="min-h-24 resize-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="pr-link" className="text-[13px] font-medium">Ссылка на результат</label>
                      <Input id="pr-link" type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" />
                    </div>
                    <Button className="w-full" disabled={saving} onClick={() => send({ type: 'done', note, link }, 'Отлично, отмечено как сделано')}>
                      Отметить сделанным
                    </Button>
                  </div>
                )}

                {choice === 'excuse' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="pr-reason" className="text-[13px] font-medium">Почему не сделано</label>
                      <Textarea id="pr-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Честно, одной-двумя фразами" className="min-h-24 resize-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="pr-due" className="text-[13px] font-medium">Новый срок</label>
                      <div className="flex flex-wrap gap-2">
                        <Input id="pr-due" type="date" min={today} value={newDue} onChange={e => setNewDue(e.target.value)} className="w-auto min-w-40 flex-1" />
                        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => setNewDue(addDays(today, 3))}>+3 дня</Button>
                        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => setNewDue(addDays(today, 7))}>+1 нед</Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-destructive-soft px-3.5 py-3">
                      <span className="text-[13px] leading-snug text-[color-mix(in_oklch,var(--destructive)_70%,var(--foreground))]">Цена слова уйдёт в «Отдано», отмазка останется в истории</span>
                      <span className="num shrink-0 text-[17px] font-bold text-destructive">−{usd(action.price)}</span>
                    </div>
                    <Button
                      className="w-full bg-foreground text-background hover:bg-foreground/90"
                      disabled={saving || !reason.trim()}
                      onClick={() => send({ type: 'excuse', reason, new_due: newDue || null }, 'Отмазка записана, новый срок поставлен')}
                    >
                      Зафиксировать отмазку
                    </Button>
                  </div>
                )}
              </section>
            )}

            {excuses.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-baseline justify-between text-sm font-semibold">
                  Отмазки
                  <span className="num text-sm font-medium text-destructive">−{usd(paid)}</span>
                </h3>
                <ol className="space-y-2">
                  {[...excuses].reverse().map(e => (
                    <li key={e.id} className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                      <p className="leading-relaxed">{e.reason}</p>
                      <p className="num mt-1 text-xs text-muted-foreground">
                        {shortDate(e.created_at.slice(0, 10))} · срок был {e.missed_due ? shortDate(e.missed_due) : '—'}
                        {e.new_due ? ` → ${shortDate(e.new_due)}` : ''} · −{usd(e.price)}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </SheetBody>

          {!readOnly && <SheetFooter className="pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" onClick={() => onEdit(action)}>
              <Pencil />
              Изменить
            </Button>
            <Button variant="ghost" className="ml-auto text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={remove}>
              <Trash2 />
              Удалить
            </Button>
          </SheetFooter>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ChoiceCard({
  on,
  onClick,
  tone,
  icon,
  title,
  hint,
}: {
  on: boolean
  onClick: () => void
  tone: 'success' | 'destructive'
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex min-h-24 flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        on && tone === 'success' && 'border-success bg-success-soft ring-1 ring-success',
        on && tone === 'destructive' && 'border-destructive bg-destructive-soft ring-1 ring-destructive',
        !on && 'hover:border-ring/40'
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full',
          tone === 'success' ? (on ? 'bg-success text-white' : 'bg-success-soft text-success') : on ? 'bg-destructive text-white' : 'bg-destructive-soft text-destructive'
        )}
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
    </button>
  )
}
