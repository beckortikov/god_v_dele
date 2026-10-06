'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { FileDown, FileSpreadsheet, FileText, Inbox, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { MONTHS_RU, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TableSkeleton, TotalsBar } from '@/components/erp/table-parts'
import { readPref, writePref } from '@/components/finance/types'
import { exportOpiuToExcel, exportOpiuToPDF } from '@/components/reports/opiu-export'
import { KV, Meter, Money, PeriodPicker, SectionRow, StatementRow, pct } from '@/components/reports/opiu-parts'
import type { OpiuReport, ParticipantPayment } from '@/components/reports/opiu-types'

interface Program {
  id: string
  name: string
}

type Tab = 'pnl' | 'accounts' | 'programs' | 'payments'
type PayFilter = 'all' | 'overdue' | 'partial' | 'paid'

const PREFS_KEY = 'opiu-page-prefs'
const PAGE_SIZE = 25

const PAY_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  paid: { label: 'Оплачено', variant: 'success' },
  partial: { label: 'Частично', variant: 'warning' },
  overdue: { label: 'Просрочено', variant: 'destructive' },
  unpaid: { label: 'Не оплачено', variant: 'secondary' },
}

export default function OPiUReportsPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reportData, setReportData] = React.useState<OpiuReport | null>(null)
  const [programs, setPrograms] = React.useState<Program[]>([])

  const [selectedMonth, setSelectedMonth] = React.useState(String(new Date().getMonth() + 1))
  const [selectedYear, setSelectedYear] = React.useState(String(new Date().getFullYear()))
  const [selectedProgram, setSelectedProgram] = React.useState('all')
  const [tab, setTab] = React.useState<Tab>('pnl')
  const [payFilter, setPayFilter] = React.useState<PayFilter>('all')
  const [exporting, setExporting] = React.useState<'pdf' | 'xlsx' | null>(null)

  const years = React.useMemo(() => Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)), [])

  // Restore the view the user left
  React.useEffect(() => {
    try {
      const saved = JSON.parse(readPref(PREFS_KEY) || '{}')
      if (saved.program) setSelectedProgram(saved.program)
      if (saved.tab) setTab(saved.tab)
    } catch {}
  }, [])

  React.useEffect(() => {
    writePref(PREFS_KEY, JSON.stringify({ program: selectedProgram, tab }))
  }, [selectedProgram, tab])

  React.useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/programs')
        const result = await res.json()
        setPrograms(result.data || [])
      } catch (error) {
        console.error('Error fetching programs:', error)
      }
    })()
  }, [])

  // Only the latest request may update the view (fast month switching)
  const requestId = React.useRef(0)
  const fetchReportData = React.useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        month: selectedMonth,
        year: selectedYear,
        program_id: selectedProgram,
      })
      const res = await fetch(`/api/opiu-reports?${params}`)
      const result = await res.json()
      if (id !== requestId.current) return
      if (result.error) throw new Error(result.error)
      setReportData(result.data ?? null)
      setError(null)
    } catch (err: any) {
      if (id !== requestId.current) return
      console.error('Error fetching report data:', err)
      setError(err.message || 'Неизвестная ошибка')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [selectedMonth, selectedYear, selectedProgram])

  React.useEffect(() => {
    fetchReportData()
  }, [fetchReportData])

  const runExport = async (kind: 'pdf' | 'xlsx') => {
    if (!reportData) return
    setExporting(kind)
    try {
      if (kind === 'pdf') exportOpiuToPDF(reportData)
      else exportOpiuToExcel(reportData)
    } catch (err: any) {
      toast.error('Не удалось сформировать файл', { description: err?.message })
    } finally {
      setExporting(null)
    }
  }

  const periodLabel = `${MONTHS_RU[Number(selectedMonth) - 1]} ${selectedYear}`
  const programLabel = selectedProgram === 'all' ? 'все программы' : programs.find(p => p.id === selectedProgram)?.name

  const r = reportData
  const firstLoad = loading && !r

  return (
    <PageContainer>
      <PageHeader
        title="Отчёт о прибылях и убытках"
        description={
          <>
            {periodLabel}
            {programLabel && <> · {programLabel}</>} · кассовый метод, USD
          </>
        }
        actions={
          <>
            <PeriodPicker
              month={selectedMonth}
              year={selectedYear}
              years={years}
              onChange={(m, y) => {
                setSelectedMonth(m)
                setSelectedYear(y)
              }}
            />
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Программа">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">Все программы</SelectItem>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => runExport('pdf')} disabled={!r || loading || !!exporting}>
              <FileText /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => runExport('xlsx')} disabled={!r || loading || !!exporting}>
              <FileSpreadsheet /> Excel
            </Button>
          </>
        }
      />

      {error && !r ? (
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось построить отчёт"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={fetchReportData}>
                Повторить
              </Button>
            }
          />
        </Panel>
      ) : firstLoad ? (
        <>
          <StatStrip loading stats={[{ label: 'Выручка', value: '' }, { label: 'Расходы', value: '' }, { label: 'Чистая прибыль', value: '' }, { label: 'Сальдо на конец', value: '' }]} />
          <div className="mt-6">
            <TableSkeleton rows={10} toolbar={false} />
          </div>
        </>
      ) : r ? (
        <div className={cn('transition-opacity duration-200', loading && 'pointer-events-none opacity-60')}>
          <ReportBody
            r={r}
            tab={tab}
            setTab={setTab}
            payFilter={payFilter}
            setPayFilter={setPayFilter}
            monthLabel={MONTHS_RU[r.period.month - 1] ?? r.period.month_name}
          />
        </div>
      ) : (
        <Panel>
          <EmptyState icon={FileDown} title="Нет данных для отображения" description="Выберите другой месяц или программу" />
        </Panel>
      )}
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function ReportBody({
  r,
  tab,
  setTab,
  payFilter,
  setPayFilter,
  monthLabel,
}: {
  r: OpiuReport
  tab: Tab
  setTab: (t: Tab) => void
  payFilter: PayFilter
  setPayFilter: (f: PayFilter) => void
  monthLabel: string
}) {
  const s = r.summary
  const m = r.ifrs_metrics

  const openPayments = (f: PayFilter) => {
    setPayFilter(f)
    setTab('payments')
  }

  return (
    <>
      <StatStrip
        stats={[
          {
            label: 'Выручка',
            dot: 'var(--chart-income)',
            value: formatMoney(s.fact_income),
            sub: (
              <>
                план {formatMoney(s.plan_income)} · <span className="num">{pct(s.completion_rate)}</span>
                {s.fact_income_tjs > 0 && <> · {formatMoney(s.fact_income_tjs, 'TJS')}</>}
              </>
            ),
          },
          {
            label: 'Расходы',
            dot: 'var(--chart-expense)',
            value: formatMoney(s.total_expenses),
            sub: s.total_expenses_tjs > 0 ? <>в т.ч. {formatMoney(s.total_expenses_tjs, 'TJS')}</> : 'в долларах',
          },
          {
            label: 'Чистая прибыль',
            value: formatMoney(s.net_profit, 'USD', { sign: true }),
            tone: s.net_profit < 0 ? 'destructive' : s.net_profit > 0 ? 'success' : 'default',
            sub: <>рентабельность {pct(m.profit_margin)}</>,
          },
          {
            label: 'Сальдо на конец',
            value: formatMoney(s.closing_balance_usd),
            tone: s.closing_balance_usd < 0 ? 'destructive' : 'default',
            sub: (
              <>
                на начало {formatMoney(s.opening_balance_usd)}
                {s.closing_balance_tjs !== 0 && <> · {formatMoney(s.closing_balance_tjs, 'TJS')}</>}
              </>
            ),
          },
        ]}
      />

      <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Раздел отчёта"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pnl', label: 'ОПиУ' },
            { value: 'accounts', label: 'Счета', count: s.account_balances?.length ?? 0 },
            { value: 'programs', label: 'Программы', count: r.program_analytics.length },
            { value: 'payments', label: 'Платежи участников', count: r.participant_payments.length },
          ]}
        />
      </div>

      {tab === 'pnl' ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Statement r={r} monthLabel={monthLabel} />
          <div className="flex flex-col gap-3">
            <PlanPanel r={r} onStatus={openPayments} />
            <CashPanel r={r} />
            <ParticipantsPanel r={r} />
          </div>
        </div>
      ) : tab === 'accounts' ? (
        <AccountsTable r={r} />
      ) : tab === 'programs' ? (
        <ProgramsTable r={r} />
      ) : (
        <PaymentsTable r={r} filter={payFilter} setFilter={setPayFilter} />
      )}
    </>
  )
}

