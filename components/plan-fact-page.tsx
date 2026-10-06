'use client'

import * as React from 'react'
import { CheckCircle2, MessageSquareText, Receipt, Target } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU, formatMoney, formatNumber, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TableSkeleton, TotalsBar } from '@/components/erp/table-parts'
import { ChartLegend, ChartTooltip, axisProps, compactTick, gridProps } from '@/components/erp/chart'
import { Deviation, LoadError, Meter, PanelHead, ProgramSelect, cents, usePref } from '@/components/analytics/parts'

interface MonthlyPayment {
  id: string
  month_number: number
  year: number
  amount: number // Plan amount for this payment
  fact_amount: number // Fact amount paid
  status: string
  notes?: string
  participant: {
    id: string
    name: string
    tariff?: number
  }
  program?: {
    id: string
    name: string
    price_per_month: number
  }
  program_id: string
}

interface Expense {
  id: string
  amount: number
  expense_date: string
  event_id?: string | null
}

interface Forecast {
  month_number: number
  year: number
  planned_income: number
  planned_expenses: number
}

type View = 'participants' | 'months' | 'deviation' | 'unpaid'

const monthNames = MONTHS_RU
const PAGE_SIZE = 25

const STATUS: Record<
  string,
  {
    label: string
    variant: 'success' | 'warning' | 'destructive' | 'secondary'
  }
> = {
  paid: { label: 'Оплачен', variant: 'success' },
  partial: { label: 'Частично', variant: 'warning' },
  overdue: { label: 'Просрочен', variant: 'destructive' },
  pending: { label: 'Ожидается', variant: 'secondary' },
}

/** Plan of a single payment: the same fallback chain as before the redesign. */
const planOf = (p: MonthlyPayment) => p.amount || p.participant?.tariff || p.program?.price_per_month || 0

const num = 'num text-right whitespace-nowrap'

