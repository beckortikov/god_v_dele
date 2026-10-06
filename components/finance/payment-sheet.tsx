'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox } from '@/components/erp/combobox'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { useParticipantPayments, type Receipt } from '@/components/finance/use-ledger'
import { MONTHS_RU, formatDate, formatMoney, todayISO } from '@/lib/format'
import { remainder, tariffOf, toCents } from '@/lib/payment-schedule'
import {
  DEFAULT_RATE,
  accountsFor,
  pickAccount,
  readPref,
  writePref,
  type Account,
  type Participant,
} from '@/components/finance/types'

const LAST_ACCOUNT = 'last-income-account'
const LAST_RATE = 'last-tjs-rate'

/** Opens the sheet for a given participant and month (e.g. from the participant card). */
export interface PaymentPreset {
  participantId: string
  month: number
  year: number
}

function emptyForm(preset?: PaymentPreset | null) {
  const now = new Date()
  return {
    participant_id: preset?.participantId ?? '',
    amount: '',
    month: String(preset?.month ?? now.getMonth() + 1),
    year: String(preset?.year ?? now.getFullYear()),
    notes: '',
    account_id: '',
    paid_date: todayISO(),
  }
}

/** «$1 000» without cents when whole, for the amount field. */
const amountText = (v: number) => (toCents(v) % 100 === 0 ? String(Math.round(v)) : v.toFixed(2))

