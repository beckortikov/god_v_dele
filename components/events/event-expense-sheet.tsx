'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup } from '@/components/erp/field'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { readPref, writePref } from '@/components/finance/types'
import { formatMoney, todayISO } from '@/lib/format'
import { ChipGroup } from '@/components/events/parts'
import { EVENT_DEFAULT_RATE, EXPENSE_CATEGORIES, LAST_RATE, categoryLabel, num, type EventExpense } from '@/components/events/types'

interface FormState {
  name: string
  amount: string
  category: string
  expense_date: string
  description: string
}

const empty = (): FormState => ({ name: '', amount: '', category: 'Other', expense_date: todayISO(), description: '' })

export function EventExpenseSheet({
  open,
  onOpenChange,
  eventId,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  editing: EventExpense | null
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<FormState>(empty)
  const [currency, setCurrency] = React.useState<Currency>('TJS')
  const [rate, setRate] = React.useState(EVENT_DEFAULT_RATE)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const isEdit = !!editing

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    if (editing) {
      const cur: Currency = editing.currency === 'TJS' ? 'TJS' : 'USD'
      const value = cur === 'TJS' ? num(editing.original_amount) : num(editing.amount)
      setCurrency(cur)
      setRate(String(num(editing.exchange_rate) > 1 ? editing.exchange_rate : readPref(LAST_RATE) || EVENT_DEFAULT_RATE))
      setForm({
        name: editing.name || '',
        amount: value ? String(Math.round(value * 100) / 100) : '',
        category: editing.category || 'Other',
        expense_date: (editing.expense_date || todayISO()).slice(0, 10),
        description: editing.description || '',
      })
    } else {
      setCurrency('TJS')
      setRate(readPref(LAST_RATE) || EVENT_DEFAULT_RATE)
      setForm(empty())
    }
  }, [open, editing])

  // Keep an unknown stored category selectable when editing
  const categoryOptions = React.useMemo(() => {
    const opts = EXPENSE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
    if (form.category && !opts.some(o => o.value === form.category)) opts.push({ value: form.category, label: categoryLabel(form.category) })
    return opts
  }, [form.category])

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Укажите название'
    if (!(Number(form.amount) > 0)) errs.amount = 'Укажите сумму'
    let finalAmountUSD = Number(form.amount)
    const originalAmount = Number(form.amount)
    let r = 1
    if (currency === 'TJS') {
      r = Number(rate)
      if (!r || r <= 0) errs.amount = 'Введите корректный курс обмена'
      else finalAmountUSD = originalAmount / r
    }
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const fields = {
        name: form.name.trim(),
        amount: finalAmountUSD,
        category: form.category,
        expense_date: form.expense_date,
        description: form.description,
        original_amount: originalAmount,
        currency,
        exchange_rate: r,
      }
      const res = isEdit
        ? await fetch(`/api/offline-events/${eventId}/expenses/${editing!.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
          })
        : await fetch(`/api/offline-events/${eventId}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...fields, status: 'approved' }),
          })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success(isEdit ? 'Расход обновлён' : 'Расход добавлен', {
        description: `${fields.name} · ${formatMoney(originalAmount, currency)}`,
      })
      onSaved()
      if (addAnother && !isEdit) {
        setForm(f => ({ ...empty(), category: f.category, expense_date: f.expense_date }))
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error('Не удалось сохранить расход', { description: err.message })
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
            <SheetTitle>{isEdit ? 'Редактирование расхода' : 'Новый расход'}</SheetTitle>
            <SheetDescription>{isEdit ? 'Итоги события пересчитаются автоматически' : 'Расход этого события'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Категория">
                <ChipGroup aria-label="Категория" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categoryOptions} />
              </Field>
              <Field label="Название" htmlFor="eexp-name" required hint={errors.name && <span className="text-destructive">{errors.name}</span>}>
                <Input
                  id="eexp-name"
                  autoFocus={!isEdit}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Например: аренда зала"
                  aria-invalid={!!errors.name || undefined}
                />
              </Field>
              <Field label="Сумма" htmlFor="eexp-amount" required hint={errors.amount && <span className="text-destructive">{errors.amount}</span>}>
                <MoneyInput
                  id="eexp-amount"
                  amount={form.amount}
                  onAmountChange={v => setForm(f => ({ ...f, amount: v }))}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  rate={rate}
                  onRateChange={setRate}
                  invalid={!!errors.amount}
                />
              </Field>
              <Field label="Дата" htmlFor="eexp-date">
                <Input
                  id="eexp-date"
                  type="date"
                  value={form.expense_date}
                  onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                  className="sm:w-48"
                />
              </Field>
              <Field label="Комментарий" htmlFor="eexp-desc">
                <Textarea
                  id="eexp-desc"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Необязательно"
                  className="min-h-16 resize-none"
                />
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            {!isEdit && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => submit(true)}>
                Сохранить и ещё
              </Button>
            )}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