// ---------- P&L statement ----------

function Statement({ r, monthLabel }: { r: OpiuReport; monthLabel: string }) {
  const m = r.ifrs_metrics
  const s = r.summary
  const revenue = m.revenue_recognized
  const share = (v: number) => (revenue > 0 ? (v / revenue) * 100 : null)

  const categories = Object.entries(m.expenses_by_category || {})
    .map(([name, v]) => ({ name, value: Number(v) || 0 }))
    .sort((a, b) => b.value - a.value)

  const COLS = 4
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-semibold">Отчёт о прибылях и убытках</h2>
        <span className="text-xs text-muted-foreground">
          {monthLabel} {r.period.year}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Статья</TableHead>
            <TableHead className="w-36 text-right">{monthLabel}</TableHead>
            <TableHead className="w-24 text-right max-sm:hidden">% выручки</TableHead>
            <TableHead className="w-36 text-right max-md:hidden">С начала года</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SectionRow label="Выручка" cols={COLS} />
          <StatementRow label="Начислено по плану" value={s.plan_income} ytd={m.ytd_plan} kind="muted" />
          <StatementRow label="Не получено от плана" hint="отложенная" value={m.deferred_revenue} kind="muted" />
          <StatementRow label="Признанная выручка" value={revenue} share={revenue > 0 ? 100 : null} ytd={m.ytd_revenue} kind="subtotal" />

          <SectionRow label="Расходы" cols={COLS} />
          {categories.map(c => (
            <StatementRow key={c.name} label={c.name} value={c.value} share={c.value ? share(c.value) : null} />
          ))}
          <StatementRow label="Итого расходов" value={m.total_expenses} share={share(m.total_expenses)} ytd={m.ytd_expenses} kind="subtotal" />

          <SectionRow label="Результат" cols={COLS} />
          <StatementRow label="Валовая прибыль" value={m.gross_profit} share={share(m.gross_profit)} ytd={m.ytd_gross_profit} />
          <StatementRow label="Операционная прибыль" value={m.operating_profit} share={share(m.operating_profit)} ytd={m.ytd_operating_profit} />
          <StatementRow label="Чистая прибыль" value={m.net_profit} share={share(m.net_profit)} ytd={m.ytd_net_profit} kind="result" />
          <StatementRow label="Рентабельность" value={m.profit_margin} ytd={m.ytd_profit_margin} format={pct} kind="muted" />

          <SectionRow label="Справочно" cols={COLS} />
          <StatementRow label="Дебиторская задолженность" value={m.accounts_receivable} kind="muted" />
          <StatementRow label="Просроченная задолженность" value={m.overdue_receivables} kind="muted" />
          <StatementRow label="Коэффициент инкассации" value={m.collection_rate} format={pct} kind="muted" />
          <StatementRow label="Выполнение плана" value={s.completion_rate} ytd={m.ytd_completion_rate} format={pct} kind="muted" />
        </TableBody>
      </Table>
    </Panel>
  )
}

