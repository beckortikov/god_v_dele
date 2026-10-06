'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/erp/field'
import { EmptyState } from '@/components/erp/empty-state'
import { Checkbox } from '@/components/finance/checkbox'
import { MONTHS_RU, formatDate, formatMoney, plural, todayISO } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { fetchNbtRate } from '@/lib/exchange-rate'
import type { Account, ExpenseItem } from '@/components/finance/types'

const RECURRING_CATEGORIES = new Set(['Зарплаты', 'Офис'])
const RECURRING_NAME = /аренд|rent|интернет|связь|телефон|коммунал|свет|электр|подписк|хостинг|домен|уборк|охран/i

interface Row {
  src: ExpenseItem
  checked: boolean
  date: string
  amount: string
  currency: string
  status?: 'done' | 'error'
  error?: string
}

const monthKey = (iso: string) => iso.slice(0, 7)
const normName = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_RU[m - 1]} ${y}`
}

function prevMonthKey(today: string) {
  const [y, m] = today.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Same day of month in the target month, clamped to its last day. */
function sameDayIn(target: string, srcDate: string) {
  const [y, m] = target.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const day = Math.min(Number(srcDate.slice(8, 10)) || 1, last)
  return `${target}-${String(day).padStart(2, '0')}`
}

/** Amount in the expense's own currency. */
function originalOf(e: ExpenseItem) {
  return e.currency === 'TJS' ? Number(e.original_amount) || 0 : Number(e.amount) || 0
}

export function RepeatExpensesSheet({
  open,
  onOpenChange,
  expenses,
  accounts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  expenses: ExpenseItem[]
  accounts: Account[]
  onSaved: () => void
}) {
  const today = todayISO()
  const targetMonth = monthKey(today)
  const [source, setSource] = React.useState(() => prevMonthKey(today))
  const [rows, setRows] = React.useState<Row[]>([])
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)

  const monthOptions = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of expenses) {
      if (!e.date || e.event_id) continue
      const k = monthKey(e.date)
      if (k < targetMonth) counts.set(k, (counts.get(k) || 0) + 1)
    }
    const prev = prevMonthKey(today)
    if (!counts.has(prev)) counts.set(prev, 0)
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 18)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, targetMonth])

  // Existing expenses by month, to flag likely duplicates
  const existingByMonth = React.useMemo(() => {
    const map = new Map<string, ExpenseItem[]>()
    for (const e of expenses) {
      if (!e.date) continue
      const k = monthKey(e.date)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return map
  }, [expenses])

  const isDuplicate = React.useCallback(
    (name: string, amount: number, currency: string, date: string) => {
      const list = existingByMonth.get(monthKey(date)) || []
      const n = normName(name)
      return list.some(e => normName(e.name || '') === n && (e.currency || 'USD') === currency && roundMoney(originalOf(e)) === roundMoney(amount))
    },
    [existingByMonth]
  )

  const buildRows = React.useCallback(
    (month: string) =>
      expenses
        .filter(e => e.date && !e.event_id && monthKey(e.date) === month)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.name || '').localeCompare(b.name || '', 'ru'))
        .map((e): Row => {
          const currency = e.currency === 'TJS' ? 'TJS' : 'USD'
          const amount = roundMoney(originalOf(e))
          const date = sameDayIn(targetMonth, e.date)
          const typical = RECURRING_CATEGORIES.has(e.category) || RECURRING_NAME.test(e.name || '')
          return {
            src: e,
            currency,
            amount: String(amount),
            date,
            checked: typical && !isDuplicate(e.name || '', amount, currency, date),
          }
        }),
    [expenses, targetMonth, isDuplicate]
  )

  React.useEffect(() => {
    if (!open) return
    const prev = prevMonthKey(todayISO())
    setSource(prev)
    setRows(buildRows(prev))
    setProgress(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const changeSource = (m: string) => {
    setSource(m)
    setRows(buildRows(m))
  }

  const update = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const pending = rows.filter(r => r.status !== 'done')
  const selected = pending.filter(r => r.checked)
  const allChecked = pending.length > 0 && selected.length === pending.length
  const someChecked = selected.length > 0 && !allChecked
  const sum = (cur: string) => selected.filter(r => r.currency === cur).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalLabel = [sum('USD') > 0 && formatMoney(sum('USD')), sum('TJS') > 0 && formatMoney(sum('TJS'), 'TJS')].filter(Boolean).join(' + ')
  const accountName = (id?: string) => accounts.find(a => a.id === id)?.name
  const running = progress !== null && progress.done < progress.total

  const submit = async () => {
    const queue = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.checked && r.status !== 'done')
    // Validate first so nothing is half-created because of a typo
    let invalid = false
    for (const { r, i } of queue) {
      const err = !(Number(r.amount) > 0) ? 'Укажите сумму' : !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? 'Укажите дату' : ''
      if (err) {
        invalid = true
        update(i, { status: 'error', error: err })
      }
    }
    if (invalid || !queue.length) return

    setProgress({ done: 0, total: queue.length })
    let created = 0
    let failed = 0
    for (const { r, i } of queue) {
      try {
        const original = roundMoney(r.amount)
        let rate = 1
        if (r.currency === 'TJS') {
          rate = await fetchNbtRate(r.date, 'USD').then(
            x => x.rate,
            () => Number(r.src.exchange_rate) || 0
          )
          if (!(rate > 0)) throw new Error('Нет курса TJS на эту дату')
        }
        const body: Record<string, unknown> = {
          name: r.src.name,
          amount: original / rate,
          original_amount: original,
          currency: r.currency,
          exchange_rate: rate,
          category: r.src.category || 'Прочее',
          expense_date: r.date,
          description: r.src.description || '',
          status: 'approved',
          employee_id: r.src.employee_id || undefined,
          program_id: r.src.program_id || null,
          account_id: r.src.account_id || null,
        }
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        created++
        update(i, { status: 'done', error: undefined, checked: false })
      } catch (err: any) {
        failed++
        update(i, { status: 'error', error: err instanceof TypeError ? 'Нет связи с сервером' : err.message || 'Ошибка' })
      }
      setProgress(p => (p ? { ...p, done: p.done + 1 } : p))
    }

    if (created) onSaved()
    if (failed === 0) {
      toast.success(`Создано ${created} ${plural(created, ['расход', 'расхода', 'расходов'])}`, {
        description: `По образцу: ${monthLabel(source).toLowerCase()}`,
      })
      onOpenChange(false)
    } else {
      toast.error(`Не удалось создать ${failed} из ${queue.length}`, {
        description: created ? `Создано: ${created}. Ошибки отмечены в списке` : 'Ошибки отмечены в списке',
      })
      setProgress(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => !running && onOpenChange(o)}>
      <SheetContent className="sm:max-w-[640px]">
        <form
          className="flex h-full min-h-0 flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
        >
          <SheetHeader>
            <SheetTitle>Повторить расходы</SheetTitle>
            <SheetDescription>
              Регулярные платежи за {MONTHS_RU[Number(targetMonth.slice(5)) - 1].toLowerCase()} по образцу прошлого месяца
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            <Field label="Взять расходы за">
              <Select value={source} onValueChange={changeSource} disabled={running}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(([k, n]) => (
                    <SelectItem key={k} value={k}>
                      {monthLabel(k)} <span className="num text-muted-foreground">· {n}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {rows.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="В этом месяце расходов нет"
                description="Выберите другой месяц"
                className="rounded-lg border border-dashed py-10"
              />
            ) : (
              <div className="rounded-lg border">
                <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                    disabled={running || pending.length === 0}
                    onCheckedChange={v => setRows(rs => rs.map(r => (r.status === 'done' ? r : { ...r, checked: !!v })))}
                    aria-label="Выбрать все"
                  />
                  <span className="text-muted-foreground">
                    Выбрано <span className="num font-medium text-foreground">{selected.length}</span> из {pending.length}
                  </span>
                  {totalLabel && <span className="num ml-auto font-medium">{totalLabel}</span>}
                </label>
                <ul className="divide-y">
                  {rows.map((r, i) => {
                    const dup = r.status !== 'done' && isDuplicate(r.src.name || '', Number(r.amount) || 0, r.currency, r.date)
                    const done = r.status === 'done'
                    return (
                      <li key={r.src.id} className={cn('flex gap-3 px-3 py-3', done && 'bg-success-soft/40')}>
                        <Checkbox
                          className="mt-0.5"
                          checked={r.checked}
                          disabled={running || done}
                          onCheckedChange={v => update(i, { checked: !!v, status: r.status === 'error' ? undefined : r.status, error: undefined })}
                          aria-label={`Повторить «${r.src.name}»`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cn('min-w-0 truncate font-medium', !r.checked && !done && 'text-muted-foreground')}>{r.src.name}</span>
                            <Badge variant="secondary">{r.src.category || 'Прочее'}</Badge>
                            {done && (
                              <Badge variant="success">
                                <CheckCircle2 /> Создан
                              </Badge>
                            )}
                            {dup && (
                              <Badge variant="warning">
                                <AlertTriangle /> Уже есть в этом месяце
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Было {formatDate(r.src.date)} · {formatMoney(originalOf(r.src), r.currency)}
                            {accountName(r.src.account_id) && ` · ${accountName(r.src.account_id)}`}
                          </p>
                          {!done && (
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[160px_1fr]">
                              <Input
                                type="date"
                                aria-label="Дата"
                                value={r.date}
                                disabled={running}
                                onChange={e => update(i, { date: e.target.value, checked: true })}
                                className="h-8"
                              />
                              <div className="relative">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  aria-label="Сумма"
                                  value={r.amount}
                                  disabled={running}
                                  aria-invalid={(r.status === 'error' && !(Number(r.amount) > 0)) || undefined}
                                  onChange={e => update(i, { amount: e.target.value, checked: true })}
                                  className="num h-8 pr-12"
                                />
                                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{r.currency}</span>
                              </div>
                            </div>
                          )}
                          {r.status === 'error' && r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {rows.some(r => r.currency === 'TJS') && (
              <p className="text-xs text-muted-foreground">Для расходов в TJS курс берётся по НБТ на новую дату расхода.</p>
            )}
          </SheetBody>
          <SheetFooter className="flex-wrap">
            {progress ? (
              <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
                <span className="num shrink-0 text-muted-foreground">
                  {progress.done} из {progress.total}
                </span>
              </div>
            ) : (
              <>
                <Button type="submit" disabled={selected.length === 0}>
                  {selected.length ? `Создать ${selected.length} ${plural(selected.length, ['расход', 'расхода', 'расходов'])}` : 'Создать'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Отмена
                </Button>
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
