'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU, formatDate, formatMoney, todayISO } from '@/lib/format'
import { monthStatus, remainder } from '@/lib/payment-schedule'
import { isGuestProgram } from '@/lib/participant-kind'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/erp/field'
import { useConfirm } from '@/components/erp/confirm'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { useLedger, type Receipt } from '@/components/finance/use-ledger'
import { readPref, writePref, type Account } from '@/components/finance/types'
import { monthlyTariff, type MonthlyPayment, type Participant } from '@/components/participants/types'

const LAST_ACCOUNT = 'grid-last-account'
const NO_ACCOUNT = 'none'

type MonthRowLike = Pick<MonthlyPayment, 'id' | 'plan_amount' | 'fact_amount' | 'month_number' | 'year'>

const planOf = (p: Participant, row?: MonthRowLike) => Number(row?.plan_amount ?? monthlyTariff(p)) || 0
const factOf = (row?: MonthRowLike) => Number(row?.fact_amount) || 0
const amountText = (v: number) => (Math.round(v * 100) % 100 === 0 ? String(Math.round(v)) : v.toFixed(2))

async function call<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(url, { ...rest, headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: json !== undefined ? JSON.stringify(json) : rest.body })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) throw new Error(body?.error || `Сервер ответил ${res.status}`)
  return body as T
}

/**
 * «Кто за какой месяц оплатил»: a table participants × months. A cell is a checkbox: tick it to record a payment
 * (it asks for the amount and the account), tick a paid month to see the receipts and take them back.
 */