// ---------- Side panels ----------

function SidePanel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel className="px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </Panel>
  )
}

function PlanPanel({ r, onStatus }: { r: OpiuReport; onStatus: (f: PayFilter) => void }) {
  const s = r.summary
  const rate = s.completion_rate
  const total = s.paid_count + s.partial_count + s.overdue_count
  const parts = [
    { key: 'paid' as const, label: 'Оплачено', n: s.paid_count, cls: 'bg-success' },
    { key: 'partial' as const, label: 'Частично', n: s.partial_count, cls: 'bg-warning' },
    { key: 'overdue' as const, label: 'Просрочено', n: s.overdue_count, cls: 'bg-destructive' },
  ]
  return (
    <SidePanel title="Выполнение плана" aside={<span className={cn('num text-lg font-semibold', rate >= 100 && 'text-success')}>{pct(rate)}</span>}>
      <Meter value={rate} tone={rate >= 100 ? 'success' : 'primary'} />
      <div className="mt-2 divide-y">
        <KV label="План">{formatMoney(s.plan_income)}</KV>
        <KV label="Факт">{formatMoney(s.fact_income)}</KV>
        <KV label="Отклонение">
          <Money value={s.deviation} sign />
        </KV>
      </div>

      <p className="mt-3 mb-1.5 text-xs text-muted-foreground">Статус оплат активных участников</p>
      {total > 0 ? (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {parts.map(p => (p.n > 0 ? <div key={p.key} className={p.cls} style={{ flex: p.n }} /> : null))}
        </div>
      ) : (
        <div className="h-2 rounded-full bg-muted" />
      )}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {parts.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => onStatus(p.key)}
            className="rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', p.cls)} /> {p.label}
            </span>
            <span className="num text-sm font-semibold">{formatNumber(p.n)}</span>
          </button>
        ))}
      </div>
    </SidePanel>
  )
}

