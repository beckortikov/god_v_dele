'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Upload,
  Wallet,
  Inbox,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'
import { MONTHS_SHORT_RU, formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { monthStatus } from '@/lib/payment-schedule'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TotalsBar, TableSkeleton, rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { CHART_COLORS, ChartTooltip, ChartLegend, axisProps, gridProps, compactTick } from '@/components/erp/chart'
import { useConfirm } from '@/components/erp/confirm'
import { useNavAction } from '@/components/app-shell/nav-context'
import { PaymentSheet } from '@/components/finance/payment-sheet'
import { ExpenseSheet, DEFAULT_CATEGORIES } from '@/components/finance/expense-sheet'
import { AccountSheet } from '@/components/finance/account-sheet'
import { RepeatExpensesSheet } from '@/components/finance/repeat-expenses-sheet'
import { ImportSheet, type ImportMode } from '@/components/finance/import-sheet'
import { TransfersPanel } from '@/components/finance/transfers-panel'
import {
  readPref,
  writePref,
  type Account,
  type Employee,
  type ExpenseItem,
  type IncomeItem,
  type Participant,
  type Program,
} from '@/components/finance/types'

type Tab = 'income' | 'expenses' | 'accounts' | 'analytics'
type Period = 'all' | 'month' | 'prev-month' | 'quarter' | 'year'

const PAGE_SIZE = 20
const PREFS_KEY = 'income-page-prefs'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prev-month', label: 'Прошлый месяц' },
  { value: 'quarter', label: 'Последние 3 месяца' },
  { value: 'year', label: 'Этот год' },
  { value: 'all', label: 'Всё время' },
]

function periodRange(p: Period): [Date, Date] | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (p) {
    case 'month':
      return [new Date(y, m, 1), new Date(y, m + 1, 1)]
    case 'prev-month':
      return [new Date(y, m - 1, 1), new Date(y, m, 1)]
    case 'quarter':
      return [new Date(y, m - 2, 1), new Date(y, m + 1, 1)]
    case 'year':
      return [new Date(y, 0, 1), new Date(y + 1, 0, 1)]
    default:
      return null
  }
}

function inRange(date: string, range: [Date, Date] | null) {
  if (!range) return true
  const d = new Date(date)
  return d >= range[0] && d < range[1]
}

const STATUS: Record<IncomeItem['status'], { label: string; variant: 'success' | 'destructive' | 'warning' }> = {
  paid: { label: 'Получен', variant: 'success' },
  partial: { label: 'Частично', variant: 'warning' },
  overdue: { label: 'Просрочен', variant: 'destructive' },
  pending: { label: 'Ожидается', variant: 'warning' },
}

/** Ledger mode: the receipt's month is covered in full, or only partly. */
const RECEIPT_STATUS: Partial<Record<IncomeItem['status'], { label: string; variant: 'success' | 'warning' }>> = {
  paid: { label: 'Месяц оплачен', variant: 'success' },
  partial: { label: 'Частично', variant: 'warning' },
}


