'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox } from '@/components/erp/combobox'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { MONTHS_RU, formatMoney, todayISO } from '@/lib/format'
import {
  DEFAULT_RATE,
  accountsFor,
  pickAccount,
  readPref,
  writePref,
  type Account,
  type IncomeItem,
  type Participant,
} from '@/components/finance/types'

const LAST_ACCOUNT = 'last-income-account'
const LAST_RATE = 'last-tjs-rate'

function emptyForm() {
  const now = new Date()
  return {
    participant_id: '',
    amount: '',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    notes: '',
    account_id: '',
    paid_date: todayISO(),
  }
}

export function PaymentSheet({
  open,
  onOpenChange,
  participants,
  accounts,
  payments,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  participants: Participant[]
  accounts: Account[]
  payments: IncomeItem[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState(emptyForm)
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(DEFAULT_RATE)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const amountTouched = React.useRef(false)

  React.useEffect(() => {
    if (open) {
      setForm(emptyForm())
      setCurrency('USD')
      setRate(readPref(LAST_RATE) || DEFAULT_RATE)
      setErrors({})
      amountTouched.current = false
    }
  }, [open])

  const participant = participants.find(p => p.id === form.participant_id)
  const accountOptions = accountsFor(accounts, participant?.program_id)

  const participantOptions = React.useMemo(
    () =>
      participants
        .filter(p => p.status === 'active')
        .map(p => ({
          value: p.id,
          label: p.name,
          group: p.program?.name || 'Без программы',
          hint: (p.tariff || p.program?.price_per_month) ? `${formatMoney(p.tariff || p.program?.price_per_month)}/мес` : undefined,
        }))
        .sort((a, b) => a.group.localeCompare(b.group, 'ru') || a.label.localeCompare(b.label, 'ru')),
    [participants]
  )

  const selectParticipant = (id: string) => {
    const p = participants.find(x => x.id === id)
    const opts = accountsFor(accounts, p?.program_id)
    const tariff = p?.tariff || p?.program?.price_per_month
    setForm(f => ({
      ...f,
      participant_id: id,
      account_id: opts.some(a => a.id === f.account_id) ? f.account_id : pickAccount(opts, readPref(LAST_ACCOUNT)),
      amount: !amountTouched.current && tariff && currency === 'USD' ? String(tariff) : f.amount,
    }))
    setErrors(e => ({ ...e, participant_id: '' }))
  }

  const existing = payments.find(
    p => p.participantId === form.participant_id && p.month === Number(form.month) && p.year === Number(form.year)
  )

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!participant) errs.participant_id = 'Выберите участника'
    if (!(Number(form.amount) > 0)) errs.amount = 'Укажите сумму'
    if (currency === 'TJS' && !(Number(rate) > 0)) errs.amount = 'Укажите курс обмена'
    if (!form.account_id) errs.account_id = 'Выберите счёт'
    setErrors(errs)
    if (Object.keys(errs).length || !participant) return

    setSaving(true)
    const monthNum = Number(form.month)
    const original = Number(form.amount)
    const r = currency === 'TJS' ? Number(rate) : 1
    try {
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
          year: Number(form.year),
          status: 'paid',
          paid_date: form.paid_date || todayISO(),
          notes: form.notes || null,
          account_id: form.account_id,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      writePref(LAST_ACCOUNT, form.account_id)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success('Поступление сохранено', {
        description: `${participant.name} · ${formatMoney(original, currency)}`,
      })
      onSaved()
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
            <SheetDescription>Оплата участника за месяц обучения</SheetDescription>
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

              <Field label="Сумма" htmlFor="pay-amount" required hint={errors.amount && <span className="text-destructive">{errors.amount}</span>}>
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
                <Field label="За период">
                  <div className="flex gap-2">
                    <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                      <SelectTrigger className="w-full">
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
                      value={form.year}
                      onChange={e => setForm(f => ({ ...f, year: e.target.value.replace(/\D/g, '') }))}
                      className="num w-[4.5rem] shrink-0 text-center"
                    />
                  </div>
                </Field>
              </div>

              {existing && (
                <div className="flex gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p>
                    За {MONTHS_RU[existing.month - 1].toLowerCase()} {existing.year} уже есть оплата на{' '}
                    <b className="num">{formatMoney(existing.amount)}</b>. Новая запись её заменит.
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
