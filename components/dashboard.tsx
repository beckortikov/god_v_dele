'use client'

import * as React from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Receipt } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU, formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { StatStrip, type Stat } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { ChartLegend, ChartTooltip, axisProps, compactTick, gridProps } from '@/components/erp/chart'
import { useNav } from '@/components/app-shell/nav-context'
import { ChartSkeleton, LoadError, PanelHead, ProgramSelect, cents, usePref } from '@/components/analytics/parts'

interface DashboardData {
  metrics: {
    currentBalance: number
    monthlyRevenue: number
    monthlyExpenses: number
    cashRunway: number
  }
  overduePayments: Array<{
    name: string
    amount: number
    days: number
  }>
  /** Totals over every overdue month (the list above is only the top 10) */
  overdueSummary?: { payments: number; participants: number; amount: number }
  recentPayments: Array<{
    name: string
    program: string
    amount: number
    month: number
    year: number
    date: string
  }>
  chartData: Array<{
    month: string
    income: number
    expenses: number
    balance: number
    mrr: number
    participants: number
    paymentRate: number
  }>
}

const LIST_LIMIT = 5

const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

/** «в сентябре — $9 578» : the real previous-month figure for context. */
function prevMonthNote(previous: number | undefined, prevMonthIdx: number) {
  if (previous === undefined) return null
  return (
    <span>
      в {MONTHS_PREP[prevMonthIdx]} — <span className="num">{formatMoney(previous)}</span>
    </span>
  )
}