export function PaymentsGrid({ participants, payments, onChanged }: { participants: Participant[]; payments: MonthlyPayment[]; onChanged: () => void }) {
  const ledger = useLedger()
  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [accounts, setAccounts] = React.useState<Account[]>([])

  React.useEffect(() => {
    call<Account[] | { data?: Account[] }>('/api/accounts')
      .then(r => setAccounts(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setAccounts([]))
  }, [])

  const rowOf = React.useMemo(() => {
    const map = new Map<string, MonthlyPayment>()
    for (const p of payments) map.set(`${p.participant_id}:${p.year}:${p.month_number}`, p)
    return map
  }, [payments])

  const years = React.useMemo(() => {
    const set = new Set<number>([now.getFullYear(), now.getFullYear() - 1])
    for (const p of payments) set.add(p.year)
    return [...set].sort((a, b) => b - a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments])

  const rows = React.useMemo(
    () => [...participants].sort((a, b) => (a.program?.name ?? '').localeCompare(b.program?.name ?? '', 'ru') || a.name.localeCompare(b.name, 'ru')),
    [participants]
  )
  const nowIndex = now.getFullYear() * 12 + now.getMonth()

  if (ledger.enabled === false) {
    return <p className="m-4 rounded-lg bg-warning-soft px-4 py-3 text-sm">Отметки оплат работают с журналом поступлений (миграция 014). Пока она не применена, вносите оплату кнопкой «Внести оплату» в карточке участника.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2.5">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger size="sm" className="w-28" aria-label="Год">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Обозначения">
          <li className="flex items-center gap-1.5">
            <span className="flex size-4 items-center justify-center rounded bg-success text-success-foreground">
              <Check className="size-3" strokeWidth={3} />
            </span>
            оплачено
          </li>
          <li className="flex items-center gap-1.5">
            <span className="flex h-4 min-w-4 items-center justify-center rounded bg-warning-soft px-1 text-[10px] font-semibold">500</span>
            частично
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-4 rounded border border-destructive/50 bg-destructive-soft" />
            не оплачено, срок прошёл
          </li>
        </ul>
        <span className="ml-auto text-xs text-muted-foreground">Нажмите на клетку: отметить оплату или посмотреть поступления</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-48 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Участник</th>
              {MONTHS_SHORT_RU.map((m, i) => (
                <th key={m} className={cn('min-w-12 border-b px-1 py-2 text-center text-xs font-medium', year * 12 + i === nowIndex ? 'text-primary' : 'text-muted-foreground')}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const start = p.start_date ? new Date(p.start_date) : null
              const startIdx = start ? start.getFullYear() * 12 + start.getMonth() : null
              return (
                <tr key={p.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 max-w-64 border-b bg-card px-3 py-1.5 text-left font-normal group-hover:bg-accent">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.program?.name ?? '—'} · {formatMoney(monthlyTariff(p))}/мес
                    </div>
                  </th>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1
                    const row = rowOf.get(`${p.id}:${year}:${month}`)
                    const idx = year * 12 + i
                    const overdue = idx < nowIndex && startIdx !== null && idx >= startIdx && p.status === 'active' && !isGuestProgram(p.program)
                    return (
                      <td key={month} className="border-b px-0.5 py-1 text-center group-hover:bg-accent">
                        <MonthCell participant={p} month={month} year={year} row={row} overdue={overdue} accounts={accounts} onChanged={onChanged} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MonthCell({ participant, month, year, row, overdue, accounts, onChanged }: { participant: Participant; month: number; year: number; row?: MonthRowLike; overdue: boolean; accounts: Account[]; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false)
  const fact = factOf(row)
  const state = monthStatus(fact, planOf(participant, row))
  const label = `${participant.name}, ${MONTHS_RU[month - 1]} ${year}: ${state === 'paid' ? 'оплачено' : state === 'partial' ? 'частично' : 'не оплачено'}`
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'mx-auto flex h-8 min-w-10 items-center justify-center rounded-md border text-[11px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30',
            state === 'paid' && 'border-transparent bg-success text-success-foreground hover:brightness-95',
            state === 'partial' && 'border-transparent bg-warning-soft hover:brightness-95',
            state === 'pending' && (overdue ? 'border-destructive/50 bg-destructive-soft hover:bg-destructive-soft/70' : 'border-dashed border-border bg-transparent text-transparent hover:bg-muted')
          )}
        >
          {state === 'paid' ? <Check className="size-4" strokeWidth={3} /> : state === 'partial' ? Math.round(fact) : ' '}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0">
        {open && (
          <MonthPanel
            participant={participant}
            month={month}
            year={year}
            row={row}
            accounts={accounts}
            onChanged={() => {
              onChanged()
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function MonthPanel({ participant, month, year, row, accounts, onChanged, onClose }: { participant: Participant; month: number; year: number; row?: MonthRowLike; accounts: Account[]; onChanged: () => void; onClose: () => void }) {
  const confirm = useConfirm()
  const plan = planOf(participant, row)
  const [receipts, setReceipts] = React.useState<Receipt[] | null>(row ? null : [])
  const [busy, setBusy] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(readPref('last-tjs-rate') || '9.3')
  const [paidDate, setPaidDate] = React.useState(todayISO())
  const [accountId, setAccountId] = React.useState('')

  const loadReceipts = React.useCallback(async () => {
    if (!row) return setReceipts([])
    try {
      const r = await call<{ data?: Receipt[] }>(`/api/payments/transactions?participant_id=${participant.id}&monthly_payment_id=${row.id}`)
      setReceipts(r.data ?? [])
    } catch {
      setReceipts([])
    }
  }, [participant.id, row])
  React.useEffect(() => {
    loadReceipts()
  }, [loadReceipts])

  // Receipts decide what is paid; the month row may lag a moment behind
  const paid = receipts ? receipts.reduce((s, t) => s + Number(t.amount_usd), 0) : factOf(row)
  const left = remainder(plan, paid)
  const hasReceipts = !!receipts?.length
  const showForm = adding || (receipts !== null && !hasReceipts) || (receipts !== null && left > 0)

  // Defaults for the form: what is still due, the account of the participant's program
  React.useEffect(() => {
    if (receipts === null) return
    setAmount(amountText(left > 0 ? left : plan))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts === null, hasReceipts])

  const options = React.useMemo(() => {
    const same = accounts.filter(a => a.currency === currency)
    return [...same.filter(a => a.program_id === participant.program_id), ...same.filter(a => a.program_id !== participant.program_id)]
  }, [accounts, currency, participant.program_id])
  React.useEffect(() => {
    const remembered = readPref(`${LAST_ACCOUNT}:${currency}`)
    const own = options.find(a => a.program_id === participant.program_id)
    const pick = options.find(a => a.id === remembered && a.program_id === participant.program_id) ?? own ?? options.find(a => a.id === remembered) ?? options[0]
    setAccountId(pick?.id ?? NO_ACCOUNT)
  }, [options, currency, participant.program_id])

  const value = Number(amount)
  const rateNum = currency === 'TJS' ? Number(rate) : 1
  const valid = value > 0 && rateNum > 0 && !!paidDate

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await call('/api/payments/transactions', {
        method: 'POST',
        json: { participant_id: participant.id, month_number: month, year, amount: value, currency, exchange_rate: rateNum, paid_date: paidDate, account_id: accountId === NO_ACCOUNT ? null : accountId, notes: 'Отмечено в таблице оплат' },
      })
      if (accountId !== NO_ACCOUNT) writePref(`${LAST_ACCOUNT}:${currency}`, accountId)
      if (currency === 'TJS') writePref('last-tjs-rate', rate)
      toast.success('Оплата отмечена', { description: `${participant.name} · ${MONTHS_RU[month - 1]} ${year} · ${currency === 'USD' ? formatMoney(value) : formatMoney(value, 'TJS')}` })
      setAdding(false)
      await loadReceipts()
      onChanged()
      if (left - value / rateNum <= 0.005) onClose()
    } catch (e) {
      toast.error('Не удалось отметить оплату', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const removeAll = async () => {
    if (!receipts?.length) return
    const ok = await confirm({
      title: 'Снять отметку об оплате?',
      description: `${participant.name}, ${MONTHS_RU[month - 1]} ${year}: будет удалено поступлений: ${receipts.length} на ${formatMoney(paid)}. Остатки счетов уменьшатся на эти суммы.`,
      confirmText: 'Снять отметку',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      for (const t of receipts) await call(`/api/payments/transactions?id=${t.id}`, { method: 'DELETE' })
      toast.success('Отметка снята')
      await loadReceipts()
      onChanged()
      onClose()
    } catch (e) {
      toast.error('Не удалось снять отметку', { description: (e as Error).message })
      await loadReceipts()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const removeOne = async (t: Receipt) => {
    const ok = await confirm({ title: 'Удалить это поступление?', description: `${formatDate(t.paid_date)} · ${t.currency === 'USD' ? formatMoney(t.amount_usd) : formatMoney(t.original_amount, t.currency)}${t.account?.name ? ` · ${t.account.name}` : ''}`, confirmText: 'Удалить', destructive: true })
    if (!ok) return
    setBusy(true)
    try {
      await call(`/api/payments/transactions?id=${t.id}`, { method: 'DELETE' })
      await loadReceipts()
      onChanged()
    } catch (e) {
      toast.error('Не удалось удалить', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-sm" onKeyDown={e => e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.preventDefault(), save())}>
      <div className="border-b px-4 py-3">
        <p className="font-semibold">{participant.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {MONTHS_RU[month - 1]} {year} · план {formatMoney(plan)} · оплачено <span className="num font-medium text-foreground">{formatMoney(paid)}</span>
          {left > 0 && <> · осталось {formatMoney(left)}</>}
        </p>
      </div>

      {receipts === null ? (
        <div className="flex items-center gap-2 px-4 py-4 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Загружаем…
        </div>
      ) : (
        <>
          {hasReceipts && (
            <ul className="divide-y border-b">
              {receipts.map(t => (
                <li key={t.id} className="flex items-center gap-2 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="num font-medium">{t.currency === 'USD' ? formatMoney(t.amount_usd) : `${formatMoney(t.original_amount, t.currency)} (${formatMoney(t.amount_usd)})`}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(t.paid_date)} · {t.account?.name ?? 'без счёта'}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить поступление" disabled={busy} className="text-muted-foreground hover:text-destructive" onClick={() => removeOne(t)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {showForm ? (
            <div className="space-y-3 px-4 py-3">
              <Field label={hasReceipts ? 'Ещё поступление' : 'Сколько оплатил'} htmlFor="grid-amount">
                <MoneyInput id="grid-amount" amount={amount} onAmountChange={setAmount} currency={currency} onCurrencyChange={setCurrency} rate={rate} onRateChange={setRate} rateDate={paidDate} autoFocus />
              </Field>
              <Field label="На какой счёт" htmlFor="grid-account">
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="grid-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-muted-foreground">· {a.currency}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value={NO_ACCOUNT}>Без счёта (только история)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Дата оплаты" htmlFor="grid-date">
                <Input id="grid-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} max={todayISO()} />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="button" className="flex-1" disabled={!valid || busy} onClick={save}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} Отметить оплаченным
                </Button>
                {adding && (
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => setAdding(false)}>
                    Отмена
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-success">
                <Check className="size-4" strokeWidth={3} /> Месяц оплачен полностью
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
                Добавить ещё поступление
              </Button>
            </div>
          )}

          {hasReceipts && (
            <div className="border-t px-4 py-2.5">
              <Button type="button" variant="ghost" size="sm" disabled={busy} className="-ml-2 text-muted-foreground hover:bg-destructive-soft hover:text-destructive" onClick={removeAll}>
                <Trash2 /> Снять отметку (удалить все поступления)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
