'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LineChart as LineChartIcon, MessageSquareText, Pencil, Plus } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { Field, FieldGroup } from '@/components/erp/field'
import { Kbd, TableSkeleton, rowActionsCls } from '@/components/erp/table-parts'
import { ChartLegend, axisProps, compactTick, gridProps } from '@/components/erp/chart'
import { ChartSkeleton, LoadError, PanelHead } from '@/components/analytics/parts'

interface ForecastItem {
  id: string
  month_number: number
  year: number
  planned_income: number
  planned_expenses: number
  optimistic_income?: number
  pessimistic_income?: number
  confidence_level?: number
  notes?: string
}

type FormState = {
  month_number: string
  year: string
  planned_income: string
  planned_expenses: string
  optimistic_income: string
  pessimistic_income: string
}

const emptyForm = (month: number, year: number): FormState => ({
  month_number: String(month),
  year: String(year),
  planned_income: '',
  planned_expenses: '',
  optimistic_income: '',
  pessimistic_income: '',
})

const num = 'num text-right whitespace-nowrap'

export function BalanceForecastPage() {
  const [data, setData] = React.useState<ForecastItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ForecastItem | null>(null)

  const fetchForecasts = React.useCallback(() => {
    fetch('/api/forecasts')
      .then(res => res.json())
      .then(result => {
        if (result.error) throw new Error(result.error)
        setData(result.data || [])
        setError(null)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    fetchForecasts()
  }, [fetchForecasts])

  // Chronological order for the chart, the table and the running total
  const rows = React.useMemo(() => {
    let running = 0
    return [...data]
      .sort((a, b) => a.year - b.year || a.month_number - b.month_number)
      .map(item => {
        const balance = item.planned_income - item.planned_expenses
        running += balance
        return {
          item,
          label: `${MONTHS_SHORT_RU[item.month_number - 1] ?? item.month_number} ${String(item.year).slice(2)}`,
          forecast: item.planned_income,
          min: item.pessimistic_income || item.planned_income * 0.8,
          max: item.optimistic_income || item.planned_income * 1.2,
          expenses: item.planned_expenses,
          balance,
          running,
        }
      })
  }, [data])

  const chartData = rows.map(r => ({
    label: r.label,
    forecast: r.forecast,
    min: r.min,
    max: r.max,
    range: [Math.max(r.forecast - r.min, 0), Math.max(r.max - r.forecast, 0)],
    expenses: r.expenses,
    balance: r.balance,
    running: r.running,
  }))

  const totalIncome = rows.reduce((s, r) => s + r.forecast, 0)
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0)
  const totalBalance = totalIncome - totalExpenses
  const deficit = rows.filter(r => r.balance < 0)

  const openNew = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openEdit = (item: ForecastItem) => {
    setEditing(item)
    setSheetOpen(true)
  }

  if (error && !data.length) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setLoading(true)
          fetchForecasts()
        }}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Прогноз баланса"
        description="Плановые поступления и расходы по месяцам и диапазон сценариев"
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus /> Прогноз на месяц
          </Button>
        }
      />

      <StatStrip
        loading={loading}
        stats={[
          {
            label: 'Поступления по плану',
            dot: 'var(--chart-income)',
            value: formatMoney(totalIncome),
            sub: `${formatNumber(rows.length)} ${plural(rows.length, ['месяц', 'месяца', 'месяцев'])} в прогнозе`,
          },
          {
            label: 'Расходы по плану',
            dot: 'var(--chart-expense)',
            value: formatMoney(totalExpenses),
          },
          {
            label: 'Сальдо по плану',
            value: formatMoney(totalBalance, 'USD', { sign: true }),
            tone: totalBalance < 0 ? 'destructive' : 'default',
            sub: totalIncome > 0 ? `расходы — ${Math.round((totalExpenses / totalIncome) * 100)}% поступлений` : undefined,
          },
          {
            label: 'Месяцы с дефицитом',
            value: formatNumber(deficit.length),
            tone: deficit.length > 0 ? 'destructive' : 'default',
            sub: deficit.length > 0 ? deficit.map(r => r.label).join(', ') : 'кассовых разрывов не ожидается',
          },
        ]}
      />

      <div className="mt-3 flex flex-col gap-3">
        {loading ? (
          <>
            <ChartSkeleton height={280} />
            <TableSkeleton rows={4} toolbar={false} />
          </>
        ) : rows.length === 0 ? (
          <Panel>
            <EmptyState
              icon={LineChartIcon}
              title="Прогнозов пока нет"
              description="Задайте план поступлений и расходов на ближайшие месяцы, чтобы увидеть ожидаемое сальдо"
              action={
                <Button size="sm" onClick={openNew}>
                  <Plus /> Прогноз на месяц
                </Button>
              }
            />
          </Panel>
        ) : (
          <>
            <Panel className="p-4 sm:p-5">
              <PanelHead
                title="Прогноз по месяцам"
                description="Чёрточки на столбце поступлений — диапазон от пессимистичного до оптимистичного сценария"
                aside={
                  <ChartLegend
                    items={[
                      { label: 'Поступления', color: 'var(--chart-income)' },
                      { label: 'Расходы', color: 'var(--chart-expense)' },
                      { label: 'Нарастающее сальдо', color: 'var(--chart-1)' },
                    ]}
                  />
                }
              />
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} barGap={3} margin={{ left: -8, right: 4, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                  <Tooltip content={<ForecastTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                  <Bar dataKey="forecast" name="Поступления" fill="var(--chart-income)" radius={[4, 4, 0, 0]} barSize={rows.length > 8 ? undefined : 32} maxBarSize={36}>
                    <ErrorBar dataKey="range" width={8} strokeWidth={1.5} stroke="var(--foreground)" direction="y" />
                  </Bar>
                  <Bar dataKey="expenses" name="Расходы" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} barSize={rows.length > 8 ? undefined : 32} maxBarSize={36} />
                  <Line
                    dataKey="running"
                    name="Нарастающее сальдо"
                    type="linear"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }}
                    activeDot={{ r: 4.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>

            <Panel>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Месяц</TableHead>
                    <TableHead className="text-right max-md:hidden">Пессимистично</TableHead>
                    <TableHead className="text-right">Поступления</TableHead>
                    <TableHead className="text-right max-md:hidden">Оптимистично</TableHead>
                    <TableHead className="text-right">Расходы</TableHead>
                    <TableHead className="text-right max-sm:hidden">Сальдо</TableHead>
                    <TableHead className="text-right max-lg:hidden">Нарастающим итогом</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.item.id} className="group cursor-pointer" onClick={() => openEdit(r.item)}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {MONTHS_RU[r.item.month_number - 1]} {r.item.year}
                      </TableCell>
                      <TableCell className={cn(num, 'text-muted-foreground max-md:hidden')}>{formatMoney(r.min)}</TableCell>
                      <TableCell className={cn(num, 'font-medium')}>{formatMoney(r.forecast)}</TableCell>
                      <TableCell className={cn(num, 'text-muted-foreground max-md:hidden')}>{formatMoney(r.max)}</TableCell>
                      <TableCell className={num}>{formatMoney(r.expenses)}</TableCell>
                      <TableCell className={cn(num, 'font-medium max-sm:hidden', r.balance < 0 ? 'text-destructive' : 'text-success')}>
                        {formatMoney(r.balance, 'USD', { sign: true })}
                      </TableCell>
                      <TableCell className={cn(num, 'max-lg:hidden', r.running < 0 && 'text-destructive')}>
                        {formatMoney(r.running)}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {r.item.notes && (
                            <Tip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Комментарий">
                                  <MessageSquareText className="text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-72 whitespace-pre-wrap">
                                {r.item.notes}
                              </TooltipContent>
                            </Tip>
                          )}
                          <div className={rowActionsCls}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Изменить"
                              className="text-muted-foreground"
                              onClick={() => openEdit(r.item)}
                            >
                              <Pencil />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-semibold">Итого</TableCell>
                    <TableCell className="max-md:hidden" />
                    <TableCell className={cn(num, 'font-semibold')}>{formatMoney(totalIncome)}</TableCell>
                    <TableCell className="max-md:hidden" />
                    <TableCell className={cn(num, 'font-semibold')}>{formatMoney(totalExpenses)}</TableCell>
                    <TableCell className={cn(num, 'font-semibold max-sm:hidden', totalBalance < 0 ? 'text-destructive' : 'text-success')}>
                      {formatMoney(totalBalance, 'USD', { sign: true })}
                    </TableCell>
                    <TableCell className="max-lg:hidden" />
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </Panel>
          </>
        )}
      </div>

      <ForecastSheet open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} existing={data} onSaved={fetchForecasts} />
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function ForecastTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const row = (color: string | null, name: string, value: number, opts?: { sign?: boolean; muted?: boolean }) => (
    <p className="flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ background: color ?? 'transparent' }} />
      <span className="text-muted-foreground">{name}</span>
      <span className={cn('num ml-auto pl-4', opts?.muted ? 'text-muted-foreground' : 'font-medium')}>
        {formatMoney(value, 'USD', { sign: opts?.sign })}
      </span>
    </p>
  )
  return (
    <div className="min-w-56 space-y-0.5 rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{label}</p>
      {row('var(--chart-income)', 'Поступления', d.forecast)}
      {row(null, 'пессимистично', d.min, { muted: true })}
      {row(null, 'оптимистично', d.max, { muted: true })}
      {row('var(--chart-expense)', 'Расходы', d.expenses)}
      <div className="my-1 border-t" />
      {row(null, 'Сальдо месяца', d.balance, { sign: true })}
      {row('var(--chart-1)', 'Нарастающим итогом', d.running)}
    </div>
  )
}

