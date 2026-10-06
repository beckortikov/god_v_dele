'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowDownUp, Info, Loader2 } from 'lucide-react'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { formatMoney, todayISO } from '@/lib/format'
import { roundMoney, roundRate } from '@/lib/money'
import { fetchNbtRate, shortRateDate } from '@/lib/exchange-rate'
import type { Account } from '@/components/finance/types'

interface FormState {
  from: string
  to: string
  date: string
  amountFrom: string
  amountTo: string
  rate: string
  note: string
}

const empty = (): FormState => ({ from: '', to: '', date: todayISO(), amountFrom: '', amountTo: '', rate: '', note: '' })

/** NBT quotes everything in TJS, so any pair converts through it. */
async function nbtPair(fromCur: string, toCur: string, date: string) {
  const [a, b] = await Promise.all(
    [fromCur, toCur].map(c => (c === 'TJS' ? Promise.resolve({ rate: 1, date }) : fetchNbtRate(date, c)))
  )
  // Express the rate as "units of the cheaper currency per 1 unit of the dearer one"
  const baseIsFrom = a.rate >= b.rate
  return {
    baseIsFrom,
    rate: roundRate(baseIsFrom ? a.rate / b.rate : b.rate / a.rate),
    date: a.rate === 1 ? b.date : a.date,
  }
}

function inputLike(currency: string) {
  return (
    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
  )
}

