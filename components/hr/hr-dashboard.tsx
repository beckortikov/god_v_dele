'use client'

import * as React from 'react'
import { ArrowRight, Cake, CalendarClock, ListTodo, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU, formatMoney, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { useNav } from '@/components/app-shell/nav-context'
import { Avatar, SHIFTS, formatDay, fullName, hhmm, type HrEmployee, type ScheduleItem } from '@/components/hr/shared'

interface TaskStat {
  id: string
  name: string
  position: string
  total: number
  todo: number
  inProgress: number
  completed: number
}

interface PayrollLite {
  total_amount: number | string
  status: 'pending' | 'paid' | 'cancelled'
}

export function HRDashboard() {
  const { navigate } = useNav()
  const [stats, setStats] = React.useState({
    totalEmployees: 0,
    activeEmployees: 0,
    shiftsToday: 0,
    payrollTotal: 0,
  })
  const [employeeTasks, setEmployeeTasks] = React.useState<TaskStat[]>([])
  const [employees, setEmployees] = React.useState<HrEmployee[]>([])
  const [todaySchedule, setTodaySchedule] = React.useState<ScheduleItem[]>([])
  const [payroll, setPayroll] = React.useState<PayrollLite[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  const now = new Date()
  const monthName = MONTHS_RU[now.getMonth()]

  React.useEffect(() => {
    async function fetchStats() {
      try {
        const today = todayISO()
        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth() + 1

        const [empRes, scheduleRes, payrollRes, tasksRes] = await Promise.all([
          fetch('/api/hr/employees'),
          fetch(`/api/hr/schedule?start_date=${today}&end_date=${today}`),
          fetch(`/api/hr/payroll?month=${currentMonth}&year=${currentYear}`),
          fetch(`/api/employee/tasks`), // all tasks, no filters
        ])

        const employeesData = await empRes.json()
        const schedule = await scheduleRes.json()
        const payrollData = await payrollRes.json()
        const tasks = await tasksRes.json()

        const employeesArray: HrEmployee[] = Array.isArray(employeesData) ? employeesData : []
        const tasksArray: any[] = Array.isArray(tasks) ? tasks : []
        const scheduleArray: ScheduleItem[] = Array.isArray(schedule) ? schedule : []
        const payrollArray: PayrollLite[] = Array.isArray(payrollData) ? payrollData : []

        setEmployees(employeesArray)
        setTodaySchedule(scheduleArray)
        setPayroll(payrollArray)
        setStats({
          totalEmployees: employeesArray.length,
          activeEmployees: employeesArray.filter(e => e.status === 'active').length,
          shiftsToday: scheduleArray.filter(s => s.shift_type === 'work').length,
          payrollTotal: payrollArray.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0),
        })

        // Group tasks by employee
        const taskStatsMap: Record<string, TaskStat> = {}
        tasksArray.forEach(task => {
          const empId = task.assignee_id
          if (!empId) return
          if (!taskStatsMap[empId]) {
            const empRecord = employeesArray.find(e => e.id === empId)
            taskStatsMap[empId] = {
              id: empId,
              name: empRecord ? `${empRecord.first_name} ${empRecord.last_name}` : 'Неизвестный сотрудник',
              position: empRecord ? empRecord.position : 'Неизвестная должность',
              total: 0,
              todo: 0,
              inProgress: 0,
              completed: 0,
            }
          }
          taskStatsMap[empId].total++
          if (task.status === 'completed') taskStatsMap[empId].completed++
          else if (task.status === 'in_progress') taskStatsMap[empId].inProgress++
          else taskStatsMap[empId].todo++
        })

        // Employees without tasks are listed with zeros
        employeesArray.forEach(emp => {
          if (!taskStatsMap[emp.id]) {
            taskStatsMap[emp.id] = {
              id: emp.id,
              name: `${emp.first_name} ${emp.last_name}`,
              position: emp.position,
              total: 0,
              todo: 0,
              inProgress: 0,
              completed: 0,
            }
          }
        })

        setEmployeeTasks(Object.values(taskStatsMap).sort((a, b) => b.total - a.total))
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const taskTotals = employeeTasks.reduce(
    (acc, e) => ({ total: acc.total + e.total, completed: acc.completed + e.completed, inProgress: acc.inProgress + e.inProgress }),
    { total: 0, completed: 0, inProgress: 0 }
  )
  const paid = payroll.filter(p => p.status === 'paid').reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
  const pending = payroll.filter(p => p.status === 'pending').reduce((s, p) => s + (Number(p.total_amount) || 0), 0)

  const birthdays = React.useMemo(() => upcomingBirthdays(employees, 45), [employees])

  return (
    <PageContainer>
      <PageHeader
        title="Персонал"
        description={now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase())}
        actions={
          <Button size="sm" onClick={() => navigate('employees', 'new-employee')}>
            <Plus /> Новый сотрудник
          </Button>
        }
      />

      <StatStrip
        className="max-sm:grid-cols-2 max-sm:[&>*]:px-4"
        loading={isLoading}
        stats={[
          {
            label: 'Работают',
            value: formatNumber(stats.activeEmployees),
            sub: `из ${formatNumber(stats.totalEmployees)} в штате`,
            onClick: () => navigate('employees'),
          },
          {
            label: 'Сегодня в смене',
            value: formatNumber(stats.shiftsToday),
            sub: todaySchedule.length ? 'по графику' : 'график на сегодня не заполнен',
            onClick: () => navigate('schedule'),
          },
          {
            label: `ФОТ · ${monthName.toLowerCase()}`,
            value: formatMoney(stats.payrollTotal, 'TJS'),
            sub: payroll.length ? `выплачено ${formatMoney(paid, 'TJS')}` : 'ведомость не сформирована',
            onClick: () => navigate('payroll'),
          },
          {
            label: 'Задачи выполнены',
            value: taskTotals.total ? `${Math.round((taskTotals.completed / taskTotals.total) * 100)}%` : '—',
            sub: `${formatNumber(taskTotals.completed)} из ${formatNumber(taskTotals.total)} ${plural(taskTotals.total, ['задачи', 'задач', 'задач'])}`,
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[1.45fr_1fr]">
        {/* Task completion per employee */}
        <Panel className="self-start">
          <PanelHead title="Задачи по сотрудникам" note={taskTotals.inProgress ? `${formatNumber(taskTotals.inProgress)} в работе` : undefined} />
          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : employeeTasks.length === 0 ? (
            <EmptyState icon={ListTodo} title="Нет сотрудников или задач" className="py-10" />
          ) : (
            <ul className="divide-y">
              {employeeTasks.map(emp => {
                const pct = emp.total ? Math.round((emp.completed / emp.total) * 100) : 0
                const [first, ...rest] = emp.name.split(' ')
                return (
                  <li key={emp.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar person={{ first_name: first, last_name: rest.join(' ') }} />
                    <div className="w-40 min-w-0 shrink-0 max-sm:flex-1">
                      <div className="truncate text-sm font-medium">{emp.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{emp.position}</div>
                    </div>
                    <div className="flex flex-1 items-center gap-3 max-sm:hidden">
                      <TaskBar emp={emp} />
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      {emp.total ? (
                        <>
                          <div className={cn('num text-sm font-semibold', pct === 100 && 'text-success')}>{pct}%</div>
                          <div className="num text-xs text-muted-foreground">
                            {emp.completed} из {emp.total}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">нет задач</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {!isLoading && taskTotals.total > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Завершено
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-info" /> В работе
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/30" /> К выполнению
              </span>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          {/* Today */}
          <Panel>
            <PanelHead title="Сегодня" onOpen={() => navigate('schedule')} openLabel="График" />
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : todaySchedule.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="На сегодня смен нет"
                description="Заполните график, чтобы видеть, кто на работе"
                className="py-8"
                action={
                  <Button size="sm" variant="outline" onClick={() => navigate('schedule')}>
                    Открыть график
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {todaySchedule.map(s => (
                  <li key={s.id ?? s.employee_id} className="flex items-center gap-3 px-4 py-2">
                    <Avatar person={s.employees} className="size-7 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-sm">{fullName(s.employees)}</span>
                    {s.shift_type === 'work' && s.start_time ? (
                      <span className="num text-sm text-muted-foreground">
                        {hhmm(s.start_time)}–{hhmm(s.end_time)}
                      </span>
                    ) : (
                      <Badge variant={SHIFTS[s.shift_type].badge}>{SHIFTS[s.shift_type].short}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Payroll progress */}
          <Panel>
            <PanelHead title={`Зарплата за ${monthName.toLowerCase()}`} onOpen={() => navigate('payroll')} openLabel="Ведомость" />
            <div className="px-4 pt-1 pb-4">
              {isLoading ? (
                <Skeleton className="h-14 w-full" />
              ) : payroll.length === 0 ? (
                <div className="flex items-center justify-between gap-3 py-1">
                  <p className="text-sm text-muted-foreground">Ведомость ещё не сформирована</p>
                  <Button size="sm" variant="outline" onClick={() => navigate('payroll')}>
                    Сформировать
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="num text-xl font-semibold tracking-tight">{formatMoney(stats.payrollTotal, 'TJS')}</span>
                    <span className="num text-xs text-muted-foreground">
                      {stats.payrollTotal ? Math.round((paid / stats.payrollTotal) * 100) : 0}% выплачено
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success transition-[width] duration-500"
                      style={{ width: `${stats.payrollTotal ? Math.min(100, (paid / stats.payrollTotal) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Выплачено</div>
                      <div className="num font-medium">{formatMoney(paid, 'TJS')}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Осталось</div>
                      <div className={cn('num font-medium', pending > 0 && 'text-warning')}>{formatMoney(pending, 'TJS')}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Panel>

          {/* Birthdays */}
          <Panel>
            <PanelHead title="Дни рождения" onOpen={() => navigate('employees')} openLabel="Сотрудники" />
            {isLoading ? (
              <ListSkeleton rows={2} />
            ) : birthdays.length === 0 ? (
              <p className="flex items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
                <Cake className="size-4" /> В ближайшие полтора месяца нет
              </p>
            ) : (
              <ul className="divide-y">
                {birthdays.slice(0, 5).map(b => (
                  <li key={b.employee.id} className="flex items-center gap-3 px-4 py-2">
                    <Avatar person={b.employee} className="size-7 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-sm">{fullName(b.employee)}</span>
                    <span className={cn('num text-sm', b.inDays === 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
                      {b.inDays === 0 ? 'сегодня' : b.inDays === 1 ? 'завтра' : formatDay(b.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function PanelHead({ title, note, onOpen, openLabel }: { title: string; note?: string; onOpen?: () => void; openLabel?: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-2 px-4 py-2">
      <h2 className="font-semibold">{title}</h2>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
      {onOpen && (
        <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={onOpen}>
          {openLabel} <ArrowRight />
        </Button>
      )}
    </div>
  )
}

function TaskBar({ emp }: { emp: TaskStat }) {
  if (!emp.total) return <div className="h-1.5 w-full rounded-full bg-muted" />
  const seg = (n: number) => `${(n / emp.total) * 100}%`
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Завершено ${emp.completed}, в работе ${emp.inProgress}, к выполнению ${emp.todo}`}>
      <div className="h-full bg-success" style={{ width: seg(emp.completed) }} />
      <div className="h-full bg-info" style={{ width: seg(emp.inProgress) }} />
      <div className="h-full bg-muted-foreground/30" style={{ width: seg(emp.todo) }} />
    </div>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 px-4 pb-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  )
}

/** Employees whose birthday falls within the next `days` days. */
function upcomingBirthdays(employees: HrEmployee[], days: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: { employee: HrEmployee; date: string; inDays: number }[] = []
  for (const e of employees) {
    if (e.status !== 'active' || !e.birth_date) continue
    const [, m, d] = e.birth_date.split('-').map(Number)
    if (!m || !d) continue
    let next = new Date(start.getFullYear(), m - 1, d)
    if (next < start) next = new Date(start.getFullYear() + 1, m - 1, d)
    const inDays = Math.round((next.getTime() - start.getTime()) / 86400000)
    if (inDays <= days) {
      const iso = `${next.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({ employee: e, date: iso, inDays })
    }
  }
  return out.sort((a, b) => a.inDays - b.inDays)
}