function ForecastSheet({
  open,
  onOpenChange,
  editing,
  existing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ForecastItem | null
  existing: ForecastItem[]
  onSaved: () => void
}) {
  const [formData, setFormData] = React.useState<FormState>(() => emptyForm(new Date().getMonth() + 1, new Date().getFullYear()))
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [errors, setErrors] = React.useState<{ income?: boolean; expenses?: boolean }>({})
  const nextDefault = React.useRef<FormState | null>(null)

  const has = (m: number, y: number) => existing.some(f => f.month_number === m && f.year === y)

  React.useEffect(() => {
    if (!open) return
    setErrors({})
    if (editing) {
      setFormData({
        month_number: String(editing.month_number),
        year: String(editing.year),
        planned_income: String(editing.planned_income ?? ''),
        planned_expenses: String(editing.planned_expenses ?? ''),
        optimistic_income: editing.optimistic_income != null ? String(editing.optimistic_income) : '',
        pessimistic_income: editing.pessimistic_income != null ? String(editing.pessimistic_income) : '',
      })
      return
    }
    if (nextDefault.current) {
      setFormData(nextDefault.current)
      nextDefault.current = null
      return
    }
    // First month from now that has no forecast yet
    const now = new Date()
    let m = now.getMonth() + 1
    let y = now.getFullYear()
    for (let i = 0; i < 24 && has(m, y); i++) {
      m = m === 12 ? 1 : m + 1
      if (m === 1) y += 1
    }
    setFormData(emptyForm(m, y))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const set = (k: keyof FormState) => (v: string) => setFormData(f => ({ ...f, [k]: v }))

  const plannedInc = Number(formData.planned_income) || 0
  const plannedExp = Number(formData.planned_expenses) || 0
  const willOverwrite = !editing && has(Number(formData.month_number), Number(formData.year))

  const thisYear = new Date().getFullYear()
  const years = Array.from(new Set([thisYear - 1, thisYear, thisYear + 1, thisYear + 2, Number(formData.year)])).sort()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = { income: formData.planned_income.trim() === '', expenses: formData.planned_expenses.trim() === '' }
    setErrors(errs)
    if (errs.income || errs.expenses) return

    setSubmitLoading(true)
    try {
      const plannedInc = Number(formData.planned_income)
      const plannedExp = Number(formData.planned_expenses)
      // Default optimistic/pessimistic if not provided
      const opt = formData.optimistic_income ? Number(formData.optimistic_income) : plannedInc * 1.1
      const pes = formData.pessimistic_income ? Number(formData.pessimistic_income) : plannedInc * 0.9

      const payload = {
        month_number: Number(formData.month_number),
        year: Number(formData.year),
        planned_income: plannedInc,
        planned_expenses: plannedExp,
        optimistic_income: opt,
        pessimistic_income: pes,
      }

      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await res.json()
      if (result.error) throw new Error(result.error)

      toast.success(editing || willOverwrite ? 'Прогноз обновлён' : 'Прогноз сохранён', {
        description: `${MONTHS_RU[payload.month_number - 1]} ${payload.year}`,
      })
      onSaved()
      onOpenChange(false)
      if (!editing) {
        // Next time, start from the following month
        const nextM = payload.month_number === 12 ? 1 : payload.month_number + 1
        const nextY = payload.month_number === 12 ? payload.year + 1 : payload.year
        nextDefault.current = emptyForm(nextM, nextY)
      }
    } catch (err: any) {
      toast.error('Не удалось сохранить прогноз', { description: err.message })
    } finally {
      setSubmitLoading(false)
    }
  }

  const title = editing ? `${MONTHS_RU[editing.month_number - 1]} ${editing.year}` : 'Прогноз на месяц'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={handleSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.currentTarget.requestSubmit()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{editing ? 'Изменение плана на месяц' : 'Сколько планируете получить и потратить за месяц'}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              {!editing && (
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <Field label="Месяц">
                    <Select value={formData.month_number} onValueChange={set('month_number')}>
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
                  </Field>
                  <Field label="Год">
                    <Select value={formData.year} onValueChange={set('year')}>
                      <SelectTrigger className="w-full" aria-label="Год">
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
                  </Field>
                  {willOverwrite && (
                    <p className="col-span-2 -mt-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">
                      На этот месяц прогноз уже есть. После сохранения он будет заменён.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Поступления"
                  htmlFor="fc-income"
                  required
                  hint={errors.income && <span className="text-destructive">Укажите сумму</span>}
                >
                  <AmountInput
                    id="fc-income"
                    autoFocus
                    value={formData.planned_income}
                    onChange={v => {
                      set('planned_income')(v)
                      if (errors.income) setErrors(e => ({ ...e, income: false }))
                    }}
                    invalid={errors.income}
                  />
                </Field>
                <Field
                  label="Расходы"
                  htmlFor="fc-expenses"
                  required
                  hint={errors.expenses && <span className="text-destructive">Укажите сумму</span>}
                >
                  <AmountInput
                    id="fc-expenses"
                    value={formData.planned_expenses}
                    onChange={v => {
                      set('planned_expenses')(v)
                      if (errors.expenses) setErrors(e => ({ ...e, expenses: false }))
                    }}
                    invalid={errors.expenses}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">Сальдо месяца</span>
                <span
                  className={cn(
                    'num font-semibold',
                    plannedInc - plannedExp < 0 ? 'text-destructive' : plannedInc - plannedExp > 0 && 'text-success',
                  )}
                >
                  {formatMoney(plannedInc - plannedExp, 'USD', { sign: true })}
                </span>
              </div>

              <div>
                <p className="text-[13px] font-medium text-foreground/85">Сценарии поступлений</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Необязательно. Если оставить пустыми, будет ±10% от плана.</p>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <Field label="Пессимистично" htmlFor="fc-pes">
                    <AmountInput
                      id="fc-pes"
                      value={formData.pessimistic_income}
                      onChange={set('pessimistic_income')}
                      placeholder={plannedInc ? formatNumber(Math.round(plannedInc * 0.9)) : '0'}
                    />
                  </Field>
                  <Field label="Оптимистично" htmlFor="fc-opt">
                    <AmountInput
                      id="fc-opt"
                      value={formData.optimistic_income}
                      onChange={set('optimistic_income')}
                      placeholder={plannedInc ? formatNumber(Math.round(plannedInc * 1.1)) : '0'}
                    />
                  </Field>
                </div>
              </div>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={submitLoading}>
              {submitLoading ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd>
            </span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function AmountInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
  placeholder = '0',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  autoFocus?: boolean
  placeholder?: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={e => onChange(e.target.value)}
        className="num pl-7"
      />
    </div>
  )
}
