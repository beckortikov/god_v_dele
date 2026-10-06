'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Palmtree, Plus, Trash2 } from 'lucide-react'
import { formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton, rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { Avatar, LEAVE_TYPES, SHIFTS, formatDay, fullName, localISO, type HrEmployee, type LeaveType } from '@/components/hr/shared'
import { LeaveSheet, PeriodSheet, type LeavePeriod, type LeaveRecord } from '@/components/hr/leave-sheets'

type TypeFilter = 'all' | LeaveType

/** Collapse consecutive days of the same employee and type into periods. */
function groupPeriods(leaves: LeaveRecord[]): LeavePeriod[] {
  const sorted = [...leaves].sort(
    (a, b) => a.employee_id.localeCompare(b.employee_id) || a.shift_type.localeCompare(b.shift_type) || a.work_date.localeCompare(b.work_date)
  )
  const out: LeavePeriod[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && last.employee_id === r.employee_id && last.type === r.shift_type && r.work_date === nextDay(last.to)) {
      last.to = r.work_date
      last.records.push(r)
    } else {
      out.push({
        key: r.id,
        employee_id: r.employee_id,
        employees: r.employees,
        type: r.shift_type,
        from: r.work_date,
        to: r.work_date,
        records: [r],
      })
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || fullName(a.employees).localeCompare(fullName(b.employees), 'ru'))
}

function nextDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function VacationsPage() {
  const confirm = useConfirm()
  const [leaves, setLeaves] = React.useState<LeaveRecord[]>([])
  const [employees, setEmployees] = React.useState<HrEmployee[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')
  const [query, setQuery] = React.useState('')

  const [formOpen, setFormOpen] = React.useState(false)
  const [editingDay, setEditingDay] = React.useState<LeaveRecord | null>(null)
  const [periodKey, setPeriodKey] = React.useState<string | null>(null)

  const today = todayISO()

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const empRes = await fetch('/api/hr/employees')
      if (empRes.ok) setEmployees(await empRes.json())

      // Upcoming leaves: from today for the next 3 months
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 3)
      const scheduleRes = await fetch(`/api/hr/schedule?start_date=${todayISO()}&end_date=${localISO(endDate)}`)
      if (scheduleRes.ok) {
        const allSchedules = await scheduleRes.json()
        const leaveTypes: string[] = [...LEAVE_TYPES]
        setLeaves(Array.isArray(allSchedules) ? allSchedules.filter((s: any) => leaveTypes.includes(s.shift_type)) : [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Не удалось загрузить отсутствия', { description: 'Проверьте соединение и обновите страницу' })
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const periods = React.useMemo(() => groupPeriods(leaves), [leaves])
  const statusOf = React.useCallback(
    (p: LeavePeriod) => (p.from <= today && p.to >= today ? { label: 'Сейчас', variant: 'info' as const } : { label: 'Запланировано', variant: 'secondary' as const }),
    [today]
  )

  const counts = React.useMemo(() => {
    const c = { all: periods.length, vacation: 0, sick_leave: 0, unpaid_leave: 0 }
    periods.forEach(p => c[p.type]++)
    return c
  }, [periods])

  const daysByType = React.useMemo(() => {
    const c = { vacation: 0, sick_leave: 0, unpaid_leave: 0 }
    leaves.forEach(l => c[l.shift_type]++)
    return c
  }, [leaves])

  const absentToday = new Set(leaves.filter(l => l.work_date === today).map(l => l.employee_id)).size

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return periods.filter(p => (typeFilter === 'all' || p.type === typeFilter) && (!q || fullName(p.employees).toLowerCase().includes(q)))
  }, [periods, typeFilter, query])

  const openPeriod = periods.find(p => p.key === periodKey) ?? null

  const openCreate = () => {
    setEditingDay(null)
    setFormOpen(true)
  }

  const openEditDay = (r: LeaveRecord) => {
    setEditingDay(r)
    setFormOpen(true)
  }

  const deleteRecords = async (records: LeaveRecord[]) => {
    let failed = 0
    for (const r of records) {
      const res = await fetch(`/api/hr/schedule/${r.id}`, { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) failed++
    }
    return failed
  }

  const handleDeleteDay = async (r: LeaveRecord) => {
    const ok = await confirm({
      title: 'Удалить этот день?',
      description: `${fullName(r.employees)} · ${SHIFTS[r.shift_type].label} · ${formatDay(r.work_date, true)}`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    const failed = await deleteRecords([r])
    if (failed) toast.error('Не удалось удалить день', { description: 'Попробуйте ещё раз' })
    else toast.success('День удалён', { description: formatDay(r.work_date, true) })
    fetchData()
  }

  const handleDeletePeriod = async (p: LeavePeriod) => {
    const n = p.records.length
    const ok = await confirm({
      title: n > 1 ? `Удалить период из ${formatNumber(n)} ${plural(n, ['дня', 'дней', 'дней'])}?` : 'Удалить запись?',
      description: `${fullName(p.employees)} · ${SHIFTS[p.type].label} · ${formatDay(p.from)} – ${formatDay(p.to, true)}. Дни исчезнут из графика работы.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    const failed = await deleteRecords(p.records)
    if (failed) {
      toast.error(`Не удалось удалить ${formatNumber(failed)} ${plural(failed, ['день', 'дня', 'дней'])}`, { description: 'Попробуйте ещё раз' })
    } else {
      toast.success(n > 1 ? 'Период удалён' : 'Запись удалена', { description: fullName(p.employees) })
      setPeriodKey(null)
    }
    fetchData()
  }

  const activeEmployees = React.useMemo(
    () => (Array.isArray(employees) ? employees : []).filter(e => e.status === 'active' || e.id === editingDay?.employee_id),
    [employees, editingDay]
  )

  const dayWord = (n: number) => `${formatNumber(n)} ${plural(n, ['день', 'дня', 'дней'])}`
  const periodWord = (n: number) => (n ? `${formatNumber(n)} ${plural(n, ['период', 'периода', 'периодов'])}` : 'не запланировано')

  return (
    <PageContainer>
      <PageHeader
        title="Отгулы и отпуска"
        description="Ближайшие 3 месяца. Каждый день отсутствия отражается в графике работы"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Новое отсутствие
          </Button>
        }
      />

      <StatStrip
        className="max-sm:grid-cols-2 max-sm:[&>*]:px-4"
        loading={isLoading}
        stats={[
          {
            label: 'Отсутствуют сегодня',
            value: formatNumber(absentToday),
            sub: absentToday ? plural(absentToday, ['сотрудник', 'сотрудника', 'сотрудников']) : 'все на месте',
          },
          {
            label: 'Отпуск',
            value: dayWord(daysByType.vacation),
            dot: 'var(--success)',
            sub: periodWord(counts.vacation),
            onClick: () => setTypeFilter('vacation'),
          },
          {
            label: 'Больничный',
            value: dayWord(daysByType.sick_leave),
            dot: 'var(--warning)',
            sub: periodWord(counts.sick_leave),
            onClick: () => setTypeFilter('sick_leave'),
          },
          {
            label: 'Отгулы б/с',
            value: dayWord(daysByType.unpaid_leave),
            dot: 'var(--destructive)',
            sub: counts.unpaid_leave ? `${periodWord(counts.unpaid_leave)} · удерживаются из зарплаты` : 'удерживаются из зарплаты',
            onClick: () => setTypeFilter('unpaid_leave'),
          },
        ]}
      />

      <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Тип отсутствия"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'Все', count: isLoading ? undefined : counts.all },
            { value: 'vacation', label: 'Отпуск', count: isLoading ? undefined : counts.vacation },
            { value: 'sick_leave', label: 'Больничный', count: isLoading ? undefined : counts.sick_leave },
            { value: 'unpaid_leave', label: 'Отгулы б/с', count: isLoading ? undefined : counts.unpaid_leave },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <Panel>
          {periods.length > 0 && (
            <PanelToolbar>
              <SearchInput value={query} onChange={setQuery} placeholder="Сотрудник" />
            </PanelToolbar>
          )}
          {visible.length === 0 ? (
            <EmptyState
              icon={Palmtree}
              title={periods.length ? 'Ничего не найдено' : 'Отсутствий не запланировано'}
              description={
                periods.length ? 'Измените поиск или тип отсутствия' : 'Оформите отпуск, больничный или отгул: дни сразу появятся в графике работы'
              }
              action={
                !periods.length && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> Новое отсутствие
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Сотрудник</TableHead>
                  <TableHead className="max-sm:hidden">Тип</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead className="text-right max-sm:hidden">Дней</TableHead>
                  <TableHead className="max-md:hidden">Статус</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(p => {
                  const st = statusOf(p)
                  const sh = SHIFTS[p.type]
                  return (
                    <TableRow key={p.key} className="group cursor-pointer" onClick={() => setPeriodKey(p.key)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar person={p.employees} className="max-sm:hidden" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{fullName(p.employees) || 'Сотрудник'}</div>
                            <Badge variant={sh.badge} className="mt-1 sm:hidden">
                              {sh.short}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-sm:hidden">
                        <Badge variant={sh.badge}>{sh.label}</Badge>
                      </TableCell>
                      <TableCell className="num">
                        {p.from === p.to ? formatDay(p.from, true) : `${formatDay(p.from)} – ${formatDay(p.to, true)}`}
                        <div className="text-xs text-muted-foreground sm:hidden">{dayWord(p.records.length)}</div>
                      </TableCell>
                      <TableCell className="num text-right max-sm:hidden">{formatNumber(p.records.length)}</TableCell>
                      <TableCell className="max-md:hidden">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className={rowActionsCls}>
                          <Button variant="ghost" size="icon-sm" aria-label="Удалить период" className={dangerIconCls} onClick={() => handleDeletePeriod(p)}>
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      <LeaveSheet open={formOpen} onOpenChange={setFormOpen} employees={activeEmployees} editing={editingDay} onSaved={fetchData} />
      <PeriodSheet
        period={formOpen ? null : openPeriod}
        onClose={() => setPeriodKey(null)}
        onEditDay={openEditDay}
        onDeleteDay={handleDeleteDay}
        onDeletePeriod={handleDeletePeriod}
        statusOf={statusOf}
      />
    </PageContainer>
  )
}
