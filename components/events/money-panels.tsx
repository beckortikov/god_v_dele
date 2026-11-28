'use client'

import * as React from 'react'
import { AlertTriangle, Building2, HandCoins, Landmark, Pencil, Plus, Trash2, Undo2, User, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Panel } from '@/components/erp/page-header'
import { EmptyState } from '@/components/erp/empty-state'
import { TotalsBar, dangerIconCls, rowActionsCls } from '@/components/erp/table-parts'
import { lenderLabel, supplierKindOf } from '@/lib/event-money'
import { num, type AccountLite, type EventLoan, type EventMoney, type EventRepayment, type EventSupplier } from '@/components/events/types'

function Progress({ value, of, tone }: { value: number; of: number; tone: 'success' | 'primary' }) {
  const pct = of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn('h-full rounded-full', tone === 'success' ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ---------- Suppliers ----------

export function SuppliersPanel({
  money,
  onAdd,
  onEdit,
  onPay,
  onDelete,
}: {
  money: EventMoney | null
  onAdd: () => void
  onEdit: (s: EventSupplier) => void
  onPay: (s: EventSupplier) => void
  onDelete: (s: EventSupplier) => void
}) {
  const suppliers = money?.suppliers ?? []
  if (!suppliers.length) {
    return (
      <Panel>
        <EmptyState
          icon={Building2}
          title="Поставщиков пока нет"
          description="Тур-компания, отель, транспорт: укажите сумму по договору, и будет видно, сколько оплачено и сколько осталось"
          action={
            <Button size="sm" onClick={onAdd}>
              <Plus /> Поставщик
            </Button>
          }
        />
      </Panel>
    )
  }
  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Поставщик</TableHead>
            <TableHead className="text-right max-sm:hidden">По договору</TableHead>
            <TableHead className="w-44 max-md:hidden">Оплачено</TableHead>
            <TableHead className="text-right">Осталось</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map(s => {
            const t = s.totals
            const kind = supplierKindOf(s.kind)
            return (
              <TableRow key={s.id} className="group cursor-pointer" onClick={() => onEdit(s)}>
                <TableCell className="max-w-80 whitespace-normal">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {kind.label}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[t.payments ? `${formatNumber(t.payments)} ${plural(t.payments, ['оплата', 'оплаты', 'оплат'])}` : 'оплат нет', s.contact].filter(Boolean).join(' · ')}
                  </div>
                </TableCell>
                <TableCell className="num text-right max-sm:hidden">{t.contract > 0 ? formatMoney(t.contract, t.currency) : <span className="text-muted-foreground/70">—</span>}</TableCell>
                <TableCell className="max-md:hidden">
                  <div className="num mb-1 text-sm">{formatMoney(t.paid, t.currency)}</div>
                  {t.contract > 0 && <Progress value={t.paid} of={t.contract} tone="success" />}
                </TableCell>
                <TableCell className="text-right">
                  {t.contract <= 0 ? (
                    <span className="text-xs text-muted-foreground">сумма не указана</span>
                  ) : t.overpaid > 0 ? (
                    <span className="num text-sm font-medium text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]">переплата {formatMoney(t.overpaid, t.currency)}</span>
                  ) : t.left > 0 ? (
                    <span className="num font-medium">{formatMoney(t.left, t.currency)}</span>
                  ) : (
                    <Badge variant="success">Оплачено</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => onPay(s)}>
                      <Wallet /> Оплатить
                    </Button>
                    <div className={rowActionsCls}>
                      <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => onEdit(s)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => onDelete(s)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <TotalsBar
        label={`${formatNumber(suppliers.length)} ${plural(suppliers.length, ['поставщик', 'поставщика', 'поставщиков'])} · оплачено ${formatMoney(money!.totals.suppliers_paid_usd)}`}
        value={money!.totals.suppliers_left_usd > 0 ? `осталось ${formatMoney(money!.totals.suppliers_left_usd)}` : 'всё оплачено'}
      />
    </Panel>
  )
}

// ---------- Loans ----------

export function LoansPanel({
  money,
  accounts,
  onAdd,
  onEdit,
  onRepay,
  onDelete,
  onDeleteRepayment,
}: {
  money: EventMoney | null
  accounts: AccountLite[]
  onAdd: () => void
  onEdit: (l: EventLoan) => void
  onRepay: (l: EventLoan) => void
  onDelete: (l: EventLoan) => void
  onDeleteRepayment: (l: EventLoan, r: EventRepayment) => void
}) {
  const loans = money?.loans ?? []
  if (!loans.length) {
    return (
      <Panel>
        <EmptyState
          icon={HandCoins}
          title="Займов нет"
          description="Если на оплату отеля или тура не хватает денег, запишите займ: со счёта «Год в деле» или у человека. Возвраты записываются частями"
          action={
            <Button size="sm" onClick={onAdd}>
              <Plus /> Займ
            </Button>
          }
        />
      </Panel>
    )
  }
  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      {loans.map(l => {
        const t = l.totals
        const fromAccount = l.source === 'account'
        return (
          <Panel key={l.id} className="px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', fromAccount ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-secondary text-foreground/70')}>
                {fromAccount ? <Landmark className="size-4" /> : <User className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="truncate font-medium">{lenderLabel(l, accounts)}</span>
                  <span className="text-xs text-muted-foreground">{fromAccount ? 'счёт «Год в деле»' : 'человек / компания'}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  взяли <span className="num">{formatDate(l.received_on)}</span>
                  {l.due_on && (
                    <>
                      {' · '}
                      <span className={cn(t.overdue && 'font-medium text-destructive')}>
                        вернуть до <span className="num">{formatDate(l.due_on)}</span>
                        {t.overdue && ' — просрочено'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="icon-sm" aria-label="Изменить займ" className="text-muted-foreground" onClick={() => onEdit(l)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Удалить займ" className={dangerIconCls} onClick={() => onDelete(l)}>
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Взяли</div>
                <div className="num font-medium">{formatMoney(t.taken, t.currency)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Вернули</div>
                <div className="num font-medium">{formatMoney(t.repaid, t.currency)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Должны</div>
                <div className={cn('num font-semibold', t.closed ? 'text-success' : t.overdue ? 'text-destructive' : '')}>{t.closed ? 'Вернули' : formatMoney(t.owed, t.currency)}</div>
              </div>
            </div>
            <div className="mt-2">
              <Progress value={t.repaid} of={t.taken} tone="primary" />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Потрачено из займа на оплаты: <span className="num">{formatMoney(t.spent_usd)}</span>
              {t.unspent_usd > 0 && (
                <>
                  {' '}· не потрачено <span className="num">{formatMoney(t.unspent_usd)}</span>
                </>
              )}
            </div>

            {l.repayments.length > 0 && (
              <ul className="mt-2.5 divide-y rounded-md border">
                {l.repayments.map(r => (
                  <li key={r.id} className="group flex items-center gap-2 px-2.5 py-1.5 text-sm">
                    <Undo2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="num">{formatDate(r.repaid_on)}</span>
                    <span className="num font-medium">{formatMoney(num(r.original_amount), r.currency)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {[r.account_id ? `со счёта ${accounts.find(a => a.id === r.account_id)?.name ?? ''}` : null, r.note].filter(Boolean).join(' · ')}
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label="Удалить возврат" className={cn(dangerIconCls, 'opacity-0 group-hover:opacity-100 max-sm:opacity-60')} onClick={() => onDeleteRepayment(l, r)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {l.note && <p className="mt-2 text-xs text-muted-foreground">{l.note}</p>}

            {!t.closed && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => onRepay(l)}>
                <Undo2 /> Вернуть
              </Button>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

// ---------- What the event still owes (Finance tab) ----------

export function ObligationsPanel({ money }: { money: EventMoney | null }) {
  if (!money || (!money.suppliers.length && !money.loans.length)) return null
  const t = money.totals
  return (
    <Panel className="px-4 py-3.5">
      <h3 className="mb-1 text-sm font-semibold">Обязательства</h3>
      <div className="flex items-center justify-between border-b py-2 text-sm">
        <span>Поставщикам по договорам</span>
        <span className="num">{formatMoney(t.contracts_usd)}</span>
      </div>
      <div className="flex items-center justify-between border-b py-2 pl-3 text-sm text-muted-foreground">
        <span>оплачено</span>
        <span className="num">{formatMoney(t.suppliers_paid_usd)}</span>
      </div>
      <div className="flex items-center justify-between border-b py-2 text-sm font-semibold">
        <span>Осталось заплатить поставщикам</span>
        <span className="num">{formatMoney(t.suppliers_left_usd)}</span>
      </div>
      <div className="flex items-center justify-between border-b py-2 text-sm">
        <span>Взяли в долг</span>
        <span className="num">{formatMoney(t.loans_taken_usd)}</span>
      </div>
      <div className="-mx-4 mt-1 -mb-3.5 flex items-center justify-between bg-muted/50 px-4 py-3">
        <span className="flex items-center gap-1.5 font-semibold">
          Должны вернуть по займам
          {t.loans_overdue > 0 && (
            <Badge variant="destructive">
              <AlertTriangle /> просрочено {formatNumber(t.loans_overdue)}
            </Badge>
          )}
        </span>
        <span className={cn('num text-base font-semibold', t.loans_owed_usd > 0 && 'text-destructive')}>{formatMoney(t.loans_owed_usd)}</span>
      </div>
    </Panel>
  )
}