export function PlanFactPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [payments, setPayments] = React.useState<MonthlyPayment[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [forecasts, setForecasts] = React.useState<Forecast[]>([])
  const [programs, setPrograms] = React.useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = usePref<string>('plan-fact-program', 'all')
  const [view, setView] = usePref<View>('plan-fact-view', 'participants')
  const [selectedMonth, setSelectedMonth] = React.useState<string>('all')
  const [query, setQuery] = React.useState('')
  const [unpaidPage, setUnpaidPage] = React.useState(1)

  const fetchData = React.useCallback(async () => {
    try {
      const [paymentsRes, expensesRes, forecastsRes, programsRes] = await Promise.all([
        fetch('/api/monthly-payments').then(res => res.json()),
        fetch('/api/expenses?exclude_events=true').then(res => res.json()),
        fetch('/api/forecasts').then(res => res.json()),
        fetch('/api/programs').then(res => res.json()),
      ])

      if (paymentsRes.error) throw new Error('Платежи: ' + paymentsRes.error)
      if (expensesRes.error) throw new Error('Расходы: ' + expensesRes.error)
      if (forecastsRes.error) throw new Error('Прогнозы: ' + forecastsRes.error)
      if (programsRes.error) throw new Error('Программы: ' + programsRes.error)

      setPayments(paymentsRes.data || [])
      setExpenses(expensesRes.data || [])
      setForecasts(forecastsRes.data || [])
      setPrograms(programsRes.data || [])

      // Current month by default; if it has no payments yet, the latest month that does
      const current = new Date().getMonth() + 1
      const withPayments = new Set<number>((paymentsRes.data || []).map((p: MonthlyPayment) => p.month_number))
      const past = Array.from(withPayments).filter(m => m <= current)
      const pick =
        withPayments.has(current) || withPayments.size === 0 ? current : past.length ? Math.max(...past) : Math.max(...withPayments)
      setSelectedMonth(monthNames[pick - 1])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // A remembered program that no longer exists falls back to «all»
  React.useEffect(() => {
    if (!loading && filterProgram !== 'all' && !programs.some(p => p.id === filterProgram)) setFilterProgram('all')
  }, [loading, programs, filterProgram, setFilterProgram])

  React.useEffect(() => {
    setQuery('')
    setUnpaidPage(1)
  }, [view, filterProgram])

  const filteredPayments = React.useMemo(() => {
    return filterProgram === 'all' ? payments : payments.filter(p => p.program_id === filterProgram || p.program?.id === filterProgram)
  }, [payments, filterProgram])

  const data = React.useMemo(() => {
    const relevantMonths = Array.from({ length: 12 }, (_, i) => i + 1)

    return relevantMonths
      .map(monthNum => {
        const forecast = forecasts.find(f => f.month_number === monthNum)

        const scheduledIncome = filteredPayments.filter(p => p.month_number === monthNum).reduce((sum, p) => sum + planOf(p), 0)

        // Only use forecast income if NO program filter is applied, otherwise calculate from filtered payments
        const planIncome = filterProgram === 'all' && forecast?.planned_income ? forecast.planned_income : scheduledIncome

        const factIncome = filteredPayments.filter(p => p.month_number === monthNum).reduce((sum, p) => sum + (p.fact_amount || 0), 0)

        const planExpense = forecast?.planned_expenses || 0

        const factExpense = expenses
          .filter(e => !e.event_id && new Date(e.expense_date).getMonth() + 1 === monthNum)
          .reduce((sum, e) => sum + e.amount, 0)

        return {
          month: monthNames[monthNum - 1],
          monthNum,
          planIncome,
          factIncome,
          planExpense,
          factExpense,
          planBalance: planIncome - planExpense,
          factBalance: factIncome - factExpense,
        }
      })
      .filter(d => d.planIncome > 0 || d.factIncome > 0 || d.factExpense > 0)
  }, [filteredPayments, expenses, forecasts, filterProgram])

  const totals = React.useMemo(
    () =>
      data.reduce(
        (a, d) => ({
          planIncome: a.planIncome + d.planIncome,
          factIncome: a.factIncome + d.factIncome,
          planExpense: a.planExpense + d.planExpense,
          factExpense: a.factExpense + d.factExpense,
          planBalance: a.planBalance + d.planBalance,
          factBalance: a.factBalance + d.factBalance,
        }),
        {
          planIncome: 0,
          factIncome: 0,
          planExpense: 0,
          factExpense: 0,
          planBalance: 0,
          factBalance: 0,
        },
      ),
    [data],
  )

  // Selected month
  const selectedMonthNum = monthNames.indexOf(selectedMonth) + 1
  const currentMonthData = data.find(d => d.month === selectedMonth)
  const currentMonthPayments = filteredPayments.filter(p => p.month_number === selectedMonthNum)
  const monthOptions = React.useMemo(() => {
    const set = new Set(data.map(d => d.month))
    if (selectedMonth !== 'all') set.add(selectedMonth)
    return monthNames.filter(m => set.has(m))
  }, [data, selectedMonth])

  const unpaidPayments = React.useMemo(
    () =>
      filteredPayments
        .filter(p => cents(p.fact_amount || 0) < cents(planOf(p))) // Not fully paid (ignoring float noise)
        .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month_number - a.month_number)),
    [filteredPayments],
  )

  const deviationAnalysis = data.map(item => ({
    month: item.month,
    label: MONTHS_SHORT_RU[item.monthNum - 1],
    incomeDev: item.factIncome - item.planIncome,
    expenseDev: item.factExpense - item.planExpense,
    balanceDev: item.factBalance - item.planBalance,
    rate: item.planIncome > 0 ? Math.round((item.factIncome / item.planIncome) * 100) : 0,
  }))

  if (error) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setLoading(true)
          fetchData()
        }}
      />
    )
  }

  const rate = totals.planIncome > 0 ? Math.round((totals.factIncome / totals.planIncome) * 100) : 0
  const avgIncomeDev = data.length > 0 ? data.reduce((acc, d) => acc + (d.factIncome - d.planIncome), 0) / data.length : 0

  const q = query.trim().toLowerCase()
  const match = (p: MonthlyPayment) => !q || p.participant?.name?.toLowerCase().includes(q) || p.program?.name?.toLowerCase().includes(q)
  const visibleMonthPayments = currentMonthPayments.filter(match)
  const visibleUnpaid = unpaidPayments.filter(match)
  const unpaidDebt = visibleUnpaid.reduce((s, p) => s + (planOf(p) - (p.fact_amount || 0)), 0)

  return (
    <PageContainer>
      <PageHeader
        title="План–факт"
        description="Насколько поступления и расходы совпали с планом"
        actions={<ProgramSelect value={filterProgram} onChange={setFilterProgram} programs={programs} />}
      />

      <StatStrip
        loading={loading}
        stats={[
          {
            label: 'Поступления, факт',
            dot: 'var(--chart-income)',
            value: formatMoney(totals.factIncome),
            sub: (
              <>
                план <span className="num">{formatMoney(totals.planIncome)}</span>
              </>
            ),
          },
          {
            label: 'Исполнение плана',
            value: `${rate}%`,
            tone: rate >= 100 ? 'success' : 'default',
            sub: <Meter value={rate} tone={rate >= 100 ? 'success' : 'default'} className="mt-2" />,
          },
          {
            label: 'Расходы, факт',
            dot: 'var(--chart-expense)',
            value: formatMoney(totals.factExpense),
            sub: (
              <>
                план <span className="num">{formatMoney(totals.planExpense)}</span>
              </>
            ),
          },
          {
            label: 'Отклонение поступлений',
            value: formatMoney(avgIncomeDev, 'USD', { sign: true }),
            tone: cents(avgIncomeDev) < 0 ? 'destructive' : cents(avgIncomeDev) > 0 ? 'success' : 'default',
            sub: 'в среднем за месяц',
          },
        ]}
      />

      <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Вид"
          value={view}
          onChange={setView}
          options={[
            { value: 'participants', label: 'По участникам' },
            {
              value: 'months',
              label: 'По месяцам',
              count: loading ? undefined : data.length,
            },
            { value: 'deviation', label: 'Отклонения' },
            {
              value: 'unpaid',
              label: 'Долги',
              count: loading ? undefined : unpaidPayments.length,
            },
          ]}
        />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : data.length === 0 && view !== 'unpaid' ? (
        <Panel>
          <EmptyState
            icon={Target}
            title="Пока нечего сравнивать"
            description="Здесь появятся данные, когда будут платежи, расходы или план на месяц"
          />
        </Panel>
      ) : view === 'participants' ? (
        <Panel>
          <PanelToolbar>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger size="sm" className="min-w-36" aria-label="Месяц">
                <SelectValue placeholder="Месяц" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput value={query} onChange={setQuery} placeholder="Участник или программа" />
          </PanelToolbar>
          {visibleMonthPayments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={currentMonthPayments.length ? 'Ничего не найдено' : `Платежей за ${selectedMonth.toLowerCase()} нет`}
              description={currentMonthPayments.length ? 'Измените поиск' : 'Выберите другой месяц'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Участник</TableHead>
                  <TableHead className="max-md:hidden">Программа</TableHead>
                  <TableHead className="text-right">План</TableHead>
                  <TableHead className="text-right">Факт</TableHead>
                  <TableHead className="text-right max-sm:hidden">Отклонение</TableHead>
                  <TableHead className="max-sm:hidden">Статус</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMonthPayments.map(payment => {
                  const planAmount = planOf(payment)
                  const deviation = (payment.fact_amount || 0) - planAmount
                  const st = STATUS[payment.status] ?? STATUS.pending
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div className="font-medium">{payment.participant?.name || 'Без имени'}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{payment.program?.name}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-md:hidden">{payment.program?.name ?? '—'}</TableCell>
                      <TableCell className={cn(num, 'text-muted-foreground')}>{formatMoney(planAmount)}</TableCell>
                      <TableCell className={cn(num, 'font-medium')}>
                        {formatMoney(payment.fact_amount || 0)}
                        <Deviation value={deviation} className="block text-xs font-normal sm:hidden" />
                      </TableCell>
                      <TableCell className={cn(num, 'max-sm:hidden')}>
                        <Deviation value={deviation} />
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{payment.notes && <NoteButton note={payment.notes} />}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {currentMonthPayments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t bg-muted/40 px-3 py-2.5 text-sm sm:px-4">
              <span className="text-muted-foreground">Итого за {selectedMonth.toLowerCase()}</span>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-muted-foreground">
                  План <span className="num font-medium text-foreground">{formatMoney(currentMonthData?.planIncome || 0)}</span>
                </span>
                <span className="text-muted-foreground">
                  Факт <span className="num font-medium text-foreground">{formatMoney(currentMonthData?.factIncome || 0)}</span>
                </span>
                <span className="text-muted-foreground">
                  Откл.{' '}
                  <Deviation value={(currentMonthData?.factIncome || 0) - (currentMonthData?.planIncome || 0)} className="font-semibold" />
                </span>
              </div>
            </div>
          )}
        </Panel>
      ) : view === 'months' ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <PlanFactChart
              title="Поступления"
              color="var(--chart-income)"
              data={data.map(d => ({
                label: MONTHS_SHORT_RU[d.monthNum - 1],
                plan: d.planIncome,
                fact: d.factIncome,
              }))}
            />
            <PlanFactChart
              title="Расходы"
              color="var(--chart-expense)"
              data={data.map(d => ({
                label: MONTHS_SHORT_RU[d.monthNum - 1],
                plan: d.planExpense,
                fact: d.factExpense,
              }))}
            />
          </div>
          <Panel>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead rowSpan={2} className="align-bottom">
                    Месяц
                  </TableHead>
                  <TableHead colSpan={3} className="h-8 border-l text-center max-sm:hidden">
                    Поступления
                  </TableHead>
                  <TableHead colSpan={2} className="h-8 border-l text-center sm:hidden">
                    Поступления
                  </TableHead>
                  <TableHead colSpan={3} className="h-8 border-l text-center max-md:hidden">
                    Расходы
                  </TableHead>
                  <TableHead colSpan={2} className="h-8 border-l text-center max-lg:hidden">
                    Сальдо
                  </TableHead>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <SubHead first>План</SubHead>
                  <SubHead>Факт</SubHead>
                  <SubHead className="max-sm:hidden">Откл.</SubHead>
                  <SubHead first className="max-md:hidden">
                    План
                  </SubHead>
                  <SubHead className="max-md:hidden">Факт</SubHead>
                  <SubHead className="max-md:hidden">Откл.</SubHead>
                  <SubHead first className="max-lg:hidden">
                    План
                  </SubHead>
                  <SubHead className="max-lg:hidden">Факт</SubHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(item => (
                  <TableRow key={item.monthNum}>
                    <TableCell className="font-medium">{item.month}</TableCell>
                    <TableCell className={cn(num, 'border-l text-muted-foreground')}>{formatMoney(item.planIncome)}</TableCell>
                    <TableCell className={num}>
                      {formatMoney(item.factIncome)}
                      <Deviation value={item.factIncome - item.planIncome} className="block text-xs sm:hidden" />
                    </TableCell>
                    <TableCell className={cn(num, 'max-sm:hidden')}>
                      <Deviation value={item.factIncome - item.planIncome} />
                    </TableCell>
                    <TableCell className={cn(num, 'border-l text-muted-foreground max-md:hidden')}>
                      {formatMoney(item.planExpense)}
                    </TableCell>
                    <TableCell className={cn(num, 'max-md:hidden')}>{formatMoney(item.factExpense)}</TableCell>
                    <TableCell className={cn(num, 'max-md:hidden')}>
                      <Deviation value={item.factExpense - item.planExpense} inverse />
                    </TableCell>
                    <TableCell className={cn(num, 'border-l text-muted-foreground max-lg:hidden')}>
                      {formatMoney(item.planBalance)}
                    </TableCell>
                    <TableCell className={cn(num, 'font-medium max-lg:hidden', item.factBalance < 0 && 'text-destructive')}>
                      {formatMoney(item.factBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-semibold">Итого</TableCell>
                  <TableCell className={cn(num, 'border-l text-muted-foreground')}>{formatMoney(totals.planIncome)}</TableCell>
                  <TableCell className={cn(num, 'font-semibold')}>
                    {formatMoney(totals.factIncome)}
                    <Deviation value={totals.factIncome - totals.planIncome} className="block text-xs sm:hidden" />
                  </TableCell>
                  <TableCell className={cn(num, 'max-sm:hidden')}>
                    <Deviation value={totals.factIncome - totals.planIncome} className="font-semibold" />
                  </TableCell>
                  <TableCell className={cn(num, 'border-l text-muted-foreground max-md:hidden')}>
                    {formatMoney(totals.planExpense)}
                  </TableCell>
                  <TableCell className={cn(num, 'font-semibold max-md:hidden')}>{formatMoney(totals.factExpense)}</TableCell>
                  <TableCell className={cn(num, 'max-md:hidden')}>
                    <Deviation value={totals.factExpense - totals.planExpense} inverse className="font-semibold" />
                  </TableCell>
                  <TableCell className={cn(num, 'border-l text-muted-foreground max-lg:hidden')}>
                    {formatMoney(totals.planBalance)}
                  </TableCell>
                  <TableCell className={cn(num, 'font-semibold max-lg:hidden', totals.factBalance < 0 && 'text-destructive')}>
                    {formatMoney(totals.factBalance)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Panel>
        </div>
      ) : view === 'deviation' ? (
        <div className="flex flex-col gap-3">
          <Panel className="p-4 sm:p-5">
            <PanelHead
              title="Отклонение от плана"
              description="Факт минус план по месяцам"
              aside={
                <ChartLegend
                  items={[
                    { label: 'Поступления', color: 'var(--chart-income)' },
                    { label: 'Расходы', color: 'var(--chart-expense)' },
                    { label: 'Сальдо', color: 'var(--foreground)' },
                  ]}
                />
              }
            />
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={deviationAnalysis} barGap={3} margin={{ left: -8, right: 4, top: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                <Tooltip
                  content={<ChartTooltip format={v => formatMoney(v, 'USD', { sign: true })} />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                />
                <Bar dataKey="incomeDev" name="Поступления" fill="var(--chart-income)" radius={[3, 3, 3, 3]} maxBarSize={24} />
                <Bar dataKey="expenseDev" name="Расходы" fill="var(--chart-expense)" radius={[3, 3, 3, 3]} maxBarSize={24} />
                <Line
                  dataKey="balanceDev"
                  name="Сальдо"
                  type="linear"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 2.5, fill: 'var(--foreground)', strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
          <Panel>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Месяц</TableHead>
                  <TableHead className="text-right">Поступления</TableHead>
                  <TableHead className="text-right max-sm:hidden">Расходы</TableHead>
                  <TableHead className="text-right max-md:hidden">Сальдо</TableHead>
                  <TableHead className="w-48 max-sm:w-28">Исполнение плана</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviationAnalysis.map(d => (
                  <TableRow key={d.month}>
                    <TableCell className="font-medium">{d.month}</TableCell>
                    <TableCell className={num}>
                      <Deviation value={d.incomeDev} />
                    </TableCell>
                    <TableCell className={cn(num, 'max-sm:hidden')}>
                      <Deviation value={d.expenseDev} inverse />
                    </TableCell>
                    <TableCell className={cn(num, 'max-md:hidden')}>
                      <Deviation value={d.balanceDev} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Meter value={d.rate} tone={d.rate >= 100 ? 'success' : d.rate >= 80 ? 'default' : 'warning'} className="flex-1" />
                        <span className="num w-11 text-right text-xs text-muted-foreground">{d.rate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
              Зелёный — лучше плана, красный — хуже. Для расходов перерасход считается отклонением в худшую сторону.
            </p>
          </Panel>
        </div>
      ) : (
        <Panel>
          <PanelToolbar>
            <SearchInput
              value={query}
              onChange={v => {
                setQuery(v)
                setUnpaidPage(1)
              }}
              placeholder="Участник или программа"
            />
          </PanelToolbar>
          {visibleUnpaid.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={unpaidPayments.length ? 'Ничего не найдено' : 'Долгов нет'}
              description={unpaidPayments.length ? 'Измените поиск' : 'Все участники оплатили полностью'}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Участник</TableHead>
                    <TableHead className="max-lg:hidden">Программа</TableHead>
                    <TableHead className="max-sm:hidden">Месяц</TableHead>
                    <TableHead className="text-right max-md:hidden">План</TableHead>
                    <TableHead className="text-right max-md:hidden">Факт</TableHead>
                    <TableHead className="text-right">Долг</TableHead>
                    <TableHead className="max-sm:hidden">Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUnpaid.slice((unpaidPage - 1) * PAGE_SIZE, unpaidPage * PAGE_SIZE).map(payment => {
                    const plan = planOf(payment)
                    const fact = payment.fact_amount || 0
                    const debt = plan - fact
                    const partial = fact > 0 && cents(fact) < cents(plan)
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div className="font-medium">{payment.participant?.name || 'Без имени'}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">
                            {monthNames[payment.month_number - 1]} {payment.year}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-lg:hidden">{payment.program?.name || 'Не указана'}</TableCell>
                        <TableCell className="num whitespace-nowrap max-sm:hidden">
                          {monthNames[payment.month_number - 1]} {payment.year}
                        </TableCell>
                        <TableCell className={cn(num, 'text-muted-foreground max-md:hidden')}>{formatMoney(plan)}</TableCell>
                        <TableCell className={cn(num, 'max-md:hidden')}>{formatMoney(fact)}</TableCell>
                        <TableCell className={cn(num, 'font-medium text-destructive')}>{formatMoney(debt)}</TableCell>
                        <TableCell className="max-sm:hidden">
                          <Badge variant={partial ? 'warning' : 'destructive'}>{partial ? 'Частично' : 'Не оплачено'}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TotalsBar
                label={`${formatNumber(visibleUnpaid.length)} ${plural(visibleUnpaid.length, ['платёж', 'платежа', 'платежей'])}`}
                value={formatMoney(unpaidDebt)}
                tone="destructive"
              />
              <TablePagination page={unpaidPage} pageSize={PAGE_SIZE} total={visibleUnpaid.length} onPageChange={setUnpaidPage} />
            </>
          )}
        </Panel>
      )}
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function SubHead({ first, className, children }: { first?: boolean; className?: string; children: React.ReactNode }) {
  return <TableHead className={cn('h-8 text-right text-xs', first && 'border-l', className)}>{children}</TableHead>
}

function NoteButton({ note }: { note: string }) {
  return (
    <Tip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Комментарий к платежу">
          <MessageSquareText className="text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-72 whitespace-pre-wrap">
        {note}
      </TooltipContent>
    </Tip>
  )
}

function PlanFactChart({ title, color, data }: { title: string; color: string; data: { label: string; plan: number; fact: number }[] }) {
  return (
    <Panel className="p-4 sm:p-5">
      <PanelHead
        title={title}
        aside={
          <ChartLegend
            items={[
              {
                label: 'План',
                color: `color-mix(in oklch, ${color} 35%, transparent)`,
              },
              { label: 'Факт', color },
            ]}
          />
        }
      />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
          <Bar dataKey="plan" name="План" fill={color} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="fact" name="Факт" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  )
}