function CashPanel({ r }: { r: OpiuReport }) {
  const s = r.summary
  const hasTJS = s.opening_balance_tjs !== 0 || s.fact_income_tjs !== 0 || s.total_expenses_tjs !== 0 || s.closing_balance_tjs !== 0
  const row = (label: string, usd: number, tjs: number, opts?: { strong?: boolean; sign?: boolean; plain?: boolean }) => {
    const val = (v: number, cur: string) =>
      opts?.plain ? <span className="num">{formatMoney(v, cur, { sign: opts?.sign })}</span> : <Money value={v} currency={cur} sign={opts?.sign} />
    return (
      <tr className={cn('border-b last:border-0', opts?.strong && 'font-semibold')}>
        <td className={cn('py-1.5 pr-2', !opts?.strong && 'text-muted-foreground')}>{label}</td>
        <td className="py-1.5 text-right whitespace-nowrap">{val(usd, 'USD')}</td>
        {hasTJS && <td className="py-1.5 pl-3 text-right whitespace-nowrap">{val(tjs, 'TJS')}</td>}
      </tr>
    )
  }
  return (
    <SidePanel title="Движение денег">
      <table className="w-full text-sm">
        {hasTJS && (
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th />
              <th className="pb-1 text-right font-medium">USD</th>
              <th className="pb-1 text-right font-medium">в сомони</th>
            </tr>
          </thead>
        )}
        <tbody>
          {row('На начало', s.opening_balance_usd, s.opening_balance_tjs)}
          {row('Поступления', s.fact_income, s.fact_income_tjs, { sign: true, plain: true })}
          {row('Расходы', -s.total_expenses, -s.total_expenses_tjs, { plain: true })}
          {row('На конец', s.closing_balance_usd, s.closing_balance_tjs, { strong: true })}
        </tbody>
      </table>
    </SidePanel>
  )
}

function ParticipantsPanel({ r }: { r: OpiuReport }) {
  const s = r.summary
  return (
    <SidePanel title="Участники" aside={<span className="num text-sm text-muted-foreground">{formatNumber(s.total_participants)} всего</span>}>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
        {[
          { label: 'Активные', v: s.active_participants },
          { label: 'Завершили', v: s.completed_participants },
          { label: 'В архиве', v: s.archived_participants ?? 0 },
        ].map(i => (
          <div key={i.label} className="bg-card px-2 py-2">
            <p className="num text-base font-semibold">{formatNumber(i.v)}</p>
            <p className="text-xs text-muted-foreground">{i.label}</p>
          </div>
        ))}
      </div>
    </SidePanel>
  )
}

// ---------- Accounts ----------