export function Dashboard() {
  const { navigate } = useNav()
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [programs, setPrograms] = React.useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = usePref<string>('dashboard-program', 'all')
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    fetch('/api/programs')
      .then(res => res.json())
      .then(result => {
        if (!result.error) setPrograms(result.data || [])
      })
      .catch(err => console.error('Error fetching programs:', err))
  }, [])

  // A remembered program that no longer exists falls back to «all»
  React.useEffect(() => {
    if (programs.length && filterProgram !== 'all' && !programs.some(p => p.id === filterProgram)) setFilterProgram('all')
  }, [programs, filterProgram, setFilterProgram])

  React.useEffect(() => {
    let cancelled = false
    const url = filterProgram === 'all' ? '/api/dashboard' : `/api/dashboard?program_id=${filterProgram}`
    setRefreshing(true)

    fetch(url)
      .then(res => res.json())
      .then(result => {
        if (cancelled) return
        if (result.error) {
          setError(result.error)
        } else {
          setData(result.data)
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [filterProgram, reloadKey])

  if (error && !data) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setLoading(true)
          setReloadKey(k => k + 1)
        }}
      />
    )
  }

  const now = new Date()
  const monthIdx = now.getMonth()
  const prevMonthIdx = (monthIdx + 11) % 12
  const chart = data?.chartData ?? []
  const prev = chart.length >= 2 ? chart[chart.length - 2] : undefined

  // Float noise like 1e-13 means «paid in full», not overdue
  const overdue = (data?.overduePayments ?? []).filter(p => cents(p.amount) > 0)
  const overdueCount = data?.overdueSummary?.payments ?? overdue.length
  const overdueSum = data?.overdueSummary?.amount ?? overdue.reduce((s, p) => s + p.amount, 0)
  const recent = data?.recentPayments ?? []

  const m = data?.metrics
  const stats: Stat[] = m
    ? [
        {
          label: 'Баланс с начала года',
          value: formatMoney(m.currentBalance),
          tone: m.currentBalance < 0 ? 'destructive' : 'default',
          sub: 'поступления минус расходы',
          onClick: () => navigate('income'),
        },
        {
          label: `Поступления · ${MONTHS_RU[monthIdx].toLowerCase()}`,
          dot: 'var(--chart-income)',
          value: formatMoney(m.monthlyRevenue),
          sub: prevMonthNote(prev?.income, prevMonthIdx) ?? 'с начала месяца',
        },
        {
          label: `Расходы · ${MONTHS_RU[monthIdx].toLowerCase()}`,
          dot: 'var(--chart-expense)',
          value: formatMoney(m.monthlyExpenses),
          sub: prevMonthNote(prev?.expenses, prevMonthIdx) ?? 'с начала месяца',
        },
        m.currentBalance > 0 && m.cashRunway > 0
          ? {
              label: 'Запас денег',
              value: `${m.cashRunway.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} мес.`,
              sub: 'при текущем темпе расходов',
            }
          : {
              label: 'Запас денег',
              value: '—',
              sub: 'баланс не положительный',
            },
      ]
    : [
        { label: 'Баланс с начала года', value: '' },
        { label: 'Поступления', value: '' },
        { label: 'Расходы', value: '' },
        { label: 'Запас денег', value: '' },
      ]

  const chartData = chart.map(c => ({ ...c, rate: c.paymentRate }))

  return (
    <PageContainer>
      <PageHeader
        title="Дашборд"
        description={`Ключевые показатели на ${formatDate(now, 'long')}`}
        actions={<ProgramSelect value={filterProgram} onChange={setFilterProgram} programs={programs} />}
      />

      <div className={cn('flex flex-col gap-3 transition-opacity duration-200', refreshing && !loading && 'opacity-60')}>
        <StatStrip stats={stats} loading={loading} />

        {!loading && overdue.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('participants')}
            className="group flex w-full items-center gap-3 rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 text-left transition-colors hover:border-destructive/40 focus-visible:ring-[3px] focus-visible:ring-destructive/25 focus-visible:outline-none"
          >
            <AlertCircle className="size-5 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium text-foreground">
                {overdueCount} {plural(overdueCount, ['просроченный платёж', 'просроченных платежа', 'просроченных платежей'])} на{' '}
                <span className="num">{formatMoney(overdueSum)}</span>
              </span>
              <span className="block text-muted-foreground sm:inline sm:before:content-['_·_']">Участники не оплатили прошлые месяцы</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-destructive max-sm:sr-only">К участникам</span>
            <ArrowRight className="size-4 shrink-0 text-destructive transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
            <Panel className="p-4 sm:p-5">
              <PanelHead
                title="Поступления и расходы"
                description="Последние 6 месяцев, по дате оплаты"
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
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} barGap={3} margin={{ left: -8, right: 4, top: 4 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                  <Bar dataKey="income" name="Поступления" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenses" name="Расходы" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line
                    dataKey="balance"
                    name="Сальдо"
                    type="linear"
                    stroke="var(--foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={{ r: 2.5, fill: 'var(--foreground)', strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="p-4 sm:p-5">
              <PanelHead title="Собираемость оплат" description="Доля оплаченных счетов за месяц" />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ left: -4, right: 4, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis {...axisProps} width={48} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={<RateTooltip />} />
                  <Bar dataKey="rate" name="Оплачено" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ListPanel
            title="Просроченные платежи"
            description="Неоплаченные прошлые месяцы"
            loading={loading}
            onAll={() => navigate('participants')}
            allLabel="Участники"
            items={overdue}
            empty={
              <EmptyState icon={CheckCircle2} title="Просрочек нет" description="Все участники оплатили прошлые месяцы" className="py-10" />
            }
            render={(p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    просрочка {formatNumber(p.days)} {plural(p.days, ['день', 'дня', 'дней'])}
                  </p>
                </div>
                <span className="num text-sm font-medium text-destructive">{formatMoney(p.amount)}</span>
              </li>
            )}
          />
          <ListPanel
            title="Последние поступления"
            description="Недавно отмеченные оплаты"
            loading={loading}
            onAll={() => navigate('income')}
            allLabel="Все поступления"
            items={recent}
            empty={
              <EmptyState icon={Receipt} title="Поступлений пока нет" description="Оплаты участников появятся здесь" className="py-10" />
            }
            render={(p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.program}
                    {p.month ? ` · за ${MONTHS_SHORT_RU[p.month - 1]}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm font-medium text-success">{formatMoney(p.amount, 'USD', { sign: true })}</p>
                  <p className="num text-xs text-muted-foreground">{formatDate(p.date)}</p>
                </div>
              </li>
            )}
          />
        </div>
      </div>
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function RateTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{label}</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-1" />
        <span className="text-muted-foreground">Оплачено</span>
        <span className="num ml-auto pl-3 font-medium">{row.rate}%</span>
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {formatNumber(row.participants)} {plural(row.participants, ['счёт', 'счёта', 'счетов'])} за месяц
      </p>
    </div>
  )
}

function ListPanel<T>({
  title,
  description,
  loading,
  items,
  render,
  empty,
  onAll,
  allLabel,
}: {
  title: string
  description: string
  loading: boolean
  items: T[]
  render: (item: T, i: number) => React.ReactNode
  empty: React.ReactNode
  onAll: () => void
  allLabel: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const shown = expanded ? items : items.slice(0, LIST_LIMIT)
  return (
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {title}
            {!loading && items.length > 0 && <span className="num ml-1.5 text-sm font-normal text-muted-foreground">{items.length}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={onAll}>
          {allLabel} <ArrowRight />
        </Button>
      </div>
      {loading ? (
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        empty
      ) : (
        <>
          <ul className="divide-y">{shown.map(render)}</ul>
          {items.length > LIST_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="mt-auto flex items-center justify-center gap-1 border-t px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {expanded ? 'Свернуть' : `Показать ещё ${items.length - LIST_LIMIT}`}
              <ChevronDown className={cn('size-4 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
          )}
        </>
      )}
    </Panel>
  )
}