export function TransferSheet({
  open,
  onOpenChange,
  accounts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  accounts: Account[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<FormState>(empty)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [rateManual, setRateManual] = React.useState(false)
  const [nbt, setNbt] = React.useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; date?: string }>({ state: 'idle' })
  // Which side of the pair is the "dearer" currency the rate is quoted for
  const [baseIsFrom, setBaseIsFrom] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    const def = accounts.find(a => a.is_default)
    setForm({ ...empty(), from: def?.id ?? '' })
    setErrors({})
    setRateManual(false)
    setNbt({ state: 'idle' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const from = accounts.find(a => a.id === form.from)
  const to = accounts.find(a => a.id === form.to)
  const fromCur = from?.currency ?? ''
  const toCur = to?.currency ?? ''
  const crossCurrency = !!from && !!to && fromCur !== toCur

  const convert = React.useCallback(
    (amountFrom: string, rate: string, base: boolean) => {
      const a = Number(amountFrom)
      const r = Number(rate)
      if (!(a > 0) || !(r > 0)) return ''
      return String(roundMoney(base ? a * r : a / r))
    },
    []
  )

  // Pre-fill the NBT rate for the pair and the date until the user sets their own
  React.useEffect(() => {
    if (!open || !crossCurrency) return
    const fallbackBase = fromCur !== 'TJS' // without NBT: the non-TJS side is the dearer one
    if (rateManual) return
    let alive = true
    setNbt({ state: 'loading' })
    nbtPair(fromCur, toCur, form.date).then(
      res => {
        if (!alive) return
        setBaseIsFrom(res.baseIsFrom)
        setNbt({ state: 'ok', date: res.date })
        setForm(f => ({ ...f, rate: String(res.rate), amountTo: convert(f.amountFrom, String(res.rate), res.baseIsFrom) }))
      },
      () => {
        if (!alive) return
        setBaseIsFrom(fallbackBase)
        setNbt({ state: 'error' })
      }
    )
    return () => {
      alive = false
    }
  }, [open, crossCurrency, fromCur, toCur, form.date, rateManual, convert])

  const baseCur = baseIsFrom ? fromCur : toCur
  const quoteCur = baseIsFrom ? toCur : fromCur

  const setAmountFrom = (v: string) =>
    setForm(f => ({ ...f, amountFrom: v, amountTo: crossCurrency ? convert(v, f.rate, baseIsFrom) : v }))
  const setRate = (v: string) => {
    setRateManual(true)
    setForm(f => ({ ...f, rate: v, amountTo: convert(f.amountFrom, v, baseIsFrom) }))
  }
  const setAmountTo = (v: string) => {
    setRateManual(true)
    setForm(f => {
      const a = Number(f.amountFrom)
      const b = Number(v)
      const rate = a > 0 && b > 0 ? String(roundRate(baseIsFrom ? b / a : a / b)) : f.rate
      return { ...f, amountTo: v, rate }
    })
  }
  const swap = () => {
    setForm(f => ({ ...f, from: f.to, to: f.from }))
    setRateManual(false)
  }

  const balance = from?.balance ?? null
  const overdraft = balance != null && Number(form.amountFrom) > 0 && Number(form.amountFrom) > balance

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!from) errs.from = 'Выберите счёт списания'
    if (!to) errs.to = 'Выберите счёт зачисления'
    else if (form.from === form.to) errs.to = 'Выберите другой счёт'
    if (!(Number(form.amountFrom) > 0)) errs.amountFrom = 'Укажите сумму'
    if (crossCurrency) {
      if (!(Number(form.rate) > 0)) errs.rate = 'Укажите курс'
      if (!(Number(form.amountTo) > 0)) errs.amountTo = 'Укажите сумму зачисления'
    }
    setErrors(errs)
    if (Object.keys(errs).length || !from || !to) return

    setSaving(true)
    try {
      const amountFrom = roundMoney(form.amountFrom)
      const amountTo = crossCurrency ? roundMoney(form.amountTo) : amountFrom
      const res = await fetch('/api/account-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_date: form.date,
          from_account_id: from.id,
          to_account_id: to.id,
          amount_from: amountFrom,
          amount_to: amountTo,
          exchange_rate: crossCurrency ? roundRate(form.rate) : 1,
          note: form.note.trim() || null,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.message || result.error)
      toast.success('Перевод выполнен', {
        description: `${from.name} → ${to.name} · ${formatMoney(amountFrom, fromCur)}${crossCurrency ? ` → ${formatMoney(amountTo, toCur)}` : ''}`,
      })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось выполнить перевод', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const accountItems = (exclude?: string) =>
    accounts
      .filter(a => a.id !== exclude)
      .map(a => (
        <SelectItem key={a.id} value={a.id}>
          {a.name} <span className="text-muted-foreground">· {formatMoney(a.balance ?? 0, a.currency)}</span>
        </SelectItem>
      ))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Перевод между счетами</SheetTitle>
            <SheetDescription>Обмен валюты или перемещение денег между кассами и картами</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Откуда" required hint={errors.from && <span className="text-destructive">{errors.from}</span>}>
                  <Select
                    value={form.from}
                    onValueChange={v => {
                      setRateManual(false)
                      setForm(f => ({ ...f, from: v, to: f.to === v ? '' : f.to }))
                    }}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!errors.from || undefined}>
                      <SelectValue placeholder="Счёт списания" />
                    </SelectTrigger>
                    <SelectContent>{accountItems()}</SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Куда"
                  required
                  hint={errors.to && <span className="text-destructive">{errors.to}</span>}
                  aside={
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={swap}
                      disabled={!form.from && !form.to}
                      className="-my-1 text-muted-foreground"
                    >
                      <ArrowDownUp /> Поменять местами
                    </Button>
                  }
                >
                  <Select
                    value={form.to}
                    onValueChange={v => {
                      setRateManual(false)
                      setForm(f => ({ ...f, to: v }))
                    }}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!errors.to || undefined}>
                      <SelectValue placeholder="Счёт зачисления" />
                    </SelectTrigger>
                    <SelectContent>{accountItems(form.from)}</SelectContent>
                  </Select>
                </Field>

              <Field
                label={crossCurrency ? 'Списать' : 'Сумма'}
                htmlFor="tr-from"
                required
                hint={
                  errors.amountFrom ? (
                    <span className="text-destructive">{errors.amountFrom}</span>
                  ) : from ? (
                    <span className={overdraft ? 'text-warning' : undefined}>
                      Остаток на счёте: <span className="num">{formatMoney(balance ?? 0, fromCur)}</span>
                      {overdraft && ' · после перевода уйдёт в минус'}
                    </span>
                  ) : null
                }
              >
                <div className="relative">
                  <Input
                    id="tr-from"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={form.amountFrom}
                    aria-invalid={!!errors.amountFrom || undefined}
                    onChange={e => setAmountFrom(e.target.value)}
                    className="num h-10 pr-14 text-base font-medium"
                  />
                  {fromCur && inputLike(fromCur)}
                </div>
              </Field>

              {crossCurrency && (
                <>
                  <Field
                    label="Курс"
                    htmlFor="tr-rate"
                    required
                    hint={
                      errors.rate ? (
                        <span className="text-destructive">{errors.rate}</span>
                      ) : nbt.state === 'loading' ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin" /> Загружаем курс НБТ…
                        </span>
                      ) : rateManual ? (
                        <span>
                          Свой курс ·{' '}
                          <button
                            type="button"
                            onClick={() => setRateManual(false)}
                            className="rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
                          >
                            Подставить курс НБТ
                          </button>
                        </span>
                      ) : nbt.state === 'ok' && nbt.date ? (
                        `курс НБТ на ${shortRateDate(nbt.date)}`
                      ) : nbt.state === 'error' ? (
                        'Курс НБТ недоступен, укажите курс вручную'
                      ) : null
                    }
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 text-muted-foreground">1 {baseCur} =</span>
                      <Input
                        id="tr-rate"
                        type="number"
                        inputMode="decimal"
                        step="0.0001"
                        min="0"
                        value={form.rate}
                        aria-invalid={!!errors.rate || undefined}
                        onChange={e => setRate(e.target.value)}
                        className="num h-9 w-28"
                      />
                      <span className="text-muted-foreground">{quoteCur}</span>
                    </div>
                  </Field>
                  <Field label="Зачислить" htmlFor="tr-to" required hint={errors.amountTo && <span className="text-destructive">{errors.amountTo}</span>}>
                    <div className="relative">
                      <Input
                        id="tr-to"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={form.amountTo}
                        aria-invalid={!!errors.amountTo || undefined}
                        onChange={e => setAmountTo(e.target.value)}
                        className="num h-10 pr-14 text-base font-medium"
                      />
                      {inputLike(toCur)}
                    </div>
                  </Field>
                </>
              )}

              <Field label="Дата" htmlFor="tr-date" required>
                <Input id="tr-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="sm:w-48" required />
              </Field>

              <Field label="Комментарий" htmlFor="tr-note">
                <Textarea
                  id="tr-note"
                  value={form.note}
                  maxLength={500}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Например: обмен в банке, инкассация"
                  className="min-h-16 resize-none"
                />
              </Field>

              {crossCurrency && Number(form.amountFrom) > 0 && Number(form.amountTo) > 0 && (
                <div className="flex gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p>
                    С «{from?.name}» спишется <b className="num">{formatMoney(form.amountFrom, fromCur)}</b>, на «{to?.name}» поступит{' '}
                    <b className="num">{formatMoney(form.amountTo, toCur)}</b>.
                  </p>
                </div>
              )}
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Перевод…' : 'Перевести'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
