'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox } from '@/components/erp/combobox'
import { MoneyInput, type Currency } from '@/components/finance/money-input'
import { formatMoney, todayISO } from '@/lib/format'
import {
  DEFAULT_RATE,
  accountsFor,
  pickAccount,
  readPref,
  writePref,
  type Account,
  type Employee,
  type ExpenseItem,
  type Program,
} from '@/components/finance/types'

const LAST_ACCOUNT = 'last-expense-account'
const LAST_RATE = 'last-tjs-rate'
const SALARY = 'Зарплаты'

export const DEFAULT_CATEGORIES = ['Зарплаты', 'Маркетинг', 'Офис', 'Мероприятия', 'Бонусы', 'Организационные', 'Прочее']

interface FormState {
  id?: string
  name: string
  amount: string
  category: string
  date: string
  description: string
  employee_id?: string
  program_id: string
  account_id: string
}

function emptyForm(): FormState {
  return { name: '', amount: '', category: '', date: todayISO(), description: '', program_id: '', account_id: '' }
}

export function ExpenseSheet({
  open,
  onOpenChange,
  editing,
  categories,
  programs,
  accounts,
  employees,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ExpenseItem | null
  categories: string[]
  programs: Program[]
  accounts: Account[]
  employees: Employee[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [currency, setCurrency] = React.useState<Currency>('USD')
  const [rate, setRate] = React.useState(DEFAULT_RATE)
  const [customCategory, setCustomCategory] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    setCustomCategory(false)
    if (editing) {
      setCurrency((editing.currency as Currency) || 'USD')
      setRate(String(editing.exchange_rate || readPref(LAST_RATE) || DEFAULT_RATE))
      setForm({
        id: editing.id,
        name: editing.name,
        amount: String(editing.original_amount || editing.amount),
        category: editing.category,
        date: editing.date,
        description: editing.description || '',
        program_id: editing.program_id || '',
        account_id: editing.account_id || '',
      })
    } else {
      setCurrency('USD')
      setRate(readPref(LAST_RATE) || DEFAULT_RATE)
      setForm({ ...emptyForm(), account_id: pickAccount(accountsFor(accounts, null), readPref(LAST_ACCOUNT)) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const accountOptions = accountsFor(accounts, form.program_id || null)

  const setProgram = (v: string) => {
    const programId = v === 'none' ? '' : v
    const opts = accountsFor(accounts, programId || null)
    setForm(f => ({
      ...f,
      program_id: programId,
      account_id: opts.some(a => a.id === f.account_id) ? f.account_id : pickAccount(opts, readPref(LAST_ACCOUNT)),
    }))
  }

  const employeeOptions = employees
    .filter(e => e.status === 'active')
    .map(e => ({ value: e.id, label: `${e.first_name} ${e.last_name}`, hint: e.position }))

  const submit = async (addAnother: boolean) => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Укажите название'
    if (!(Number(form.amount) > 0)) errs.amount = 'Укажите сумму'
    if (currency === 'TJS' && !(Number(rate) > 0)) errs.amount = 'Укажите курс обмена'
    if (!form.account_id) errs.account_id = 'Выберите счёт списания'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    const original = Number(form.amount)
    const r = currency === 'TJS' ? Number(rate) : 1
    const isEdit = !!form.id
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        amount: original / r,
        original_amount: original,
        currency,
        exchange_rate: r,
        category: form.category || 'Прочее',
        expense_date: form.date,
        description: form.description,
        status: 'approved',
        employee_id: form.employee_id,
        program_id: form.program_id || null,
        account_id: form.account_id,
      }
      if (isEdit) body.id = form.id
      const res = await fetch('/api/expenses', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      writePref(LAST_ACCOUNT, form.account_id)
      if (currency === 'TJS') writePref(LAST_RATE, rate)
      toast.success(isEdit ? 'Расход обновлён' : 'Расход добавлен', {
        description: `${form.name.trim()} · ${formatMoney(original, currency)}`,
      })
      onSaved()
      if (addAnother && !isEdit) {
        setForm(f => ({ ...emptyForm(), account_id: f.account_id, program_id: f.program_id, category: f.category, date: f.date }))
      } else {
        onOpenChange(false)
      }
    } catch (err: any) {
      toast.error('Не удалось сохранить', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const isEdit = !!form.id

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
            <SheetDescription>{isEdit ? 'Изменения сразу отразятся на балансе счёта' : 'Списание со счёта компании'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Категория">
                {customCategory ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      placeholder="Название новой категории"
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    />
                    <Button type="button" variant="ghost" onClick={() => { setCustomCategory(false); setForm(f => ({ ...f, category: '' })) }}>
                      Список
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(c => {
                      const active = form.category === c
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setForm(f => ({ ...f, category: active ? '' : c, employee_id: c === SALARY ? f.employee_id : undefined }))}
                          className={cn(
                            'h-7 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                            active
                              ? 'border-primary bg-primary-soft font-medium text-primary-soft-foreground'
                              : 'border-input bg-card text-foreground/80 hover:border-ring/40 hover:text-foreground'
                          )}
                        >
                          {c}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => { setCustomCategory(true); setForm(f => ({ ...f, category: '' })) }}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-input px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
                    >
                      <Plus className="size-3.5" /> Своя
                    </button>
                  </div>
                )}
              </Field>

              {form.category === SALARY && (
                <Field label="Сотрудник" hint="Название заполнится автоматически, выплата попадёт в зарплатную ведомость">
                  <Combobox
                    value={form.employee_id || ''}
                    onChange={id => {
                      const emp = employees.find(e => e.id === id)
                      if (emp) setForm(f => ({ ...f, employee_id: id, name: `Зарплата: ${emp.first_name} ${emp.last_name}` }))
                    }}
                    options={employeeOptions}
                    placeholder="Выберите сотрудника"
                    searchPlaceholder="Имя сотрудника…"
                  />
                </Field>
              )}

              <Field label="Название" htmlFor="exp-name" required hint={errors.name && <span className="text-destructive">{errors.name}</span>}>
                <Input
                  id="exp-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Например: аренда офиса за октябрь"
                  aria-invalid={!!errors.name || undefined}
                />
              </Field>

              <Field label="Сумма" htmlFor="exp-amount" required hint={errors.amount && <span className="text-destructive">{errors.amount}</span>}>
                <MoneyInput
                  id="exp-amount"
                  amount={form.amount}
                  onAmountChange={v => setForm(f => ({ ...f, amount: v }))}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  rate={rate}
                  onRateChange={setRate}
                  rateDate={form.date}
                  rateLocked={!!editing && editing.currency === 'TJS' && Number(editing.exchange_rate) > 1}
                  invalid={!!errors.amount}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Дата" htmlFor="exp-date" required>
                  <Input id="exp-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </Field>
                <Field label="Программа">
                  <Select value={form.program_id || 'none'} onValueChange={setProgram}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без программы</SelectItem>
                      {programs.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Счёт списания" required hint={errors.account_id && <span className="text-destructive">{errors.account_id}</span>}>
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

              <Field label="Комментарий" htmlFor="exp-desc">
                <Textarea
                  id="exp-desc"
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
