'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { readPref, writePref } from '@/components/finance/types'
import { formatMoney, todayISO } from '@/lib/format'
import { ChipGroup } from '@/components/events/parts'
import { SUPPLIER_KINDS, lenderLabel } from '@/lib/event-money'
import { EVENT_DEFAULT_RATE, LAST_RATE, num, type AccountLite, type EventLoan, type EventSupplier } from '@/components/events/types'

/** Shared by the money forms of an event. */

async function send(url: string, method: 'POST' | 'PUT', body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || result.error) throw new Error(result.message || result.error || `Ошибка ${res.status}`)
  return result.data
}

const asCurrency = (c: string | null | undefined): Currency => (c === 'TJS' ? 'TJS' : 'USD')

function submitKeys(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      fn()
    }
  }
}

/** «Год в деле 2 доллар · $1 234» */
export function AccountOption({ a }: { a: AccountLite }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="truncate">{a.name}</span>
      {a.balance != null && <span className="num text-xs text-muted-foreground">{formatMoney(a.balance, asCurrency(a.currency))}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Supplier: name, kind, contract amount, contact

export function SupplierSheet({
  open,
  onOpenChange,
  eventId,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  editing: EventSupplier | null
  onSaved: () => void
}) {
  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<string>('hotel')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [contact, setContact] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setName(editing?.name ?? '')
    setKind(editing?.kind ?? 'hotel')
    setAmount(editing && num(editing.contract_original) > 0 ? String(num(editing.contract_original)) : '')
    setCurrency(asCurrency(editing?.contract_currency ?? 'USD'))
    setRate(String(editing && num(editing.contract_rate) > 1 ? editing.contract_rate : readPref(LAST_RATE) || EVENT_DEFAULT_RATE))
    setContact(editing?.contact ?? '')
    setNote(editing?.note ?? '')
  }, [open, editing])

  const submit = async () => {
    if (!name.trim()) return setError('Укажите название')
    setSaving(true)
    try {
      const body = { name, kind, contract_original: Number(amount) || 0, currency, exchange_rate: Number(rate), contact, note }
      await send(editing ? `/api/offline-events/${eventId}/suppliers/${editing.id}` : `/api/offline-events/${eventId}/suppliers`, editing ? 'PUT' : 'POST', body)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success(editing ? 'Поставщик обновлён' : 'Поставщик добавлен', { description: name.trim() })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full flex-col" onSubmit={e => (e.preventDefault(), submit())} onKeyDown={submitKeys(submit)}>
          <SheetHeader>
            <SheetTitle>{editing ? editing.name : 'Новый поставщик'}</SheetTitle>
            <SheetDescription>Кому платим за мероприятие: тур-компания, отель, транспорт</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Кто это">
                <ChipGroup aria-label="Вид поставщика" value={kind} onChange={setKind} options={SUPPLIER_KINDS.map(k => ({ value: k.value, label: k.label }))} />
              </Field>
              <Field label="Название" htmlFor="sup-name" required hint={error && <span className="text-destructive">{error}</span>}>
                <Input id="sup-name" autoFocus={!editing} value={name} onChange={e => setName(e.target.value)} placeholder="Например: Borneo Highlands Resort" />
              </Field>
              <Field label="Сумма по договору" htmlFor="sup-amount" hint="Сколько всего нужно заплатить. Можно оставить пустым и указать позже">
                <MoneyInput id="sup-amount" amount={amount} onAmountChange={setAmount} currency={currency} onCurrencyChange={setCurrency} rate={rate} onRateChange={setRate} rateDate={todayISO()} />
              </Field>
              <Field label="Контакт" htmlFor="sup-contact">
                <Input id="sup-contact" value={contact} onChange={e => setContact(e.target.value)} placeholder="Менеджер, телефон, почта" />
              </Field>
              <Field label="Заметка" htmlFor="sup-note">
                <Textarea id="sup-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Условия, сроки оплаты" className="min-h-16 resize-none" />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Loan: from a «Год в деле» account or from a person

export function LoanSheet({
  open,
  onOpenChange,
  eventId,
  editing,
  accounts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  editing: EventLoan | null
  accounts: AccountLite[]
  onSaved: () => void
}) {
  const [source, setSource] = React.useState<'account' | 'person'>('person')
  const [accountId, setAccountId] = React.useState('')
  const [lender, setLender] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [receivedOn, setReceivedOn] = React.useState(todayISO())
  const [dueOn, setDueOn] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const account = accounts.find(a => a.id === accountId)
  const hasRepayments = !!editing?.repayments.length

  React.useEffect(() => {
    if (!open) return
    setSource(editing?.source ?? 'person')
    setAccountId(editing?.account_id ?? '')
    setLender(editing?.lender_name ?? '')
    setAmount(editing ? String(num(editing.original_amount)) : '')
    setCurrency(asCurrency(editing?.currency ?? 'USD'))
    setRate(String(editing && num(editing.exchange_rate) > 1 ? editing.exchange_rate : readPref(LAST_RATE) || EVENT_DEFAULT_RATE))
    setReceivedOn(editing?.received_on?.slice(0, 10) ?? todayISO())
    setDueOn(editing?.due_on?.slice(0, 10) ?? '')
    setNote(editing?.note ?? '')
  }, [open, editing])

  // A loan from an account is in the account's currency
  const pickAccount = (id: string) => {
    setAccountId(id)
    const acc = accounts.find(a => a.id === id)
    if (acc) setCurrency(asCurrency(acc.currency))
  }
  const changeCurrency = (c: Currency) => {
    if (hasRepayments) return toast.info('По займу уже есть возвраты: валюту не поменять')
    if (source === 'account' && account) return toast.info(`Счёт «${account.name}» в ${account.currency}`)
    setCurrency(c)
  }

  const submit = async () => {
    if (source === 'account' && !accountId) return toast.error('Выберите счёт «Год в деле»')
    if (source === 'person' && !lender.trim()) return toast.error('Укажите, у кого взяли')
    if (!(Number(amount) > 0)) return toast.error('Укажите сумму')
    setSaving(true)
    try {
      const body = {
        source,
        account_id: source === 'account' ? accountId : null,
        lender_name: source === 'person' ? lender : null,
        original_amount: Number(amount),
        currency,
        exchange_rate: Number(rate),
        received_on: receivedOn,
        due_on: dueOn || null,
        note,
      }
      await send(editing ? `/api/offline-events/${eventId}/loans/${editing.id}` : `/api/offline-events/${eventId}/loans`, editing ? 'PUT' : 'POST', body)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success(editing ? 'Займ обновлён' : 'Займ записан', { description: formatMoney(Number(amount), currency) })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить займ', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full flex-col" onSubmit={e => (e.preventDefault(), submit())} onKeyDown={submitKeys(submit)}>
          <SheetHeader>
            <SheetTitle>{editing ? 'Займ' : 'Взяли в долг'}</SheetTitle>
            <SheetDescription>Деньги на мероприятие, которые нужно вернуть</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Откуда деньги">
                <ChipGroup
                  aria-label="Откуда займ"
                  value={source}
                  onChange={v => setSource(v as 'account' | 'person')}
                  options={[
                    { value: 'person', label: 'У человека или компании' },
                    { value: 'account', label: 'Со счёта «Год в деле»' },
                  ]}
                />
              </Field>
              {source === 'account' ? (
                <Field label="Счёт" hint="Баланс счёта уменьшится на сумму займа и вырастет на каждый возврат">
                  <Select value={accountId || undefined} onValueChange={pickAccount}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите счёт" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <AccountOption a={a} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="У кого взяли" htmlFor="loan-lender">
                  <Input id="loan-lender" autoFocus={!editing} value={lender} onChange={e => setLender(e.target.value)} placeholder="Имя или компания" />
                </Field>
              )}
              <Field label="Сумма" htmlFor="loan-amount">
                <MoneyInput id="loan-amount" amount={amount} onAmountChange={setAmount} currency={currency} onCurrencyChange={changeCurrency} rate={rate} onRateChange={setRate} rateDate={receivedOn} rateLocked={!!editing} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Когда взяли" htmlFor="loan-received">
                  <Input id="loan-received" type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} />
                </Field>
                <Field label="Вернуть до" htmlFor="loan-due">
                  <Input id="loan-due" type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} min={receivedOn} />
                </Field>
              </div>
              <Field label="Заметка" htmlFor="loan-note">
                <Textarea id="loan-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Условия, на что брали" className="min-h-16 resize-none" />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Repayment of a loan, in the loan's currency

export function RepaymentSheet({
  open,
  onOpenChange,
  eventId,
  loan,
  accounts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  loan: EventLoan | null
  accounts: AccountLite[]
  onSaved: () => void
}) {
  const [amount, setAmount] = React.useState('')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [repaidOn, setRepaidOn] = React.useState(todayISO())
  const [accountId, setAccountId] = React.useState('none')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const currency = asCurrency(loan?.currency)

  React.useEffect(() => {
    if (!open || !loan) return
    setAmount(loan.totals.owed > 0 ? String(loan.totals.owed) : '')
    setRate(String(num(loan.exchange_rate) > 1 ? loan.exchange_rate : readPref(LAST_RATE) || EVENT_DEFAULT_RATE))
    setRepaidOn(todayISO())
    setAccountId('none')
    setNote('')
  }, [open, loan])

  if (!loan) return null
  const sameCurrency = accounts.filter(a => asCurrency(a.currency) === currency)

  const submit = async () => {
    if (!(Number(amount) > 0)) return toast.error('Укажите сумму')
    setSaving(true)
    try {
      await send(`/api/offline-events/${eventId}/loans/${loan.id}/repayments`, 'POST', {
        original_amount: Number(amount),
        exchange_rate: Number(rate),
        repaid_on: repaidOn,
        account_id: loan.source === 'person' && accountId !== 'none' ? accountId : null,
        note,
      })
      toast.success('Возврат записан', { description: formatMoney(Number(amount), currency) })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось записать возврат', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full flex-col" onSubmit={e => (e.preventDefault(), submit())} onKeyDown={submitKeys(submit)}>
          <SheetHeader>
            <SheetTitle>Вернуть займ</SheetTitle>
            <SheetDescription>
              {lenderLabel(loan, accounts)} · должны {formatMoney(loan.totals.owed, currency)} из {formatMoney(loan.totals.taken, currency)}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Сумма возврата" htmlFor="rep-amount" hint={`В валюте займа: ${currency}`}>
                <MoneyInput
                  id="rep-amount"
                  autoFocus
                  amount={amount}
                  onAmountChange={setAmount}
                  currency={currency}
                  onCurrencyChange={() => toast.info(`Займ в ${currency}: возврат в той же валюте`)}
                  rate={rate}
                  onRateChange={setRate}
                  rateDate={repaidOn}
                />
              </Field>
              <Field label="Дата" htmlFor="rep-date">
                <Input id="rep-date" type="date" value={repaidOn} onChange={e => setRepaidOn(e.target.value)} className="sm:w-48" />
              </Field>
              {loan.source === 'account' ? (
                <p className="text-sm text-muted-foreground">Деньги вернутся на счёт «{lenderLabel(loan, accounts)}», его баланс вырастет.</p>
              ) : (
                <Field label="Откуда вернули" hint="Если вернули со счёта «Год в деле», его баланс уменьшится">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не со счёта «Год в деле» (деньги мероприятия, наличные)</SelectItem>
                      {sameCurrency.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          <AccountOption a={a} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Заметка" htmlFor="rep-note">
                <Input id="rep-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно" />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Записать возврат'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
