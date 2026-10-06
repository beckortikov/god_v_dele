'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Mail,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Receipt as ReceiptIcon,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { dangerIconCls } from '@/components/erp/table-parts'
import { TelegramAdminPanel } from '@/components/telegram/telegram-admin-panel'
import { useParticipantPayments, type MonthRow, type Receipt } from '@/components/finance/use-ledger'
import { MONTHS_RU, MONTHS_SHORT_RU, formatDate, formatMoney, plural } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { SCHEDULE_STATUS, buildSchedule, monthRangeLabel, type ScheduleMonth } from '@/lib/payment-schedule'
import {
  PARTICIPANT_STATUS,
  monthlyTariff,
  type MonthlyPayment,
  type Participant,
  type ParticipantSummary,
} from '@/components/participants/types'

const monthsWord = (n: number) => plural(n, ['месяц', 'месяца', 'месяцев'])
const monthName = (m: { month: number; year: number }) => `${MONTHS_RU[m.month - 1]} ${m.year}`

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.error) throw new Error(json?.error || `Ошибка ${res.status}`)
  return json
}

export function ParticipantDetailSheet({
  open,
  participant,
  payments,
  summary,
  onOpenChange,
  onEdit,
  onArchive,
  onDelete,
  onAddPayment,
  onChanged,
}: {
  open: boolean
  /** Kept set while the sheet animates out. */
  participant: Participant | null
  /** This participant's payments only. */
  payments: MonthlyPayment[]
  summary: ParticipantSummary | null
  onOpenChange: (o: boolean) => void
  onEdit: (p: Participant) => void
  onArchive: (p: Participant) => void
  onDelete: (p: Participant) => void
  /** «Внести оплату» for a month: opens the payment sheet pre-filled. */
  onAddPayment?: (p: Participant, month: number, year: number) => void
  /** Payments changed here (schedule, plan, receipt removed): refresh the list. */
  onChanged?: () => void
}) {
  const p = participant
  const confirm = useConfirm()
  const info = useParticipantPayments(open && p ? p.id : null)
  // Fresh rows once loaded; the list's rows until then
  const rows: (MonthRow | MonthlyPayment)[] = info.forId === p?.id && !info.loading ? info.rows : payments
  const schedule = React.useMemo(() => (p ? buildSchedule(p, rows) : null), [p, rows])
  const receiptsByMonth = React.useMemo(() => {
    const m = new Map<string, Receipt[]>()
    for (const t of info.receipts) {
      const list = m.get(t.monthly_payment_id) ?? []
      list.push(t)
      m.set(t.monthly_payment_id, list)
    }
    for (const list of m.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    return m
  }, [info.receipts])

  const [expanded, setExpanded] = React.useState<Set<number>>(new Set())
  const [flash, setFlash] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setExpanded(new Set())
    setFlash(null)
  }, [p?.id])

  const changed = () => {
    info.reload()
    onChanged?.()
  }

  if (!p) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    )
  }

  const s = schedule!
  const overdue = s.overdueMonths
  const missing = s.months.filter(m => m.inProgram && !m.row)
  const firstOverdue = overdue[0]

  const toggle = (idx: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })

  const scrollToFirstOverdue = () => {
    if (!firstOverdue) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-month="${firstOverdue.idx}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
    setFlash(firstOverdue.idx)
    window.setTimeout(() => setFlash(f => (f === firstOverdue.idx ? null : f)), 1600)
  }

  const generateSchedule = async () => {
    if (!missing.length) return
    const ok = await confirm({
      title: 'Сформировать график?',
      description: `Будет создано ${missing.length} ${monthsWord(missing.length)} (${monthRangeLabel(missing, MONTHS_SHORT_RU)}) с планом ${formatMoney(
        monthlyTariff(p)
      )} в месяц. Уже внесённые месяцы и оплаты не изменятся.`,
      confirmText: 'Сформировать',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await send('/api/payments/schedule', { method: 'POST', body: JSON.stringify({ participant_ids: [p.id] }) })
      toast.success('График сформирован', {
        description: `Создано ${res.created} ${monthsWord(res.created)}${res.skipped ? `, уже были ${res.skipped}` : ''}`,
      })
      changed()
    } catch (err: any) {
      toast.error('Не удалось сформировать график', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const savePlan = async (m: ScheduleMonth<MonthRow | MonthlyPayment>, value: number) => {
    try {
      if (m.row?.id) {
        await send('/api/monthly-payments', { method: 'PUT', body: JSON.stringify({ id: m.row.id, plan_amount: value }) })
      } else {
        await send('/api/payments/schedule', {
          method: 'POST',
          body: JSON.stringify({ participant_ids: [p.id], from_month: m.month, from_year: m.year, months: 1, plan_amount: value, overwrite_plan: true }),
        })
      }
      toast.success('План изменён', { description: `${monthName(m)} — ${formatMoney(value)}` })
      changed()
      return true
    } catch (err: any) {
      toast.error('Не удалось изменить план', { description: err.message })
      return false
    }
  }

  const deleteReceipt = async (t: Receipt, m: ScheduleMonth) => {
    const ok = await confirm({
      title: 'Удалить поступление?',
      description: `${formatMoney(t.amount_usd)} от ${formatDate(t.date)} за ${monthName(m).toLowerCase()}. Оплата месяца уменьшится на эту сумму.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await send(`/api/payments/transactions?id=${encodeURIComponent(t.id)}`, { method: 'DELETE' })
      toast.success('Поступление удалено')
      changed()
    } catch (err: any) {
      toast.error('Не удалось удалить', { description: err.message })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{p.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{p.program?.name || 'Программа не указана'}</span>
            <Badge variant={PARTICIPANT_STATUS[p.status]?.variant ?? 'secondary'}>{PARTICIPANT_STATUS[p.status]?.label ?? p.status}</Badge>
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
            <MiniStat label="Собрано" value={formatMoney(summary?.collected ?? s.totalPaid)} />
            <MiniStat
              label="Оплачено месяцев"
              value={
                <>
                  {s.paidCount}
                  <span className="text-muted-foreground"> из {s.scheduledCount}</span>
                </>
              }
              sub={s.duration ? `по графику на ${s.duration} мес.` : 'по внесённым месяцам'}
            />
            <MiniStat label="Тариф" value={formatMoney(monthlyTariff(p))} sub={p.tariff ? 'индивидуальный' : 'по программе'} />
          </div>

          {overdue.length > 0 && (
            <button
              type="button"
              onClick={scrollToFirstOverdue}
              className="flex w-full gap-2.5 rounded-lg bg-destructive-soft px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-destructive-soft/70 focus-visible:ring-[3px] focus-visible:ring-destructive/30 focus-visible:outline-none"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  Просрочено {overdue.length} {monthsWord(overdue.length)} на <span className="num">{formatMoney(s.overdueDebt)}</span>
                </span>
                <span className="text-muted-foreground">: {monthRangeLabel(overdue, MONTHS_SHORT_RU)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Показать первый месяц</span>
              </span>
            </button>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail icon={Phone} label="Телефон" value={p.phone} href={p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : undefined} />
            <Detail icon={Mail} label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
            <Detail icon={CalendarDays} label="Дата начала" value={formatDate(p.start_date, 'long')} />
            <Detail
              icon={ReceiptIcon}
              label="Длительность"
              value={`${p.program?.duration_months || 0} ${monthsWord(p.program?.duration_months || 0)}`}
            />
          </dl>

          <TelegramAdminPanel key={p.id} participantId={p.id} participantName={p.name} participantPhone={p.phone} />

          <section>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="text-sm font-semibold">Платежи по месяцам</h3>
              {s.months.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {s.months.length} {monthsWord(s.months.length)}
                  {missing.length > 0 && ` · ${missing.length} без записи`}
                </span>
              )}
              {missing.length > 0 && (
                <Button type="button" size="xs" variant="outline" className="ml-auto" disabled={busy} onClick={generateSchedule}>
                  <CalendarPlus /> Сформировать график
                </Button>
              )}
            </div>
            {s.months.length === 0 ? (
              <div className="rounded-lg border">
                <EmptyState
                  icon={ReceiptIcon}
                  title="Платежей пока нет"
                  description={p.start_date ? 'Укажите длительность программы, чтобы построить график' : 'Укажите дату начала, чтобы построить график'}
                  className="py-8"
                />
              </div>
            ) : (
              <div ref={listRef} className="overflow-x-auto rounded-lg border">
                <div className="min-w-[520px]">
                  <div className={cn(GRID, 'border-b bg-muted/40 text-xs text-muted-foreground')}>
                    <span className={cn(STICKY, MUTED_SOLID, 'py-2 pl-3')}>Месяц</span>
                    <span className="py-2 text-right">План</span>
                    <span className="py-2 text-right">Оплачено</span>
                    <span className="py-2 text-right">Осталось</span>
                    <span className="py-2">Статус</span>
                    <span />
                  </div>
                  <ul className="divide-y">
                    {s.months.map(m => (
                      <MonthLine
                        key={m.idx}
                        m={m}
                        ledger={info.ledger}
                        receipts={m.row?.id ? (receiptsByMonth.get(m.row.id) ?? []) : []}
                        expanded={expanded.has(m.idx)}
                        flash={flash === m.idx}
                        onToggle={() => toggle(m.idx)}
                        onSavePlan={v => savePlan(m, v)}
                        onAddPayment={onAddPayment ? () => onAddPayment(p, m.month, m.year) : undefined}
                        onDeleteReceipt={t => deleteReceipt(t, m)}
                      />
                    ))}
                  </ul>
                  <div className={cn(GRID, 'border-t bg-muted/40 text-sm')}>
                    <span className={cn(STICKY, MUTED_SOLID, 'py-2.5 pl-3 text-muted-foreground')}>Итого</span>
                    <span className="num py-2.5 text-right text-muted-foreground">{formatMoney(s.totalPlan)}</span>
                    <span className="num py-2.5 text-right font-semibold">{formatMoney(s.totalPaid)}</span>
                    <span className={cn('num py-2.5 text-right', s.overdueDebt > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                      {s.overdueDebt > 0 ? formatMoney(s.overdueDebt) : '—'}
                    </span>
                    <span className="py-2.5 text-xs text-muted-foreground">{s.overdueDebt > 0 ? 'долг' : ''}</span>
                    <span />
                  </div>
                </div>
              </div>
            )}
          </section>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onEdit(p)}>
            <Pencil /> Изменить
          </Button>
          {p.status !== 'archived' && (
            <Button type="button" variant="ghost" onClick={() => onArchive(p)}>
              <Archive /> В архив
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
            onClick={() => onDelete(p)}
          >
            <Trash2 /> Удалить
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const GRID = 'grid grid-cols-[minmax(7.5rem,1fr)_4.5rem_5rem_4.5rem_6rem_1.75rem] items-center gap-x-2 pr-2'
/** Month column stays in view while the table scrolls sideways on phones. */
const STICKY = 'sticky left-0 z-10'
/** Opaque twin of `bg-muted/40` on a card, for the sticky cells of the header and totals rows. */
const MUTED_SOLID = 'bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))]'

function MonthLine({
  m,
  ledger,
  receipts,
  expanded,
  flash,
  onToggle,
  onSavePlan,
  onAddPayment,
  onDeleteReceipt,
}: {
  m: ScheduleMonth<MonthRow | MonthlyPayment>
  ledger: boolean
  receipts: Receipt[]
  expanded: boolean
  flash: boolean
  onToggle: () => void
  onSavePlan: (v: number) => Promise<boolean>
  onAddPayment?: () => void
  onDeleteReceipt: (t: Receipt) => void
}) {
  const st = SCHEDULE_STATUS[m.status]
  const muted = m.status === 'future' || m.status === 'free'
  const canPay = !!onAddPayment && m.remaining > 0 && (m.isPast || m.isCurrent || m.status === 'partial')
  const row = m.row as (MonthRow & MonthlyPayment) | null
  const bg = flash ? 'bg-destructive-soft' : 'bg-card'

  return (
    <li data-month={m.idx} tabIndex={-1} className={cn('outline-none transition-colors duration-200', flash && 'bg-destructive-soft')}>
      <div className={cn(GRID, 'text-sm', muted && 'text-muted-foreground')}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cn(STICKY, bg, 'flex min-w-0 items-center gap-1 py-2 pl-2 text-left transition-colors duration-200 hover:text-primary focus-visible:text-primary focus-visible:outline-none')}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-150', expanded && 'rotate-90')} />
          <span className="truncate">
            <span className="sm:hidden">{MONTHS_SHORT_RU[m.month - 1]}</span>
            <span className="max-sm:hidden">{MONTHS_RU[m.month - 1]}</span> <span className="num text-muted-foreground">{m.year}</span>
          </span>
          {ledger && receipts.length > 1 && (
            <span className="num ml-0.5 shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground">{receipts.length}</span>
          )}
        </button>
        <PlanCell plan={m.plan} onSave={onSavePlan} label={`План за ${monthName(m).toLowerCase()}`} />
        <span className="py-2 text-right">
          {m.row ? (
            <span className={cn('num', m.fact > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{formatMoney(m.fact)}</span>
          ) : (
            <span className={cn('text-xs', m.overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>Нет оплаты</span>
          )}
        </span>
        <span className={cn('num py-2 text-right', m.overdue ? 'font-medium text-destructive' : m.remaining > 0 ? '' : 'text-muted-foreground')}>
          {m.remaining > 0 ? formatMoney(m.remaining) : '—'}
        </span>
        <span className="py-2">
          <Badge variant={st.variant} className={cn(muted && 'opacity-80')}>
            {st.label}
          </Badge>
        </span>
        <span className="flex justify-end">
          {canPay && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn('size-7', m.overdue ? 'text-destructive hover:bg-destructive-soft' : 'text-muted-foreground')}
                  aria-label={`Внести оплату за ${monthName(m).toLowerCase()}`}
                  onClick={onAddPayment}
                >
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Внести оплату</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>

      {expanded && (
        <div className={cn('border-t border-dashed bg-muted/30 py-2 pr-3 pl-8 text-xs')}>
          {ledger && receipts.length > 0 ? (
            <ul className="divide-y divide-dashed">
              {receipts.map(t => (
                <li key={t.id} className="group flex items-start gap-2 py-1.5">
                  <span className="num w-[4.5rem] shrink-0 text-muted-foreground">{formatDate(t.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="num font-medium text-foreground">{formatMoney(t.amount_usd)}</span>
                    {t.currency !== 'USD' && t.original_amount ? (
                      <span className="num text-muted-foreground"> · {formatMoney(t.original_amount, t.currency)}</span>
                    ) : null}
                    <span className="text-muted-foreground"> · {t.account?.name || 'счёт не указан'}</span>
                    {t.notes && (
                      <span className="mt-0.5 flex gap-1 text-muted-foreground">
                        <MessageSquareText className="mt-px size-3 shrink-0" />
                        <span className="whitespace-pre-wrap">{t.notes}</span>
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={cn(dangerIconCls, '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100')}
                    aria-label={`Удалить поступление ${formatMoney(t.amount_usd)} от ${formatDate(t.date)}`}
                    onClick={() => onDeleteReceipt(t)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : row && m.fact > 0 ? (
            <p className="py-1 text-muted-foreground">
              Оплата <span className="num text-foreground">{formatMoney(m.fact)}</span>
              {row.paid_date ? <> от {formatDate(row.paid_date)}</> : null}
              {row.notes ? <span className="mt-0.5 block whitespace-pre-wrap">{row.notes}</span> : null}
            </p>
          ) : (
            <p className="py-1 text-muted-foreground">{m.row ? 'Поступлений за месяц пока нет.' : 'Месяца нет в графике — он появится с первой оплатой или после «Сформировать график».'}</p>
          )}
          {onAddPayment && m.remaining > 0 && (
            <Button type="button" size="xs" variant="outline" className="mt-1.5" onClick={onAddPayment}>
              <Plus /> Внести оплату{m.fact > 0 ? ` · осталось ${formatMoney(m.remaining)}` : ''}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** Plan amount that turns into an input on click; Enter saves, Escape cancels. */
function PlanCell({ plan, onSave, label }: { plan: number; onSave: (v: number) => Promise<boolean>; label: string }) {
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const done = React.useRef(false)

  const start = () => {
    setValue(String(roundMoney(plan)))
    done.current = false
    setEditing(true)
  }
  const commit = async () => {
    if (done.current) return
    done.current = true
    const v = roundMoney(value.replace(',', '.').replace(/\s/g, ''))
    if (!value.trim() || !Number.isFinite(Number(value.replace(',', '.').replace(/\s/g, ''))) || v < 0 || v === roundMoney(plan)) {
      setEditing(false)
      return
    }
    setSaving(true)
    const ok = await onSave(v)
    setSaving(false)
    if (ok) setEditing(false)
    else done.current = false
  }

  if (editing) {
    return (
      <span className="flex justify-end py-1">
        <Input
          autoFocus
          inputMode="decimal"
          aria-label={label}
          value={value}
          disabled={saving}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              done.current = true
              setEditing(false)
            }
          }}
          className="num h-7 w-[5.25rem] px-2 text-right text-sm"
        />
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${label}: ${formatMoney(plan)}. Изменить`}
      className="num justify-self-end rounded px-1 py-2 text-right text-muted-foreground decoration-dotted underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
    >
      {formatMoney(plan)}
    </button>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-base font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value?: string | null
  href?: string
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate">
          {value ? (
            href ? (
              <a href={href} className="underline-offset-4 hover:text-primary hover:underline">
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-muted-foreground">Не указан</span>
          )}
        </dd>
      </div>
    </div>
  )
}