function AccountsTable({ r }: { r: OpiuReport }) {
  const accounts = r.summary.account_balances || []
  if (!accounts.length) {
    return (
      <Panel>
        <EmptyState icon={Inbox} title="Нет данных по счетам" description="Счета появятся здесь, как только будут созданы в разделе «Доходы и расходы»" />
      </Panel>
    )
  }
  const currencies = Array.from(new Set(accounts.map(a => a.currency)))
  const totals = currencies.map(cur => {
    const list = accounts.filter(a => a.currency === cur)
    const sum = (k: 'opening_balance' | 'fact_income' | 'total_expenses' | 'closing_balance') => list.reduce((t, a) => t + (Number(a[k]) || 0), 0)
    return { cur, opening: sum('opening_balance'), income: sum('fact_income'), expenses: sum('total_expenses'), closing: sum('closing_balance') }
  })

  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Счёт</TableHead>
            <TableHead className="text-right max-sm:hidden">На начало</TableHead>
            <TableHead className="text-right max-md:hidden">Приход</TableHead>
            <TableHead className="text-right max-md:hidden">Расход</TableHead>
            <TableHead className="text-right">На конец</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map(a => (
            <TableRow key={a.id}>
              <TableCell>
                <span className="font-medium">{a.name}</span>
                <Badge variant="secondary" className="ml-2">
                  {a.currency}
                </Badge>
              </TableCell>
              <TableCell className="text-right max-sm:hidden">
                <Money value={a.opening_balance} currency={a.currency} />
              </TableCell>
              <TableCell className="text-right max-md:hidden">
                {a.fact_income ? <span className="num text-success">{formatMoney(a.fact_income, a.currency, { sign: true })}</span> : <Money value={0} muteZero />}
              </TableCell>
              <TableCell className="text-right max-md:hidden">
                {a.total_expenses ? <span className="num">{formatMoney(-a.total_expenses, a.currency)}</span> : <Money value={0} muteZero />}
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Money value={a.closing_balance} currency={a.currency} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          {totals.map(t => (
            <TableRow key={t.cur} className="bg-muted/40 hover:bg-muted/40">
              <TableCell className="text-muted-foreground">Итого · {t.cur}</TableCell>
              <TableCell className="text-right max-sm:hidden">
                <Money value={t.opening} currency={t.cur} />
              </TableCell>
              <TableCell className="text-right max-md:hidden">
                <span className="num">{formatMoney(t.income, t.cur, { sign: true })}</span>
              </TableCell>
              <TableCell className="text-right max-md:hidden">
                <span className="num">{formatMoney(-t.expenses, t.cur)}</span>
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Money value={t.closing} currency={t.cur} />
              </TableCell>
            </TableRow>
          ))}
        </TableFooter>
      </Table>
    </Panel>
  )
}

// ---------- Programs ----------

function ProgramsTable({ r }: { r: OpiuReport }) {
  const rows = r.program_analytics
  if (!rows.length) {
    return (
      <Panel>
        <EmptyState icon={Users} title="Нет программ с участниками" description="Выберите другую программу или месяц" />
      </Panel>
    )
  }
  const sum = (k: 'plan_income' | 'fact_income' | 'fact_income_tjs' | 'active_participants' | 'total_participants') =>
    rows.reduce((t, p) => t + (Number(p[k]) || 0), 0)
  const totalPlan = sum('plan_income')
  const totalFact = sum('fact_income')

  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Программа</TableHead>
            <TableHead className="text-right max-sm:hidden">Участники</TableHead>
            <TableHead className="text-right max-md:hidden">План</TableHead>
            <TableHead className="text-right">Факт</TableHead>
            <TableHead className="text-right max-lg:hidden">Факт в сомони</TableHead>
            <TableHead className="w-44 max-sm:hidden">Выполнение</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(p => {
            const rate = p.plan_income > 0 ? (p.fact_income / p.plan_income) * 100 : 0
            return (
              <TableRow key={p.program_id ?? p.program_name}>
                <TableCell className="font-medium">{p.program_name}</TableCell>
                <TableCell className="text-right max-sm:hidden">
                  <span className="num">{formatNumber(p.active_participants)}</span>
                  <span className="num text-muted-foreground"> / {formatNumber(p.total_participants)}</span>
                </TableCell>
                <TableCell className="text-right text-muted-foreground max-md:hidden">
                  <span className="num">{formatMoney(p.plan_income)}</span>
                </TableCell>
                <TableCell className="text-right font-medium">
                  <span className="num">{formatMoney(p.fact_income)}</span>
                </TableCell>
                <TableCell className="text-right max-lg:hidden">
                  {p.fact_income_tjs > 0 ? <span className="num">{formatMoney(p.fact_income_tjs, 'TJS')}</span> : <Money value={0} muteZero />}
                </TableCell>
                <TableCell className="max-sm:hidden">
                  <div className="flex items-center gap-2">
                    <Meter value={rate} tone={rate >= 100 ? 'success' : 'primary'} className="flex-1" />
                    <span className={cn('num w-14 text-right text-xs', rate >= 100 ? 'text-success' : 'text-muted-foreground')}>{pct(rate)}</span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
            <TableCell>Итого</TableCell>
            <TableCell className="text-right max-sm:hidden">
              <span className="num">{formatNumber(sum('active_participants'))}</span>
              <span className="num font-normal text-muted-foreground"> / {formatNumber(sum('total_participants'))}</span>
            </TableCell>
            <TableCell className="text-right max-md:hidden">
              <span className="num">{formatMoney(totalPlan)}</span>
            </TableCell>
            <TableCell className="text-right">
              <span className="num">{formatMoney(totalFact)}</span>
            </TableCell>
            <TableCell className="text-right max-lg:hidden">
              <span className="num">{formatMoney(sum('fact_income_tjs'), 'TJS')}</span>
            </TableCell>
            <TableCell className="text-right max-sm:hidden">
              <span className="num text-xs">{pct(totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0)}</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Panel>
  )
}

// ---------- Participant payments ----------

function PaymentsTable({ r, filter, setFilter }: { r: OpiuReport; filter: PayFilter; setFilter: (f: PayFilter) => void }) {
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  React.useEffect(() => setPage(1), [query, filter])

  const all = r.participant_payments
  const count = (st: string) => all.filter(p => p.status === st).length
  const q = query.trim().toLowerCase()
  const visible = all
    .filter(p => filter === 'all' || p.status === filter)
    .filter(p => !q || p.participant_name?.toLowerCase().includes(q) || p.program_name?.toLowerCase().includes(q))
    .sort((a, b) => a.deviation - b.deviation)
  const factSum = visible.reduce((t, p) => t + (Number(p.fact) || 0), 0)
  const debt = visible.reduce((t, p) => t + Math.max(0, (Number(p.plan) || 0) - (Number(p.fact) || 0)), 0)

  return (
    <Panel>
      <PanelToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Участник или программа" className="sm:w-72" />
        <div className="overflow-x-auto scrollbar-none">
          <Segmented
            size="sm"
            aria-label="Статус оплаты"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все', count: all.length },
              { value: 'overdue', label: 'Просрочено', count: count('overdue') },
              { value: 'partial', label: 'Частично', count: count('partial') },
              { value: 'paid', label: 'Оплачено', count: count('paid') },
            ]}
          />
        </div>
      </PanelToolbar>
      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={all.length ? 'Никого не найдено' : 'Нет активных участников'}
          description={all.length ? 'Измените поиск или фильтр' : 'В этом месяце нет начислений по активным участникам'}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Участник</TableHead>
                <TableHead className="max-md:hidden">Программа</TableHead>
                <TableHead className="text-right max-sm:hidden">План</TableHead>
                <TableHead className="text-right">Факт</TableHead>
                <TableHead className="text-right max-sm:hidden">Отклонение</TableHead>
                <TableHead className="max-sm:hidden">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p: ParticipantPayment) => {
                const st = PAY_STATUS[p.status] ?? PAY_STATUS.unpaid
                return (
                  <TableRow key={p.participant_id}>
                    <TableCell className="max-w-72 whitespace-normal">
                      <div className="truncate font-medium">{p.participant_name}</div>
                      {p.notes && <div className="truncate text-xs text-muted-foreground">{p.notes}</div>}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-md:hidden">{p.program_name}</TableCell>
                    <TableCell className="text-right text-muted-foreground max-sm:hidden">
                      <span className="num">{formatMoney(p.plan)}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className="num">{formatMoney(p.fact)}</span>
                      {p.factTJS > 0 && <div className="num text-xs font-normal text-muted-foreground">{formatMoney(p.factTJS, 'TJS')}</div>}
                    </TableCell>
                    <TableCell className="text-right max-sm:hidden">
                      {p.deviation === 0 ? <Money value={0} muteZero /> : <Money value={p.deviation} sign />}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TotalsBar
            label={
              <>
                {formatNumber(visible.length)} {plural(visible.length, ['участник', 'участника', 'участников'])}
                {debt > 0 && <> · недоплата {formatMoney(debt)}</>}
              </>
            }
            value={formatMoney(factSum)}
          />
          <TablePagination page={page} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} />
        </>
      )}
    </Panel>
  )
}
