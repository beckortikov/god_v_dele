'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Ban, Check, FilePlus2, MoreHorizontal, RotateCcw, Trash2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatMoney, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { TotalsBar, TableSkeleton } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { BulkBar, SelectCell, SelectHeadCell, requestOk, useBulkRunner, useRowSelection } from '@/components/erp/bulk'
import { Avatar, DetailRow, MonthSwitcher, currentYearMonth, fullName, monthLabel, type YearMonth } from '@/components/hr/shared'

interface PayrollRecord {
  id: string
  employee_id: string
  month_number: number
  year: number
  base_salary: number
  bonus_amount: number
  deduction_amount: number
  total_amount: number
  status: 'pending' | 'paid' | 'cancelled'
  payment_date: string | null
  employees?: {
    first_name: string
    last_name: string
    position: string
  }
}

const STATUS: Record<PayrollRecord['status'], { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  pending: { label: 'К выплате', variant: 'warning' },
  paid: { label: 'Выплачено', variant: 'success' },
  cancelled: { label: 'Отменено', variant: 'secondary' },
}

const tjs = (v: number | string | null | undefined) => formatMoney(v, 'TJS')

export function PayrollPage() {
  const confirm = useConfirm()
  const [ym, setYm] = React.useState<YearMonth>(currentYearMonth)
  const selectedMonth = String(ym.month)
  const selectedYear = String(ym.year)
  const [payrollData, setPayrollData] = React.useState<PayrollRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const fetchPayroll = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/hr/payroll?month=${selectedMonth}&year=${selectedYear}`)
      if (res.ok) {
        const data = await res.json()
        setPayrollData(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to fetch payroll', error)
      toast.error('Не удалось загрузить ведомость', { description: 'Проверьте соединение и обновите страницу' })
    } finally {
      setIsLoading(false)
    }
  }, [selectedMonth, selectedYear])

  React.useEffect(() => {
    fetchPayroll()
  }, [fetchPayroll])

  const period = monthLabel(ym)

  const handleGenerate = async () => {
    const ok = await confirm({
      title: `Сформировать ведомость за ${period.toLowerCase()}?`,
      description:
        'Для каждого работающего сотрудника без записи за этот месяц появится начисление по окладу. Дни отгула без сохранения будут удержаны автоматически.',
      confirmText: 'Сформировать',
    })
    if (!ok) return

    setGenerating(true)
    try {
      // 1. Fetch active employees
      const empRes = await fetch('/api/hr/employees')
      const employees = await empRes.json()

      // 2. Create records for employees that do not have one yet
      let createdCount = 0
      let failed = 0
      for (const emp of employees) {
        if (emp.status !== 'active') continue
        const exists = payrollData.find(p => p.employee_id === emp.id)
        if (exists) continue

        const res = await fetch('/api/hr/payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: emp.id,
            month_number: Number(selectedMonth),
            year: Number(selectedYear),
            base_salary: emp.base_salary,
            bonus_amount: 0,
            deduction_amount: 0,
            total_amount: emp.base_salary, // Simple logic
            status: 'pending',
          }),
        })

        if (res.ok) {
          createdCount++
        } else {
          failed++
          console.error('Failed to create record for', emp.first_name, await res.text())
        }
      }

      if (createdCount > 0) {
        toast.success(`Ведомость сформирована`, {
          description: `${formatNumber(createdCount)} ${plural(createdCount, ['начисление', 'начисления', 'начислений'])} за ${period.toLowerCase()}`,
        })
        fetchPayroll()
      } else if (!failed) {
        toast.info('Новых начислений нет', { description: 'Ведомость уже сформирована или нет работающих сотрудников' })
      }
      if (failed) {
        toast.error(`Не удалось создать ${formatNumber(failed)} ${plural(failed, ['начисление', 'начисления', 'начислений'])}`, {
          description: 'Попробуйте ещё раз; уже созданные записи не задублируются',
        })
      }
    } catch (error: any) {
      console.error('Error generating payroll', error)
      toast.error('Не удалось сформировать ведомость', { description: error?.message })
    } finally {
      setGenerating(false)
    }
  }

  const handleStatusChange = async (record: PayrollRecord, newStatus: PayrollRecord['status']) => {
    setBusyId(record.id)
    try {
      const res = await fetch(`/api/hr/payroll/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          payment_date: newStatus === 'paid' ? todayISO() : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
      }
      const name = fullName(record.employees)
      toast.success(
        newStatus === 'paid' ? 'Выплата отмечена' : newStatus === 'cancelled' ? 'Выплата отменена' : 'Начисление возвращено к выплате',
        { description: `${name} · ${tjs(record.total_amount)}` }
      )
      fetchPayroll()
    } catch (error: any) {
      console.error('Error updating status', error)
      toast.error('Не удалось изменить статус', { description: error.message })
    } finally {
      setBusyId(null)
    }
  }

  const handlePay = async (record: PayrollRecord) => {
    const ok = await confirm({
      title: 'Отметить зарплату выплаченной?',
      description: (
        <>
          {fullName(record.employees)} · <span className="num font-medium text-foreground">{tjs(record.total_amount)}</span> за{' '}
          {period.toLowerCase()}, дата выплаты — сегодня. Списание со счёта при этом не создаётся: чтобы деньги ушли из кассы, проведите расход «Зарплаты» в разделе «Доходы и
          расходы» — тогда статус обновится сам.
        </>
      ),
      confirmText: 'Отметить выплату',
    })
    if (!ok) return
    await handleStatusChange(record, 'paid')
  }

  const handleCancel = async (record: PayrollRecord) => {
    const ok = await confirm({
      title: 'Отменить выплату?',
      description: `${fullName(record.employees)} · ${tjs(record.total_amount)}. Начисление останется в ведомости со статусом «Отменено», его можно будет вернуть.`,
      confirmText: 'Отменить выплату',
      cancelText: 'Не отменять',
      destructive: true,
    })
    if (!ok) return
    await handleStatusChange(record, 'cancelled')
  }

  const handleDelete = async (record: PayrollRecord) => {
    const name = fullName(record.employees)
    const ok = await confirm({
      title: 'Удалить начисление?',
      description: `${name} · ${period.toLowerCase()}. Запись будет удалена. Расход «Зарплата: ${name}» за этот месяц в Финансах тоже удалится.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return

    setBusyId(record.id)
    try {
      const res = await fetch(`/api/hr/payroll/${record.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
      }
      toast.success('Начисление удалено', { description: name })
      setDetailId(null)
      fetchPayroll()
    } catch (error: any) {
      console.error('Error deleting record', error)
      toast.error('Не удалось удалить начисление', { description: error.message })
    } finally {
      setBusyId(null)
    }
  }

  // Stats
  const totalAmount = payrollData.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const paidRows = payrollData.filter(i => i.status === 'paid')
  const pendingRows = payrollData.filter(i => i.status === 'pending')
  const paidAmount = paidRows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const pendingAmount = pendingRows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const sum = (k: 'base_salary' | 'bonus_amount' | 'deduction_amount') => payrollData.reduce((s, r) => s + Number(r[k] || 0), 0)

  // ----- Selection (only «К выплате» rows), bulk pay, export -----
  const pendingIds = React.useMemo(() => payrollData.filter(r => r.status === 'pending').map(r => r.id), [payrollData])
  const selection = useRowSelection(pendingIds, `${ym.year}-${ym.month}`)
  const bulk = useBulkRunner()
  const selectedRows = payrollData.filter(r => r.status === 'pending' && selection.isSelected(r.id))
  const selectedSum = selectedRows.reduce((s, r) => s + Number(r.total_amount || 0), 0)

  const handleBulkPay = async () => {
    const rows = selectedRows
    if (!rows.length) return
    const n = rows.length
    const ok = await confirm({
      title: `Выплатить ${formatNumber(n)} ${plural(n, ['сотруднику', 'сотрудникам', 'сотрудникам'])}?`,
      description: (
        <>
          Начисления за {period.toLowerCase()} на сумму <span className="num font-medium text-foreground">{tjs(selectedSum)}</span> будут отмечены
          выплаченными, дата выплаты — сегодня. Списание со счёта при этом не создаётся: чтобы деньги ушли из кассы, проведите расходы «Зарплаты» в
          разделе «Доходы и расходы».
        </>
      ),
      confirmText: `Выплатить ${tjs(selectedSum)}`,
    })
    if (!ok) return
    const today = todayISO()
    await bulk.run(
      rows,
      r =>
        requestOk(`/api/hr/payroll/${r.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paid', payment_date: today }),
        }),
      { done: 'Выплаты отмечены', noun: ['начисление', 'начисления', 'начислений'], label: r => fullName(r.employees) || 'Сотрудник' }
    )
    selection.clear()
    fetchPayroll()
  }

  const runExport = () =>
    exportToExcel({
      filename: `Зарплата ${period}`,
      sheetName: period,
      rows: payrollData,
      totals: true,
      columns: [
        { header: 'Сотрудник', value: r => fullName(r.employees) || 'Сотрудник удалён' },
        { header: 'Должность', value: r => r.employees?.position },
        { header: 'Период', value: () => period },
        { header: 'Оклад, TJS', value: r => r.base_salary, type: 'money' },
        { header: 'Премии, TJS', value: r => r.bonus_amount, type: 'money' },
        { header: 'Удержания, TJS', value: r => r.deduction_amount, type: 'money' },
        { header: 'К выплате, TJS', value: r => r.total_amount, type: 'money' },
        { header: 'Статус', value: r => (STATUS[r.status] ?? STATUS.pending).label },
        { header: 'Дата выплаты', value: r => (r.status === 'paid' ? r.payment_date : null), type: 'date' },
      ],
    })

  const detail = payrollData.find(r => r.id === detailId) ?? null
  const actions = { onPay: handlePay, onCancel: handleCancel, onRestore: (r: PayrollRecord) => handleStatusChange(r, 'pending'), onDelete: handleDelete }

  return (
    <PageContainer>
      <PageHeader
        title="Зарплата"
        description="Начисления по окладу, премии, удержания и выплаты"
        actions={
          <>
            <MonthSwitcher value={ym} onChange={setYm} />
            <ExportButton empty={isLoading || !payrollData.length} onExport={runExport} />
            {(isLoading || payrollData.length > 0) && (
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating || isLoading}>
                <FilePlus2 /> {generating ? 'Формируем…' : 'Дополнить ведомость'}
              </Button>
            )}
          </>
        }
      />

      <StatStrip
        loading={isLoading}
        stats={[
          {
            label: 'Начислено',
            value: tjs(totalAmount),
            sub: `${formatNumber(payrollData.length)} ${plural(payrollData.length, ['сотрудник', 'сотрудника', 'сотрудников'])} · ${period}`,
          },
          {
            label: 'Выплачено',
            value: tjs(paidAmount),
            tone: paidAmount > 0 ? 'success' : 'default',
            dot: 'var(--success)',
            sub: `${formatNumber(paidRows.length)} ${plural(paidRows.length, ['выплата', 'выплаты', 'выплат'])}`,
          },
          {
            label: 'Осталось выплатить',
            value: tjs(pendingAmount),
            tone: pendingAmount > 0 ? 'warning' : 'default',
            dot: 'var(--warning)',
            sub: pendingRows.length
              ? `${formatNumber(pendingRows.length)} ${plural(pendingRows.length, ['сотрудник', 'сотрудника', 'сотрудников'])}`
              : payrollData.length
                ? 'всё выплачено'
                : '—',
          },
        ]}
      />

      <div className="mt-6">
        {isLoading ? (
          <TableSkeleton rows={5} toolbar={false} />
        ) : (
          <Panel>
            {payrollData.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={`Ведомости за ${period.toLowerCase()} нет`}
                description="Сформируйте её: начисления по окладу создадутся для всех работающих сотрудников"
                action={
                  <Button size="sm" onClick={handleGenerate} disabled={generating}>
                    <FilePlus2 /> {generating ? 'Формируем…' : 'Сформировать ведомость'}
                  </Button>
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <SelectHeadCell selection={selection} label="Выбрать все начисления к выплате" disabled={!pendingIds.length} />
                      <TableHead>Сотрудник</TableHead>
                      <TableHead className="text-right max-md:hidden">Оклад</TableHead>
                      <TableHead className="text-right max-lg:hidden">Премии</TableHead>
                      <TableHead className="text-right max-lg:hidden">Удержания</TableHead>
                      <TableHead className="text-right">К выплате</TableHead>
                      <TableHead className="max-sm:hidden">Статус</TableHead>
                      <TableHead className="w-36 max-sm:w-auto" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollData.map(record => {
                      const st = STATUS[record.status] ?? STATUS.pending
                      const busy = busyId === record.id
                      return (
                        <TableRow
                          key={record.id}
                          className="group cursor-pointer"
                          data-state={selection.isSelected(record.id) ? 'selected' : undefined}
                          onClick={() => setDetailId(record.id)}
                        >
                          <SelectCell
                            selection={selection}
                            id={record.id}
                            disabled={record.status !== 'pending'}
                            label={`Выбрать: ${fullName(record.employees) || 'сотрудник'}`}
                          />
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar person={record.employees} className="max-sm:hidden" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{fullName(record.employees) || 'Сотрудник удалён'}</div>
                                <div className="truncate text-xs text-muted-foreground max-sm:hidden">{record.employees?.position}</div>
                                <Badge variant={st.variant} className="mt-1 sm:hidden">
                                  {st.label}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="num text-right text-muted-foreground max-md:hidden">{tjs(record.base_salary)}</TableCell>
                          <TableCell className={cn('num text-right max-lg:hidden', Number(record.bonus_amount) > 0 ? 'text-success' : 'text-muted-foreground')}>
                            {Number(record.bonus_amount) > 0 ? formatMoney(record.bonus_amount, 'TJS', { sign: true }) : '—'}
                          </TableCell>
                          <TableCell className={cn('num text-right max-lg:hidden', Number(record.deduction_amount) > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                            {Number(record.deduction_amount) > 0 ? formatMoney(-record.deduction_amount, 'TJS') : '—'}
                          </TableCell>
                          <TableCell className="num text-right font-semibold">{tjs(record.total_amount)}</TableCell>
                          <TableCell className="max-sm:hidden">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {record.status === 'paid' && record.payment_date && (
                              <span className="num ml-2 text-xs text-muted-foreground max-lg:hidden">{formatDate(record.payment_date)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {record.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 max-sm:w-7 max-sm:px-0"
                                  disabled={busy}
                                  onClick={() => handlePay(record)}
                                  aria-label="Выплатить"
                                >
                                  <Check /> <span className="max-sm:hidden">Выплатить</span>
                                </Button>
                              )}
                              <RowMenu record={record} disabled={busy} {...actions} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <div className="grid grid-cols-3 gap-px border-t bg-border text-xs max-lg:hidden">
                  {[
                    ['Оклады', tjs(sum('base_salary'))],
                    ['Премии', formatMoney(sum('bonus_amount'), 'TJS', { sign: true })],
                    ['Удержания', formatMoney(-sum('deduction_amount'), 'TJS')],
                  ].map(([l, v]) => (
                    <div key={l} className="flex items-center justify-between bg-card px-4 py-2 text-muted-foreground">
                      <span>{l}</span>
                      <span className="num font-medium text-foreground">{v}</span>
                    </div>
                  ))}
                </div>
                <TotalsBar
                  label={`${formatNumber(payrollData.length)} ${plural(payrollData.length, ['начисление', 'начисления', 'начислений'])}`}
                  value={tjs(totalAmount)}
                />
              </>
            )}
          </Panel>
        )}
      </div>

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress} summary={`· ${tjs(selectedSum)}`}>
        <Button size="sm" onClick={handleBulkPay}>
          <Check /> Выплатить выбранные
        </Button>
      </BulkBar>

      <PayrollSheet record={detail} period={period} busy={!!detail && busyId === detail.id} onClose={() => setDetailId(null)} {...actions} />
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

interface RecordActions {
  onPay: (r: PayrollRecord) => void
  onCancel: (r: PayrollRecord) => void
  onRestore: (r: PayrollRecord) => void
  onDelete: (r: PayrollRecord) => void
}

function RowMenu({ record, disabled, onPay, onCancel, onRestore, onDelete }: RecordActions & { record: PayrollRecord; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Действия" disabled={disabled}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {record.status === 'pending' && (
          <DropdownMenuItem onSelect={() => onPay(record)}>
            <Check /> Отметить выплату
          </DropdownMenuItem>
        )}
        {record.status === 'paid' && (
          <DropdownMenuItem onSelect={() => onCancel(record)}>
            <Ban /> Отменить выплату
          </DropdownMenuItem>
        )}
        {record.status === 'cancelled' && (
          <DropdownMenuItem onSelect={() => onRestore(record)}>
            <RotateCcw /> Вернуть к выплате
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(record)}>
          <Trash2 /> Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PayrollSheet({
  record,
  period,
  busy,
  onClose,
  onPay,
  onCancel,
  onRestore,
  onDelete,
}: RecordActions & { record: PayrollRecord | null; period: string; busy: boolean; onClose: () => void }) {
  // Keep the last record while the sheet animates out
  const [shown, setShown] = React.useState<PayrollRecord | null>(record)
  React.useEffect(() => {
    if (record) setShown(record)
  }, [record])
  const r = record ?? shown
  const st = r ? STATUS[r.status] ?? STATUS.pending : null

  return (
    <Sheet open={!!record} onOpenChange={o => !o && onClose()}>
      <SheetContent>
        {r && st && (
          <div className="flex h-full flex-col">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar person={r.employees} className="size-11 text-sm" />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{fullName(r.employees) || 'Сотрудник удалён'}</SheetTitle>
                  <SheetDescription className="truncate">
                    {r.employees?.position ? `${r.employees.position} · ` : ''}
                    {period}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetBody>
              <div className="rounded-lg border px-3">
                <div className="divide-y">
                  <DetailRow label="Оклад">
                    <span className="num">{tjs(r.base_salary)}</span>
                  </DetailRow>
                  <DetailRow label="Премии">
                    <span className={cn('num', Number(r.bonus_amount) > 0 && 'text-success')}>
                      {formatMoney(r.bonus_amount, 'TJS', { sign: true })}
                    </span>
                  </DetailRow>
                  <DetailRow
                    label={
                      <>
                        Удержания
                        <span className="block text-xs">за отгулы без сохранения</span>
                      </>
                    }
                  >
                    <span className={cn('num', Number(r.deduction_amount) > 0 && 'text-destructive')}>
                      {Number(r.deduction_amount) > 0 ? formatMoney(-r.deduction_amount, 'TJS') : tjs(0)}
                    </span>
                  </DetailRow>
                </div>
                <div className="flex items-baseline justify-between border-t py-3">
                  <span className="font-medium">К выплате</span>
                  <span className="num text-xl font-semibold tracking-tight">{tjs(r.total_amount)}</span>
                </div>
              </div>

              <div className="mt-4 divide-y rounded-lg border px-3">
                <DetailRow label="Статус">
                  <Badge variant={st.variant}>{st.label}</Badge>
                </DetailRow>
                <DetailRow label="Дата выплаты">
                  <span className="num">{formatDate(r.payment_date)}</span>
                </DetailRow>
              </div>

              {r.status === 'pending' && (
                <p className="mt-4 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                  Когда вы проводите расход «Зарплаты» на этого сотрудника в разделе «Доходы и расходы», начисление отмечается выплаченным
                  автоматически.
                </p>
              )}
            </SheetBody>
            <SheetFooter>
              {r.status === 'pending' && (
                <Button disabled={busy} onClick={() => onPay(r)}>
                  <Check /> Отметить выплату
                </Button>
              )}
              {r.status === 'paid' && (
                <Button variant="outline" disabled={busy} onClick={() => onCancel(r)}>
                  <Ban /> Отменить выплату
                </Button>
              )}
              {r.status === 'cancelled' && (
                <Button variant="outline" disabled={busy} onClick={() => onRestore(r)}>
                  <RotateCcw /> Вернуть к выплате
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                className="ml-auto text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                onClick={() => onDelete(r)}
              >
                <Trash2 /> Удалить
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
