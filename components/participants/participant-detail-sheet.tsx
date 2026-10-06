'use client'

import * as React from 'react'
import { AlertTriangle, Archive, CalendarDays, Mail, MessageSquareText, Pencil, Phone, Receipt, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/erp/empty-state'
import { MONTHS_RU, formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import {
  PARTICIPANT_STATUS,
  monthlyTariff,
  paymentRowStatus,
  type MonthlyPayment,
  type Participant,
  type ParticipantSummary,
} from '@/components/participants/types'

export function ParticipantDetailSheet({
  open,
  participant,
  payments,
  summary,
  onOpenChange,
  onEdit,
  onArchive,
  onDelete,
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
}) {
  const p = participant
  const sorted = React.useMemo(
    () => [...payments].sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month_number - a.month_number)),
    [payments]
  )

  return (
    <Sheet open={open && !!participant} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]">
        {p && (
          <>
            <SheetHeader>
              <SheetTitle>{p.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{p.program?.name || 'Программа не указана'}</span>
                <Badge variant={PARTICIPANT_STATUS[p.status]?.variant ?? 'secondary'}>
                  {PARTICIPANT_STATUS[p.status]?.label ?? p.status}
                </Badge>
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-5">
              {summary && (
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
                  <MiniStat label="Собрано" value={formatMoney(summary.collected)} />
                  <MiniStat
                    label="Оплачено"
                    value={
                      <>
                        {summary.paidCount}
                        <span className="text-muted-foreground"> / {summary.totalCount}</span>
                      </>
                    }
                  />
                  <MiniStat label="Тариф" value={formatMoney(monthlyTariff(p))} sub={p.tariff ? 'индивидуальный' : 'по программе'} />
                </div>
              )}

              {summary?.overdue && (
                <div className="flex gap-2.5 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p>Есть неоплаченные или недоплаченные прошлые месяцы.</p>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail icon={Phone} label="Телефон" value={p.phone} href={p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : undefined} />
                <Detail icon={Mail} label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
                <Detail icon={CalendarDays} label="Дата начала" value={formatDate(p.start_date, 'long')} />
                <Detail
                  icon={Receipt}
                  label="Длительность"
                  value={`${p.program?.duration_months || 0} ${plural(p.program?.duration_months || 0, ['месяц', 'месяца', 'месяцев'])}`}
                />
              </dl>

              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Платежи по месяцам</h3>
                  {sorted.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(sorted.length)} {plural(sorted.length, ['запись', 'записи', 'записей'])}
                    </span>
                  )}
                </div>
                {sorted.length === 0 ? (
                  <div className="rounded-lg border">
                    <EmptyState icon={Receipt} title="Платежей пока нет" description="Оплаты появятся здесь после регистрации в разделе доходов" className="py-8" />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-4 sm:grid-cols-[1fr_auto_auto_5.5rem] border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span>Месяц</span>
                      <span className="w-16 text-right max-sm:hidden">План</span>
                      <span className="w-20 text-right">Факт</span>
                      <span className="text-right">Статус</span>
                    </div>
                    <ul className="divide-y">
                      {sorted.map(pay => (
                        <PaymentRow key={pay.id} payment={pay} participant={p} />
                      ))}
                    </ul>
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
          </>
        )}
      </SheetContent>
    </Sheet>
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

function PaymentRow({ payment, participant }: { payment: MonthlyPayment; participant: Participant }) {
  const plan = payment.amount || participant.tariff || participant.program?.price_per_month || 0
  const fact = payment.fact_amount || 0
  const deviation = fact - plan
  const status = paymentRowStatus(payment, participant)
  const monthLabel = payment.payment_month || MONTHS_RU[payment.month_number - 1] || String(payment.month_number)

  return (
    <li className="px-3 py-2.5">
      <div className="grid grid-cols-[1fr_auto_5.5rem] items-center gap-x-4 sm:grid-cols-[1fr_auto_auto_5.5rem] text-sm">
        <span className="min-w-0 truncate">
          {monthLabel} <span className="num text-muted-foreground">{payment.year}</span>
        </span>
        <span className="num w-16 text-right text-muted-foreground max-sm:hidden">{formatMoney(plan)}</span>
        <span className="w-20 text-right">
          <span className="num block font-medium">{formatMoney(fact)}</span>
          {deviation !== 0 && (
            <span className={cn('num block text-[11px]', deviation < 0 ? 'text-destructive' : 'text-success')}>
              {formatMoney(deviation, 'USD', { sign: true })}
            </span>
          )}
        </span>
        <span className="flex justify-end">
          <Badge variant={status.variant}>{status.label}</Badge>
        </span>
      </div>
      {payment.notes && (
        <p className="mt-1.5 flex gap-1.5 text-xs text-muted-foreground">
          <MessageSquareText className="mt-px size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{payment.notes}</span>
        </p>
      )}
    </li>
  )
}
