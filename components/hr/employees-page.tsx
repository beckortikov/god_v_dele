'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, UserCheck, UserMinus, UserSquare2 } from 'lucide-react'
import { formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { TotalsBar, TableSkeleton, rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { ExportButton } from '@/components/erp/export-button'
import { exportToExcel } from '@/components/erp/export'
import { BulkBar, SelectCell, SelectHeadCell, requestOk, useBulkRunner, useRowSelection } from '@/components/erp/bulk'
import { useNavAction } from '@/components/app-shell/nav-context'
import { Avatar, fullName, type HrEmployee } from '@/components/hr/shared'
import { EMPLOYEE_STATUS, EmployeeSheet, type EmployeeSheetMode } from '@/components/hr/employee-sheet'

type StatusFilter = 'active' | 'all' | 'inactive'

export function EmployeesPage() {
  const confirm = useConfirm()
  const [employees, setEmployees] = React.useState<HrEmployee[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetMode, setSheetMode] = React.useState<EmployeeSheetMode>('create')
  const [current, setCurrent] = React.useState<HrEmployee | null>(null)

  const fetchEmployees = React.useCallback(async () => {
    try {
      const res = await fetch('/api/hr/employees')
      const data = await res.json()
      if (Array.isArray(data)) {
        setEmployees(data)
        // Keep the open card in sync after edits
        setCurrent(c => (c ? data.find((e: HrEmployee) => e.id === c.id) ?? c : c))
      }
    } catch (error) {
      console.error('Failed to fetch employees', error)
      toast.error('Не удалось загрузить сотрудников', { description: 'Проверьте соединение и обновите страницу' })
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const openCreate = () => {
    setCurrent(null)
    setSheetMode('create')
    setSheetOpen(true)
  }
  const openView = (e: HrEmployee) => {
    setCurrent(e)
    setSheetMode('view')
    setSheetOpen(true)
  }
  const openEdit = (e: HrEmployee) => {
    setCurrent(e)
    setSheetMode('edit')
    setSheetOpen(true)
  }

  useNavAction('new-employee', openCreate)

  // «open-employee» from search or notifications: open the card once the list is loaded
  const [pendingOpenId, setPendingOpenId] = React.useState<string | null>(null)
  useNavAction('open-employee', payload => {
    if (typeof payload?.id === 'string') setPendingOpenId(payload.id)
  })
  React.useEffect(() => {
    if (!pendingOpenId || isLoading) return
    const target = employees.find(e => e.id === pendingOpenId)
    setPendingOpenId(null)
    if (target) openView(target)
    else toast.error('Сотрудник не найден', { description: 'Возможно, карточку удалили' })
  }, [pendingOpenId, isLoading, employees])

  const handleDelete = async (employee: HrEmployee) => {
    const ok = await confirm({
      title: 'Удалить сотрудника?',
      description: `${fullName(employee)}: карточка будет удалена без возможности восстановления. Если сотрудник просто ушёл, лучше поставить статус «Уволен».`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/hr/employees/${employee.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
      }
      toast.success('Сотрудник удалён', { description: fullName(employee) })
      setSheetOpen(false)
      fetchEmployees()
    } catch (error: any) {
      toast.error('Не удалось удалить сотрудника', { description: error.message })
    }
  }

  const departments = React.useMemo(
    () => Array.from(new Set(employees.map(e => e.department?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')),
    [employees]
  )

  const counts = React.useMemo(
    () => ({
      all: employees.length,
      active: employees.filter(e => e.status === 'active').length,
      inactive: employees.filter(e => e.status !== 'active').length,
    }),
    [employees]
  )

  const filtered = React.useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return employees.filter(emp => {
      if (statusFilter === 'active' && emp.status !== 'active') return false
      if (statusFilter === 'inactive' && emp.status === 'active') return false
      if (!search) return true
      return (
        emp.first_name.toLowerCase().includes(search) ||
        emp.last_name.toLowerCase().includes(search) ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(search) ||
        emp.position.toLowerCase().includes(search) ||
        (emp.department ?? '').toLowerCase().includes(search) ||
        (emp.phone ?? '').replace(/\s/g, '').includes(search.replace(/\s/g, ''))
      )
    })
  }, [employees, searchTerm, statusFilter])

  const salarySum = filtered.reduce((s, e) => s + (Number(e.base_salary) || 0), 0)

  // ----- Selection, bulk status, export -----
  const filteredIds = React.useMemo(() => filtered.map(e => e.id), [filtered])
  const selection = useRowSelection(filteredIds, `${statusFilter}|${searchTerm}`)
  const bulk = useBulkRunner()

  const bulkSetStatus = async (status: 'active' | 'inactive') => {
    const chosen = employees.filter(e => selection.isSelected(e.id))
    const targets = chosen.filter(e => e.status !== status)
    const label = EMPLOYEE_STATUS[status].label
    if (!targets.length) {
      toast.info(`У всех выбранных уже статус «${label}»`)
      return
    }
    const n = targets.length
    const people = `${formatNumber(n)} ${plural(n, ['сотрудника', 'сотрудников', 'сотрудников'])}`
    const ok = await confirm({
      title: `Поставить статус «${label}»?`,
      description:
        `Статус изменится у ${people}` +
        (chosen.length > n ? ` (ещё ${formatNumber(chosen.length - n)} уже с этим статусом)` : '') +
        (status === 'inactive'
          ? '. Неработающие не попадают в новые ведомости и график; данные и история сохранятся.'
          : '. Они снова появятся в графике и при формировании ведомости.'),
      confirmText: 'Изменить статус',
    })
    if (!ok) return
    await bulk.run(
      targets,
      e =>
        requestOk(`/api/hr/employees/${e.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }),
      { done: `Статус «${label}» поставлен`, noun: ['сотруднику', 'сотрудникам', 'сотрудникам'], label: fullName }
    )
    selection.clear()
    fetchEmployees()
  }

  const runExport = () =>
    exportToExcel({
      filename: 'Сотрудники',
      rows: filtered,
      totals: { label: `Итого · ${formatNumber(filtered.length)} ${plural(filtered.length, ['сотрудник', 'сотрудника', 'сотрудников'])}` },
      columns: [
        { header: 'Фамилия', value: e => e.last_name },
        { header: 'Имя', value: e => e.first_name },
        { header: 'Должность', value: e => e.position },
        { header: 'Отдел', value: e => e.department },
        { header: 'Телефон', value: e => e.phone },
        { header: 'Email', value: e => e.email },
        { header: 'Дата рождения', value: e => e.birth_date, type: 'date' },
        { header: 'Дата приёма', value: e => e.hire_date, type: 'date' },
        { header: 'Статус', value: e => (EMPLOYEE_STATUS[e.status] ?? EMPLOYEE_STATUS.inactive).label },
        { header: 'Оклад', value: e => e.base_salary, type: 'money' },
        { header: 'Валюта', value: e => e.currency || 'TJS' },
      ],
    })

  return (
    <PageContainer>
      <PageHeader
        title="Сотрудники"
        description={
          isLoading
            ? 'Карточки сотрудников и оклады'
            : `${formatNumber(counts.active)} ${plural(counts.active, ['работает', 'работают', 'работают'])} · всего ${formatNumber(counts.all)}`
        }
        actions={
          <>
            <ExportButton empty={isLoading || !filtered.length} onExport={runExport} />
            <Button size="sm" onClick={openCreate}>
              <Plus /> Новый сотрудник
            </Button>
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <Panel>
          <PanelToolbar>
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Имя, должность, отдел или телефон" className="sm:w-80" />
            <Segmented
              size="sm"
              aria-label="Статус"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Все', count: counts.all },
                { value: 'active', label: 'Работают', count: counts.active },
                { value: 'inactive', label: 'Не работают', count: counts.inactive },
              ]}
            />
          </PanelToolbar>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UserSquare2}
              title={employees.length ? 'Никого не нашли' : 'Сотрудников пока нет'}
              description={employees.length ? 'Измените поиск или фильтр статуса' : 'Добавьте первого сотрудника, чтобы вести график и зарплату'}
              action={
                !employees.length && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> Новый сотрудник
                  </Button>
                )
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SelectHeadCell selection={selection} label="Выбрать всех сотрудников" />
                    <TableHead>Сотрудник</TableHead>
                    <TableHead className="max-md:hidden">Должность</TableHead>
                    <TableHead className="max-lg:hidden">Телефон</TableHead>
                    <TableHead className="max-xl:hidden">Дата рождения</TableHead>
                    <TableHead className="max-sm:hidden">Статус</TableHead>
                    <TableHead className="text-right">Оклад</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(employee => {
                    const st = EMPLOYEE_STATUS[employee.status] ?? EMPLOYEE_STATUS.inactive
                    return (
                      <TableRow
                        key={employee.id}
                        className="group cursor-pointer"
                        data-state={selection.isSelected(employee.id) ? 'selected' : undefined}
                        onClick={() => openView(employee)}
                      >
                        <SelectCell selection={selection} id={employee.id} label={`Выбрать: ${fullName(employee)}`} />
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar person={employee} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{fullName(employee)}</div>
                              <div className="truncate text-xs text-muted-foreground md:hidden">{employee.position}</div>
                              {employee.department && (
                                <div className="truncate text-xs text-muted-foreground max-md:hidden">{employee.department}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-64 truncate max-md:hidden">{employee.position}</TableCell>
                        <TableCell className="num text-muted-foreground max-lg:hidden">{employee.phone || '—'}</TableCell>
                        <TableCell className="num text-muted-foreground max-xl:hidden">{formatDate(employee.birth_date)}</TableCell>
                        <TableCell className="max-sm:hidden">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="num text-right font-medium">{formatMoney(employee.base_salary, employee.currency || 'TJS')}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className={rowActionsCls}>
                            <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => openEdit(employee)}>
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => handleDelete(employee)}>
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TotalsBar
                label={`оклады ${formatNumber(filtered.length)} ${plural(filtered.length, ['сотрудника', 'сотрудников', 'сотрудников'])}`}
                value={formatMoney(salarySum, 'TJS')}
              />
            </>
          )}
        </Panel>
      )}

      <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress}>
        <Button size="sm" variant="outline" onClick={() => bulkSetStatus('active')}>
          <UserCheck /> Работает
        </Button>
        <Button size="sm" variant="outline" onClick={() => bulkSetStatus('inactive')}>
          <UserMinus /> Не работает
        </Button>
      </BulkBar>

      <EmployeeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        onModeChange={setSheetMode}
        employee={current}
        departments={departments}
        onSaved={fetchEmployees}
        onDelete={handleDelete}
      />
    </PageContainer>
  )
}