export function PaymentSheet({
  open,
  onOpenChange,
  participants,
  accounts,
  preset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  participants: Participant[]
  accounts: Account[]
  /** Pre-select a participant and month when the sheet opens. */
  preset?: PaymentPreset | null
  onSaved: () => void
}) {
  const [form, setForm] = React.useState(() => emptyForm())
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(DEFAULT_RATE)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const amountTouched = React.useRef(false)

  const participant = participants.find(p => p.id === form.participant_id)
  const info = useParticipantPayments(open ? form.participant_id : null)
  const ledger = info.ledger

  React.useEffect(() => {
    if (!open) return
    const f = emptyForm(preset)
    const p = participants.find(x => x.id === f.participant_id)
    if (p) f.account_id = pickAccount(accountsFor(accounts, p.program_id), readPref(LAST_ACCOUNT))
    setForm(f)
    setCurrency('USD')
    setRate(readPref(LAST_RATE) || DEFAULT_RATE)
    setErrors({})
    amountTouched.current = false
    // Only when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const accountOptions = accountsFor(accounts, participant?.program_id)

  const participantOptions = React.useMemo(
    () =>
      participants
        .filter(p => p.status === 'active' || p.id === form.participant_id)
        .map(p => ({
          value: p.id,
          label: p.name,
          group: p.program?.name || 'Без программы',
          hint: (p.tariff || p.program?.price_per_month) ? `${formatMoney(p.tariff || p.program?.price_per_month)}/мес` : undefined,
        }))
        .sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.label.localeCompare(b.label, 'ru')),
    [participants, form.participant_id]
  )

  // ---------- The chosen month: plan, paid so far, receipts ----------
  const monthNum = Number(form.month)
  const yearNum = Number(form.year)
  const row = info.rows.find(r => Number(r.month_number) === monthNum && Number(r.year) === yearNum) ?? null
  const tariff = participant ? tariffOf(participant) : 0
  const plan = row?.plan_amount != null ? Number(row.plan_amount) || 0 : tariff
  const paid = Number(row?.fact_amount) || 0
  const left = remainder(plan, paid)
  const monthReceipts: Receipt[] = info.receipts
    .filter(t => t.month_number === monthNum && t.year === yearNum)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const infoReady = !!participant && info.forId === participant.id && !info.loading && !info.error

  // Pre-fill the amount: the remainder with the ledger (saving adds), the
  // tariff without it (saving replaces the month).
  const suggested = !participant ? null : ledger ? (row ? left : tariff) : tariff
  React.useEffect(() => {
    if (!open || !infoReady || amountTouched.current || currency !== 'USD') return
    setForm(f => ({ ...f, amount: suggested && suggested > 0 ? amountText(suggested) : '' }))
  }, [open, infoReady, suggested, currency, form.participant_id, form.month, form.year])

  const selectParticipant = (id: string) => {
    const p = participants.find(x => x.id === id)
    const opts = accountsFor(accounts, p?.program_id)
    setForm(f => ({
      ...f,
      participant_id: id,
      account_id: opts.some(a => a.id === f.account_id) ? f.account_id : pickAccount(opts, readPref(LAST_ACCOUNT)),
    }))
    setErrors(e => ({ ...e, participant_id: '' }))
  }

  const amountUsd = currency === 'TJS' ? (Number(rate) > 0 ? Number(form.amount) / Number(rate) : 0) : Number(form.amount)
  const over = ledger && row && toCents(amountUsd) > toCents(left) && toCents(left) > 0 ? amountUsd - left : 0
  const legacyExisting = !ledger && row && paid > 0 ? row : null

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!participant) errs.participant_id = 'Выберите участника'
    if (!(Number(form.amount) > 0)) errs.amount = 'Укажите сумму'
    if (currency === 'TJS' && !(Number(rate) > 0)) errs.amount = 'Укажите курс обмена'
    if (!form.account_id) errs.account_id = 'Выберите счёт'
    if (!(yearNum >= 2000 && yearNum <= 2100)) errs.period = 'Укажите год'
    setErrors(errs)
    if (Object.keys(errs).length || !participant) return

    setSaving(true)
    const original = Number(form.amount)
    const r = currency === 'TJS' ? Number(rate) : 1
    try {
      let monthAfter: any = null
      if (ledger) {
        // Ledger: one more receipt for the month
        const res = await fetch('/api/payments/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: participant.id,
            month_number: monthNum,
            year: yearNum,
            amount: original,
            currency,
            exchange_rate: r,
            paid_date: form.paid_date || todayISO(),
            account_id: form.account_id,
            notes: form.notes || null,
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
        monthAfter = result.month
      } else {
        // Legacy: one payment per month, a new one replaces it
        const res = await fetch('/api/monthly-payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: participant.id,
            program_id: participant.program_id,
            plan_amount: participant.tariff || participant.program?.price_per_month || 0,
            fact_amount: original / r,
            original_amount: original,
            currency,
            exchange_rate: r,
            month_number: monthNum,
            payment_month: MONTHS_RU[monthNum - 1],
            year: yearNum,
            status: 'paid',
            paid_date: form.paid_date || todayISO(),
            notes: form.notes || null,
            account_id: form.account_id,
          }),
        })
        const result = await res.json()
        if (result.error) throw new Error(result.error)
      }

      writePref(LAST_ACCOUNT, form.account_id)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      const rest = monthAfter ? remainder(monthAfter.plan_amount, monthAfter.fact_amount) : null
      toast.success('Поступление сохранено', {
        description: [
          `${participant.name} · ${formatMoney(original, currency)}`,
          rest == null ? null : rest > 0 ? `осталось ${formatMoney(rest)}` : 'месяц оплачен полностью',
        ]
          .filter(Boolean)
          .join(' · '),
      })
      onSaved()
      info.reload()
      if (addAnother) {
        setForm(f => ({ ...emptyForm(), account_id: f.account_id, month: f.month, year: f.year, paid_date: f.paid_date }))
        amountTouched.current = false
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error('Не удалось сохранить', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name
  const monthTitle = `${MONTHS_RU[monthNum - 1]?.toLowerCase() ?? ''} ${form.year}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit(false)
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit(false)
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Новое поступление</SheetTitle>
            <SheetDescription>
              {ledger ? 'Оплата участника за месяц, можно частями' : 'Оплата участника за месяц обучения'}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Участник" required hint={errors.participant_id && <span className="text-destructive">{errors.participant_id}</span>}>
                <Combobox
                  value={form.participant_id}
                  onChange={selectParticipant}
                  options={participantOptions}
                  placeholder="Найдите участника"
                  searchPlaceholder="Имя или программа…"
                  invalid={!!errors.participant_id}
                />
              </Field>

              <Field label="За период" hint={errors.period && <span className="text-destructive">{errors.period}</span>}>
                <div className="flex gap-2">
                  <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                    <SelectTrigger className="w-full" aria-label="Месяц">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_RU.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    aria-label="Год"
                    aria-invalid={!!errors.period || undefined}
                    value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value.replace(/\D/g, '') }))}
                    className="num w-[4.5rem] shrink-0 text-center"
                  />
                </div>
              </Field>

              {participant && (
                <MonthInfo
                  loading={info.loading}
                  error={info.error}
                  ledger={ledger}
                  monthTitle={monthTitle}
                  hasRow={!!row}
                  plan={plan}
                  paid={paid}
                  left={left}
                  receipts={monthReceipts}
                  accountName={accountName}
                />
              )}

              <Field
                label={ledger ? 'Сумма поступления' : 'Сумма'}
                htmlFor="pay-amount"
                required
                hint={
                  errors.amount ? (
                    <span className="text-destructive">{errors.amount}</span>
                  ) : over > 0 ? (
                    <span>
                      Больше остатка на <span className="num">{formatMoney(over)}</span> — переплата останется в этом месяце
                    </span>
                  ) : undefined
                }
              >
                <MoneyInput
                  id="pay-amount"
                  amount={form.amount}
                  onAmountChange={v => {
                    amountTouched.current = true
                    setForm(f => ({ ...f, amount: v }))
                  }}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  rate={rate}
                  onRateChange={setRate}
                  rateDate={form.paid_date}
                  invalid={!!errors.amount}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[0.9fr_1.4fr]">
                <Field label="Дата прихода" htmlFor="pay-date" required>
                  <Input
                    id="pay-date"
                    type="date"
                    value={form.paid_date}
                    onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Счёт зачисления" required hint={errors.account_id && <span className="text-destructive">{errors.account_id}</span>}>
                  <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                    <SelectTrigger className="w-full" aria-invalid={!!errors.account_id || undefined}>
                      <SelectValue placeholder="Выберите счёт" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} <span className="text-muted-foreground">· {a.currency}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {legacyExisting && (
                <div className="flex gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p>
                    За {monthTitle} уже есть оплата на <b className="num">{formatMoney(paid)}</b>. Новая запись её заменит.
                  </p>
                </div>
              )}

              <Field label="Комментарий" htmlFor="pay-notes" aside={<span className="num text-xs text-muted-foreground">{form.notes.length}/500</span>}>
                <Textarea
                  id="pay-notes"
                  placeholder="Способ оплаты, номер транзакции…"
                  value={form.notes}
                  maxLength={500}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="min-h-20 resize-none"
                />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => submit(true)}>
              Сохранить и ещё
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** «Оплачено $300 из $1 000 · осталось $700» with the receipts so far. */
function MonthInfo({
  loading,
  error,
  ledger,
  monthTitle,
  hasRow,
  plan,
  paid,
  left,
  receipts,
  accountName,
}: {
  loading: boolean
  error: string | null
  ledger: boolean
  monthTitle: string
  hasRow: boolean
  plan: number
  paid: number
  left: number
  receipts: Receipt[]
  accountName: (id: string | null) => string | undefined
}) {
  if (loading) {
    return (
      <div className="rounded-lg border px-3 py-2.5" aria-busy>
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-2 h-1.5 w-full" />
      </div>
    )
  }
  if (error) {
    return <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">Не удалось загрузить оплаты за месяц: {error}</p>
  }

  const pct = plan > 0 ? Math.min(100, Math.round((paid / plan) * 100)) : paid > 0 ? 100 : 0
  const full = paid > 0 && left === 0

  return (
    <div className="rounded-lg border px-3 py-2.5 text-sm" aria-live="polite">
      {!hasRow || paid === 0 ? (
        <p className="text-muted-foreground">
          За {monthTitle} оплат ещё нет{plan > 0 && <> · план <span className="num text-foreground">{formatMoney(plan)}</span></>}
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-1.5">
            {full && <CheckCircle2 className="size-4 text-success" />}
            <span>
              Оплачено <b className="num font-semibold">{formatMoney(paid)}</b> из <span className="num">{formatMoney(plan)}</span>
            </span>
            <span className="text-muted-foreground">·</span>
            {full ? (
              <span className="text-success">месяц оплачен полностью</span>
            ) : (
              <span>
                осталось <b className="num font-semibold">{formatMoney(left)}</b>
              </span>
            )}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
            <div className={cn('h-full rounded-full', full ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {ledger && receipts.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t pt-2.5 text-xs text-muted-foreground">
          {receipts.map(t => (
            <li key={t.id} className="flex items-baseline gap-2">
              <span className="num w-[4.75rem] shrink-0">{formatDate(t.date)}</span>
              <span className="min-w-0 flex-1 truncate">{accountName(t.account_id) ?? t.account?.name ?? 'Счёт не указан'}</span>
              <span className="num shrink-0 font-medium text-foreground">{formatMoney(t.amount_usd)}</span>
              {t.currency !== 'USD' && t.original_amount ? (
                <span className="num shrink-0">({formatMoney(t.original_amount, t.currency)})</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