export function IncomeExpensesPage() {
  const confirm = useConfirm()

  const [incomeData, setIncomeData] = React.useState<IncomeItem[]>([])
  const [expenseData, setExpenseData] = React.useState<ExpenseItem[]>([])
  const [participants, setParticipants] = React.useState<Participant[]>([])
  const [programs, setPrograms] = React.useState<Program[]>([])
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  // Partial payments (migration 014): the list shows individual receipts
  const [ledger, setLedger] = React.useState(false)

  // View state (persisted per user)
  const [tab, setTab] = React.useState<Tab>('income')
  const [period, setPeriod] = React.useState<Period>('all')
  const [program, setProgram] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [accountFilter, setAccountFilter] = React.useState('all')
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [incomePage, setIncomePage] = React.useState(1)
  const [expensePage, setExpensePage] = React.useState(1)

  // Sheets
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [editingExpense, setEditingExpense] = React.useState<ExpenseItem | null>(null)
  const [accountOpen, setAccountOpen] = React.useState(false)
  const [editingAccount, setEditingAccount] = React.useState<Account | null>(null)
  const [repeatOpen, setRepeatOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importMode, setImportMode] = React.useState<ImportMode>('expenses')
  // Expense requested via deep link (search), opened once the data is loaded
  const [pendingExpenseId, setPendingExpenseId] = React.useState<string | null>(null)

  React.useEffect(() => {
    try {
      const saved = JSON.parse(readPref(PREFS_KEY) || '{}')
      if (saved.tab) setTab(saved.tab)
      if (saved.period) setPeriod(saved.period)
      if (saved.program) setProgram(saved.program)
    } catch {}
  }, [])

  React.useEffect(() => {
    writePref(PREFS_KEY, JSON.stringify({ tab, period, program }))
  }, [tab, period, program])

  React.useEffect(() => {
    setIncomePage(1)
    setExpensePage(1)
  }, [period, program, query, accountFilter, categoryFilter])

  React.useEffect(() => {
    setQuery('')
    setAccountFilter('all')
    setCategoryFilter('all')
  }, [tab])

  const fetchData = React.useCallback(async () => {
    try {
      const [paymentsRes, expensesRes, participantsRes, programsRes, employeesRes, accountsRes, receiptsRes] = await Promise.all([
        fetch('/api/monthly-payments').then(r => r.json()),
        fetch('/api/expenses').then(r => r.json()),
        fetch('/api/participants').then(r => r.json()),
        fetch('/api/programs').then(r => r.json()),
        fetch('/api/hr/employees').then(r => r.json()).catch(() => []),
        fetch('/api/accounts').then(r => r.json()).catch(() => []),
        fetch('/api/payments/transactions')
          .then(r => r.json())
          .catch(() => ({ ledger: false, data: [] })),
      ])
      if (receiptsRes?.ledger && receiptsRes.error) throw new Error(receiptsRes.error)
      const isLedger = !!receiptsRes?.ledger
      for (const r of [paymentsRes, expensesRes, participantsRes, programsRes]) if (r.error) throw new Error(r.error)

      const progs: Program[] = programsRes.data || []
      const progName = (id?: string | null) => (id ? progs.find(p => p.id === id)?.name ?? null : null)

      setLedger(isLedger)
      setIncomeData(
        isLedger
          ? (receiptsRes.data || []).map((t: any): IncomeItem => {
              const st = monthStatus(t.monthly?.fact_amount, t.monthly?.plan_amount)
              return {
                id: t.id,
                date: t.date,
                participantId: t.participant_id,
                participant: t.participant?.name || 'Неизвестный участник',
                programId: t.program_id || t.participant?.program_id || null,
                programName: t.participant?.program?.name || progName(t.program_id || t.participant?.program_id),
                amount: Number(t.amount_usd) || 0,
                status: st === 'paid' ? 'paid' : 'partial',
                currency: t.currency,
                original_amount: t.original_amount ?? undefined,
                notes: t.notes ?? undefined,
                account_id: t.account_id ?? undefined,
                month: Number(t.month_number),
                year: Number(t.year),
                receipt: true,
              }
            })
          : (paymentsRes.data || [])
          .map((p: any): IncomeItem => ({
            id: p.id,
            date: p.paid_date || `${p.year}-${String(p.month_number).padStart(2, '0')}-01`,
            participantId: p.participant_id,
            participant: p.participant?.name || 'Неизвестный участник',
            programId: p.program_id || p.participant?.program_id || null,
            programName: p.program?.name || progName(p.participant?.program_id),
            amount: Number(p.fact_amount) || 0,
            status: p.status === 'paid' ? 'paid' : p.status === 'overdue' ? 'overdue' : 'pending',
            currency: p.currency,
            original_amount: p.original_amount,
            notes: p.notes,
            account_id: p.account_id,
            month: Number(p.month_number),
            year: Number(p.year),
          }))
          .filter((i: IncomeItem) => i.amount > 0)
      )
      setExpenseData(
        (expensesRes.data || []).map((e: any): ExpenseItem => ({
          id: e.id,
          date: e.expense_date,
          category: e.category,
          amount: Number(e.amount) || 0,
          description: e.description,
          name: e.name,
          currency: e.currency,
          original_amount: e.original_amount,
          program_id: e.program_id,
          program_name: progName(e.program_id) ?? undefined,
          account_id: e.account_id,
          exchange_rate: e.exchange_rate,
          employee_id: e.employee_id ?? undefined,
          event_id: e.event_id ?? undefined,
        }))
      )
      setParticipants(participantsRes.data || [])
      setPrograms(progs)
      setEmployees(Array.isArray(employeesRes) ? employeesRes : [])
      setAccounts(Array.isArray(accountsRes) ? accountsRes : [])
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

  // Requests coming from the global «Создать» menu / command palette
  useNavAction('new-payment', () => setPaymentOpen(true))
  useNavAction('new-expense', () => {
    setEditingExpense(null)
    setExpenseOpen(true)
  })
  useNavAction('open-expense', payload => {
    const id = payload?.id
    if (id == null || id === '') return
    setTab('expenses')
    setPendingExpenseId(String(id))
  })

  React.useEffect(() => {
    if (!pendingExpenseId || loading) return
    const item = expenseData.find(e => String(e.id) === pendingExpenseId)
    setPendingExpenseId(null)
    if (item) {
      setEditingExpense(item)
      setExpenseOpen(true)
    } else {
      toast.error('Расход не найден', { description: 'Возможно, его уже удалили' })
    }
  }, [pendingExpenseId, loading, expenseData])

  // ---------- Derived data ----------
  const range = periodRange(period)
  const accountName = (id?: string) => accounts.find(a => a.id === id)?.name

  const scopedIncome = React.useMemo(
    () =>
      incomeData
        .filter(i => (program === 'all' || i.programId === program) && inRange(i.date, range))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomeData, program, period]
  )
  const scopedExpenses = React.useMemo(
    () =>
      expenseData
        .filter(e => (program === 'all' || e.program_id === program) && inRange(e.date, range))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenseData, program, period]
  )

  const q = query.trim().toLowerCase()
  const visibleIncome = scopedIncome.filter(
    i =>
      (accountFilter === 'all' || i.account_id === accountFilter) &&
      (!q || i.participant.toLowerCase().includes(q) || i.notes?.toLowerCase().includes(q) || i.programName?.toLowerCase().includes(q))
  )
  const visibleExpenses = scopedExpenses.filter(
    e =>
      (accountFilter === 'all' || e.account_id === accountFilter) &&
      (categoryFilter === 'all' || e.category === categoryFilter) &&
      (!q || e.name.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q))
  )

  const totalIncome = scopedIncome.reduce((s, i) => s + i.amount, 0)
  const totalExpenses = scopedExpenses.reduce((s, e) => s + e.amount, 0)
  const balance = totalIncome - totalExpenses
  const visibleIncomeSum = visibleIncome.reduce((s, i) => s + i.amount, 0)
  const visibleExpenseSum = visibleExpenses.reduce((s, e) => s + e.amount, 0)

  const categories = React.useMemo(
    () => Array.from(new Set([...DEFAULT_CATEGORIES, ...expenseData.map(e => e.category).filter(Boolean)])),
    [expenseData]
  )
  const scopedAccounts = program === 'all' ? accounts : accounts.filter(a => !a.program_id || a.program_id === program)

  // ---------- Actions ----------
  const deletePayment = async (item: IncomeItem) => {
    const ok = await confirm({
      title: 'Удалить поступление?',
      description: item.receipt
        ? `${item.participant} · ${formatMoney(item.amount)} от ${formatDate(item.date)}. Оплата за ${MONTHS_SHORT_RU[item.month - 1]} ${item.year} уменьшится на эту сумму, другие поступления месяца останутся.`
        : `${item.participant} · ${formatMoney(item.amount)} от ${formatDate(item.date)}. Действие нельзя отменить.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(item.receipt ? `/api/payments/transactions?id=${item.id}` : `/api/monthly-payments?id=${item.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      toast.success('Поступление удалено')
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось удалить', { description: err.message })
    }
  }

  const deleteExpense = async (item: ExpenseItem) => {
    const ok = await confirm({
      title: 'Удалить расход?',
      description: `«${item.name}» на ${formatMoney(item.amount)}. Действие нельзя отменить.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/expenses?id=${item.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      toast.success('Расход удалён')
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось удалить', { description: err.message })
    }
  }

  const deleteAccount = async (acc: Account) => {
    const ok = await confirm({
      title: `Удалить счёт «${acc.name}»?`,
      description: 'Связанные операции останутся, но потеряют привязку к счёту.',
      confirmText: 'Удалить счёт',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/accounts?id=${acc.id}`, { method: 'DELETE' })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      toast.success('Счёт удалён')
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось удалить счёт', { description: err.message })
    }
  }

  const openExpense = (item: ExpenseItem | null) => {
    setEditingExpense(item)
    setExpenseOpen(true)
  }

  const openImport = (mode: ImportMode) => {
    setImportMode(mode)
    setImportOpen(true)
  }

  const openAccount = (acc: Account | null) => {
    setEditingAccount(acc)
    setAccountOpen(true)
  }

  // ---------- Render ----------
  if (error) {
    return (
      <PageContainer>
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить данные"
            description={error}
            action={<Button variant="outline" onClick={() => { setLoading(true); fetchData() }}>Повторить</Button>}
          />
        </Panel>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Доходы и расходы"
        description="Поступления от участников, расходы компании и остатки на счетах"
        actions={
          <>
            <Select value={program} onValueChange={setProgram}>
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
            <Select value={period} onValueChange={v => setPeriod(v as Period)}>
              <SelectTrigger size="sm" className="min-w-36" aria-label="Период">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PERIODS.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => openExpense(null)}>
              <ArrowUpRight /> Расход
            </Button>
            <Button size="sm" onClick={() => setPaymentOpen(true)}>
              <ArrowDownLeft /> Поступление
            </Button>
          </>
        }
      />

      <SummaryStrip
        loading={loading}
        income={totalIncome}
        incomeCount={scopedIncome.length}
        expenses={totalExpenses}
        expenseCount={scopedExpenses.length}
        balance={balance}
        onIncome={() => setTab('income')}
        onExpenses={() => setTab('expenses')}
      />

      <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Раздел"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'income', label: 'Поступления', count: loading ? undefined : scopedIncome.length },
            { value: 'expenses', label: 'Расходы', count: loading ? undefined : scopedExpenses.length },
            { value: 'accounts', label: 'Счета', count: loading ? undefined : scopedAccounts.length },
            { value: 'analytics', label: 'Аналитика' },
          ]}
        />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : tab === 'income' ? (
        <Panel>
          <PanelToolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Участник или комментарий" className="sm:w-72" />
            <AccountFilter value={accountFilter} onChange={setAccountFilter} accounts={scopedAccounts} />
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => openImport('payments')}>
                <Upload /> Импорт
              </Button>
              <ExportButton
                empty={visibleIncome.length === 0}
                onExport={() =>
                  exportToExcel({
                    filename: 'Поступления',
                    rows: visibleIncome,
                    totals: true,
                    columns: [
                      { header: 'Дата', value: i => i.date, type: 'date' },
                      { header: 'Участник', value: i => i.participant },
                      { header: 'Программа', value: i => i.programName ?? '' },
                      { header: 'За месяц', value: i => (i.month ? `${String(i.month).padStart(2, '0')}.${i.year}` : '') },
                      { header: 'Счёт', value: i => accountName(i.account_id) ?? '' },
                      { header: 'Сумма, USD', value: i => i.amount, type: 'money' },
                      { header: 'Валюта', value: i => i.currency ?? 'USD' },
                      { header: 'Сумма в валюте', value: i => i.original_amount ?? i.amount, type: 'money' },
                      { header: 'Комментарий', value: i => i.notes ?? '' },
                    ],
                  })
                }
              />
            </div>
          </PanelToolbar>
          {visibleIncome.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={scopedIncome.length ? 'Ничего не найдено' : 'Поступлений пока нет'}
              description={scopedIncome.length ? 'Измените поиск или фильтры' : 'Зарегистрируйте первую оплату участника'}
              action={!scopedIncome.length && <Button size="sm" onClick={() => setPaymentOpen(true)}><Plus /> Поступление</Button>}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28">Дата</TableHead>
                    <TableHead>Участник</TableHead>
                    <TableHead className="max-md:hidden">Счёт</TableHead>
                    <TableHead className="max-sm:hidden">Статус</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleIncome.slice((incomePage - 1) * PAGE_SIZE, incomePage * PAGE_SIZE).map(item => (
                    <TableRow key={item.id} className="group">
                      <TableCell className="num text-muted-foreground">{formatDate(item.date)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.participant}</div>
                        {item.receipt ? (
                          <div className="text-xs text-muted-foreground">
                            {[item.programName, `за ${MONTHS_SHORT_RU[item.month - 1]} ${item.year}`].filter(Boolean).join(' · ')}
                          </div>
                        ) : (
                          item.programName && <div className="text-xs text-muted-foreground">{item.programName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-md:hidden">{accountName(item.account_id) ?? '—'}</TableCell>
                      <TableCell className="max-sm:hidden">
                        {item.receipt ? (
                          <Badge variant={(RECEIPT_STATUS[item.status] ?? STATUS[item.status]).variant}>
                            {(RECEIPT_STATUS[item.status] ?? STATUS[item.status]).label}
                          </Badge>
                        ) : (
                          <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="num font-medium text-success">{formatMoney(item.amount, 'USD', { sign: true })}</div>
                        {item.currency === 'TJS' && item.original_amount ? (
                          <div className="num text-xs text-muted-foreground">{formatMoney(item.original_amount, 'TJS')}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {item.notes && (
                            <Tip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Комментарий">
                                  <MessageSquareText className="text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="whitespace-pre-wrap">{item.notes}</TooltipContent>
                            </Tip>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Удалить"
                            className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => deletePayment(item)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TotalsBar label={`${formatNumber(visibleIncome.length)} ${plural(visibleIncome.length, ['поступление', 'поступления', 'поступлений'])}`} value={formatMoney(visibleIncomeSum, 'USD', { sign: true })} tone="success" />
              <TablePagination page={incomePage} pageSize={PAGE_SIZE} total={visibleIncome.length} onPageChange={setIncomePage} />
            </>
          )}
        </Panel>
      ) : tab === 'expenses' ? (
        <Panel>
          <PanelToolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Название или комментарий" className="sm:w-72" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger size="sm" className="min-w-36" aria-label="Категория">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AccountFilter value={accountFilter} onChange={setAccountFilter} accounts={scopedAccounts} />
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => openImport('expenses')}>
                <Upload /> Импорт
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRepeatOpen(true)}>
                <Repeat /> Повторить расходы
              </Button>
              <ExportButton
                empty={visibleExpenses.length === 0}
                onExport={() =>
                  exportToExcel({
                    filename: 'Расходы',
                    rows: visibleExpenses,
                    totals: true,
                    columns: [
                      { header: 'Дата', value: e => e.date, type: 'date' },
                      { header: 'Расход', value: e => e.name },
                      { header: 'Категория', value: e => e.category || 'Прочее' },
                      { header: 'Программа', value: e => e.program_name ?? '' },
                      { header: 'Счёт', value: e => accountName(e.account_id) ?? '' },
                      { header: 'Сумма, USD', value: e => e.amount, type: 'money' },
                      { header: 'Валюта', value: e => e.currency ?? 'USD' },
                      { header: 'Сумма в валюте', value: e => e.original_amount ?? e.amount, type: 'money' },
                      { header: 'Комментарий', value: e => e.description ?? '' },
                    ],
                  })
                }
              />
            </div>
          </PanelToolbar>
          {visibleExpenses.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={scopedExpenses.length ? 'Ничего не найдено' : 'Расходов пока нет'}
              description={scopedExpenses.length ? 'Измените поиск или фильтры' : 'Добавьте первый расход компании'}
              action={!scopedExpenses.length && <Button size="sm" onClick={() => openExpense(null)}><Plus /> Расход</Button>}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28">Дата</TableHead>
                    <TableHead>Расход</TableHead>
                    <TableHead className="max-sm:hidden">Категория</TableHead>
                    <TableHead className="max-lg:hidden">Программа</TableHead>
                    <TableHead className="max-md:hidden">Счёт</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExpenses.slice((expensePage - 1) * PAGE_SIZE, expensePage * PAGE_SIZE).map(item => (
                    <TableRow key={item.id} className="group cursor-pointer" onClick={() => openExpense(item)}>
                      <TableCell className="num text-muted-foreground">{formatDate(item.date)}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        <div className="truncate font-medium">{item.name}</div>
                        {item.description && <div className="truncate text-xs text-muted-foreground">{item.description}</div>}
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        <Badge variant="secondary">{item.category || 'Прочее'}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-lg:hidden">{item.program_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground max-md:hidden">{accountName(item.account_id) ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="num font-medium">{formatMoney(-item.amount)}</div>
                        {item.currency === 'TJS' && item.original_amount ? (
                          <div className="num text-xs text-muted-foreground">{formatMoney(item.original_amount, 'TJS')}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className={rowActionsCls}>
                          <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => openExpense(item)}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Удалить"
                            className={dangerIconCls}
                            onClick={() => deleteExpense(item)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TotalsBar label={`${formatNumber(visibleExpenses.length)} ${plural(visibleExpenses.length, ['расход', 'расхода', 'расходов'])}`} value={formatMoney(-visibleExpenseSum)} />
              <TablePagination page={expensePage} pageSize={PAGE_SIZE} total={visibleExpenses.length} onPageChange={setExpensePage} />
            </>
          )}
        </Panel>
      ) : tab === 'accounts' ? (
        <div className="flex flex-col gap-3">
          <AccountsGrid accounts={scopedAccounts} onAdd={() => openAccount(null)} onEdit={openAccount} onDelete={deleteAccount} />
          <TransfersPanel
            accounts={accounts}
            visibleAccountIds={program === 'all' ? undefined : scopedAccounts.map(a => a.id)}
            onChanged={fetchData}
          />
        </div>
      ) : (
        <Analytics income={scopedIncome} expenses={scopedExpenses} />
      )}

      <PaymentSheet
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        participants={participants}
        accounts={accounts}
        onSaved={fetchData}
      />
      <ExpenseSheet
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        editing={editingExpense}
        categories={categories}
        programs={programs}
        accounts={accounts}
        employees={employees}
        onSaved={fetchData}
      />
      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} editing={editingAccount} programs={programs} onSaved={fetchData} />
      <RepeatExpensesSheet open={repeatOpen} onOpenChange={setRepeatOpen} expenses={expenseData} accounts={accounts} onSaved={fetchData} />
      <ImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        mode={importMode}
        accounts={accounts}
        programs={programs}
        categories={categories}
        participants={participants}
        payments={incomeData}
        ledger={ledger}
        expenses={expenseData}
        onSaved={fetchData}
      />
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function SummaryStrip({
  loading,
  income,
  incomeCount,
  expenses,
  expenseCount,
  balance,
  onIncome,
  onExpenses,
}: {
  loading: boolean
  income: number
  incomeCount: number
  expenses: number
  expenseCount: number
  balance: number
  onIncome: () => void
  onExpenses: () => void
}) {
  const ratio = income > 0 ? Math.min(expenses / income, 1) : expenses > 0 ? 1 : 0
  return (
    <Panel className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <button onClick={onIncome} className="group px-5 py-4 text-left transition-colors hover:bg-muted/40">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-chart-income" /> Поступления
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <>
            <p className="num mt-1 text-2xl font-semibold tracking-tight">{formatMoney(income)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatNumber(incomeCount)} {plural(incomeCount, ['платёж', 'платежа', 'платежей'])}
            </p>
          </>
        )}
      </button>
      <button onClick={onExpenses} className="group px-5 py-4 text-left transition-colors hover:bg-muted/40">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-chart-expense" /> Расходы
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <>
            <p className="num mt-1 text-2xl font-semibold tracking-tight">{formatMoney(expenses)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatNumber(expenseCount)} {plural(expenseCount, ['операция', 'операции', 'операций'])}
            </p>
          </>
        )}
      </button>
      <div className="px-5 py-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">Сальдо</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <>
            <p className={cn('num mt-1 text-2xl font-semibold tracking-tight', balance < 0 && 'text-destructive')}>
              {formatMoney(balance, 'USD', { sign: true })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-chart-income/25">
                <div className="h-full rounded-full bg-chart-expense transition-[width] duration-500 ease-[var(--ease-out)]" style={{ width: `${ratio * 100}%` }} />
              </div>
              <span className="num shrink-0 text-xs text-muted-foreground">
                {income > 0 ? `${Math.round((expenses / income) * 100)}% расходов` : '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function AccountFilter({ value, onChange, accounts }: { value: string; onChange: (v: string) => void; accounts: Account[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-36" aria-label="Счёт">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все счета</SelectItem>
        {accounts.map(a => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}



function AccountsGrid({
  accounts,
  onAdd,
  onEdit,
  onDelete,
}: {
  accounts: Account[]
  onAdd: () => void
  onEdit: (a: Account) => void
  onDelete: (a: Account) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {accounts.map(acc => (
        <Panel key={acc.id} className="flex flex-col p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Landmark className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{acc.name}</p>
              <p className="truncate text-xs text-muted-foreground">{acc.program?.name ?? 'Общий счёт'}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 text-muted-foreground" aria-label="Действия со счётом">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(acc)}>
                  <Pencil /> Изменить
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(acc)}>
                  <Trash2 /> Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className={cn('num mt-5 text-2xl font-semibold tracking-tight', (acc.balance ?? 0) < 0 && 'text-destructive')}>
            {formatMoney(acc.balance ?? 0, acc.currency)}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Остаток · {acc.currency}</span>
            {acc.is_default && <Badge className="ml-auto">По умолчанию</Badge>}
          </div>
        </Panel>
      ))}
      <button
        onClick={onAdd}
        className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:bg-card hover:text-foreground"
      >
        <Plus className="size-5" />
        Новый счёт
      </button>
    </div>
  )
}


function Analytics({ income, expenses }: { income: IncomeItem[]; expenses: ExpenseItem[] }) {
  const monthly = React.useMemo(() => {
    const map = new Map<string, { key: string; label: string; income: number; expenses: number }>()
    const add = (date: string, field: 'income' | 'expenses', v: number) => {
      const d = new Date(date)
      if (Number.isNaN(d.getTime())) return
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(key)) map.set(key, { key, label: `${MONTHS_SHORT_RU[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, income: 0, expenses: 0 })
      map.get(key)![field] += v
    }
    income.forEach(i => add(i.date, 'income', i.amount))
    expenses.forEach(e => add(e.date, 'expenses', e.amount))
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  }, [income, expenses])

  const byCategory = React.useMemo(() => {
    const acc: Record<string, number> = {}
    expenses.forEach(e => (acc[e.category || 'Прочее'] = (acc[e.category || 'Прочее'] || 0) + e.amount))
    const rows = Object.entries(acc)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    // Collapse the long tail so the palette stays readable
    if (rows.length > 6) {
      const rest = rows.slice(5).reduce((s, r) => s + r.value, 0)
      return [...rows.slice(0, 5), { name: 'Остальное', value: rest }]
    }
    return rows
  }, [expenses])
  const totalExp = byCategory.reduce((s, r) => s + r.value, 0)

  if (!income.length && !expenses.length) {
    return (
      <Panel>
        <EmptyState icon={Inbox} title="Нет данных за выбранный период" description="Выберите другой период или программу" />
      </Panel>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
      <Panel className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Поступления и расходы по месяцам</h2>
          <ChartLegend
            items={[
              { label: 'Поступления', color: 'var(--chart-income)' },
              { label: 'Расходы', color: 'var(--chart-expense)' },
            ]}
          />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthly} barGap={3} margin={{ left: -8, right: 4, top: 4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={56} tickFormatter={compactTick} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
            <Bar dataKey="income" name="Поступления" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expenses" name="Расходы" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <h2 className="mb-2 font-semibold">Структура расходов</h2>
        {byCategory.length === 0 ? (
          <EmptyState title="Расходов нет" className="py-10" />
        ) : (
          <>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Всего</span>
                <span className="num text-lg font-semibold">{formatMoney(totalExp)}</span>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {byCategory.map((r, i) => {
                const pct = totalExp ? (r.value / totalExp) * 100 : 0
                return (
                  <li key={r.name} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="num text-muted-foreground">{Math.round(pct)}%</span>
                      <span className="num w-24 text-right font-medium">{formatMoney(r.value)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}
