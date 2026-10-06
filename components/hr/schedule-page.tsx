'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarClock, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import {
  MonthSwitcher,
  SHIFTS,
  SHIFT_ORDER,
  WEEKDAYS_SHORT,
  Avatar,
  currentYearMonth,
  dateRange,
  formatDay,
  fullName,
  hhmm,
  isWeekend,
  monthBounds,
  monthLabel,
  weekday,
  type HrEmployee,
  type ScheduleItem,
  type YearMonth,
} from '@/components/hr/shared'
import { ShiftSheet } from '@/components/hr/shift-sheet'

/** "09:00" → "9", "09:30" → "9:30" */
const compactTime = (t?: string | null) => {
  const v = hhmm(t)
  if (!v) return ''
  const [h, m] = v.split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

export function SchedulePage() {
  const confirm = useConfirm()
  const [ym, setYm] = React.useState<YearMonth>(currentYearMonth)
  const [employees, setEmployees] = React.useState<HrEmployee[]>([])
  const [schedules, setSchedules] = React.useState<ScheduleItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ScheduleItem | null>(null)
  const [defaults, setDefaults] = React.useState<{ employee_id?: string; date: string }>({ date: todayISO() })

  const [from, to] = monthBounds(ym.year, ym.month)
  const days = React.useMemo(() => dateRange(from, to), [from, to])
  const today = todayISO()

  const fetchData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const [empRes, scheduleRes] = await Promise.all([
        fetch('/api/hr/employees'),
        fetch(`/api/hr/schedule?start_date=${from}&end_date=${to}`),
      ])
      if (empRes.ok) setEmployees(await empRes.json())
      if (scheduleRes.ok) setSchedules(await scheduleRes.json())
    } catch (error) {
      console.error('Error fetching schedule data:', error)
      toast.error('Не удалось загрузить график', { description: 'Проверьте соединение и обновите страницу' })
    } finally {
      setIsLoading(false)
    }
  }, [from, to])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // employee_id → work_date → record
  const byCell = React.useMemo(() => {
    const map = new Map<string, Map<string, ScheduleItem>>()
    for (const s of schedules) {
      if (!map.has(s.employee_id)) map.set(s.employee_id, new Map())
      map.get(s.employee_id)!.set(s.work_date, s)
    }
    return map
  }, [schedules])

  // Active employees plus anyone who already has a record this month
  const rows = React.useMemo(
    () => (Array.isArray(employees) ? employees : []).filter(e => e.status === 'active' || byCell.has(e.id)),
    [employees, byCell]
  )

  const totals = React.useMemo(() => {
    const t = { work: 0, day_off: 0, vacation: 0, sick_leave: 0, unpaid_leave: 0 }
    schedules.forEach(s => (t[s.shift_type] = (t[s.shift_type] ?? 0) + 1))
    return t
  }, [schedules])

  const workingPerDay = React.useMemo(() => {
    const m = new Map<string, number>()
    schedules.forEach(s => s.shift_type === 'work' && m.set(s.work_date, (m.get(s.work_date) ?? 0) + 1))
    return m
  }, [schedules])

  const openCell = (employeeId: string | undefined, date: string) => {
    const existing = employeeId ? byCell.get(employeeId)?.get(date) ?? null : null
    setEditing(existing)
    setDefaults({ employee_id: employeeId, date })
    setSheetOpen(true)
  }

  const openNew = () => {
    const inMonth = today >= from && today <= to
    openCell(undefined, inMonth ? today : from)
  }

  const handleDelete = async (schedule: ScheduleItem) => {
    if (!schedule.id) return
    const name = fullName(schedule.employees ?? employees.find(e => e.id === schedule.employee_id))
    const ok = await confirm({
      title: 'Удалить запись из графика?',
      description: `${name} · ${formatDay(schedule.work_date, true)} · ${SHIFTS[schedule.shift_type].label}`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/hr/schedule/${schedule.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Ошибка ${res.status}`)
      }
      toast.success('Запись удалена', { description: name })
      setSheetOpen(false)
      fetchData()
    } catch (error: any) {
      toast.error('Не удалось удалить запись', { description: error.message })
    }
  }

  const sheetEmployees = React.useMemo(
    () => (Array.isArray(employees) ? employees : []).filter(e => e.status === 'active' || e.id === editing?.employee_id),
    [employees, editing]
  )

  const dayWord = (n: number) => plural(n, ['день', 'дня', 'дней'])

  return (
    <PageContainer>
      <PageHeader
        title="График работы"
        description="Смены и отсутствия по дням. Нажмите на клетку, чтобы назначить или изменить"
        actions={
          <>
            <MonthSwitcher value={ym} onChange={setYm} />
            <Button size="sm" onClick={openNew}>
              <Plus /> Назначить смену
            </Button>
          </>
        }
      />

      <StatStrip
        className="max-sm:grid-cols-2 max-sm:[&>*]:px-4"
        loading={isLoading}
        stats={[
          { label: 'Рабочих смен', value: formatNumber(totals.work), sub: monthLabel(ym), dot: 'var(--primary)' },
          { label: 'Отпуск', value: formatNumber(totals.vacation), sub: dayWord(totals.vacation), dot: 'var(--success)' },
          { label: 'Больничный', value: formatNumber(totals.sick_leave), sub: dayWord(totals.sick_leave), dot: 'var(--warning)' },
          {
            label: 'Отгулы б/с',
            value: formatNumber(totals.unpaid_leave),
            sub: 'удерживаются из зарплаты',
            dot: 'var(--destructive)',
          },
        ]}
      />

      <Panel className="mt-6">
        <PanelToolbar className="gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {SHIFT_ORDER.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold', SHIFTS[t].cell)}>
                {t === 'work' ? '9' : SHIFTS[t].code}
              </span>
              {SHIFTS[t].label}
            </span>
          ))}
        </PanelToolbar>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-8 flex-1" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Нет активных сотрудников" description="Добавьте сотрудников в разделе «Сотрудники», чтобы составить график" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-36 min-w-36 border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:w-52 sm:min-w-52">
                    Сотрудник
                  </th>
                  {days.map(d => {
                    const isToday = d === today
                    const wknd = isWeekend(d)
                    return (
                      <th
                        key={d}
                        className={cn('min-w-9 border-b px-0.5 py-1.5 text-center font-normal', wknd && 'bg-muted/50')}
                        aria-label={formatDay(d, true)}
                      >
                        <div className={cn('text-[10px] leading-none', wknd ? 'text-muted-foreground/80' : 'text-muted-foreground')}>
                          {WEEKDAYS_SHORT[weekday(d)]}
                        </div>
                        <div
                          className={cn(
                            'num mx-auto mt-1 flex size-6 items-center justify-center rounded-full text-xs font-medium',
                            isToday ? 'bg-primary text-primary-foreground' : wknd ? 'text-muted-foreground' : 'text-foreground'
                          )}
                        >
                          {Number(d.slice(8))}
                        </div>
                      </th>
                    )
                  })}
                  <th className="min-w-14 border-b border-l px-2 py-2 text-right text-xs font-medium text-muted-foreground">Смен</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(emp => {
                  const cells = byCell.get(emp.id)
                  let workCount = 0
                  cells?.forEach(c => c.shift_type === 'work' && workCount++)
                  return (
                    <tr key={emp.id} className="group">
                      <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover:bg-muted">
                        <div className="flex items-center gap-2.5">
                          <Avatar person={emp} className="size-7 text-[11px] max-sm:hidden" />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{fullName(emp)}</div>
                            <div className="truncate text-xs text-muted-foreground max-sm:hidden">{emp.position}</div>
                          </div>
                        </div>
                      </td>
                      {days.map(d => {
                        const s = cells?.get(d)
                        const wknd = isWeekend(d)
                        const label = s
                          ? s.shift_type === 'work'
                            ? `${compactTime(s.start_time)}–${compactTime(s.end_time)}`
                            : SHIFTS[s.shift_type].code
                          : ''
                        const title = s
                          ? `${SHIFTS[s.shift_type].label}${s.shift_type === 'work' && s.start_time ? `, ${hhmm(s.start_time)}–${hhmm(s.end_time)}` : ''}`
                          : 'Назначить'
                        return (
                          <td key={d} className={cn('border-b p-0.5', wknd && 'bg-muted/50', d === today && 'bg-primary-soft/40')}>
                            <Tooltip delayDuration={400}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => openCell(emp.id, d)}
                                  aria-label={`${fullName(emp)}, ${formatDay(d)}: ${title}`}
                                  className={cn(
                                    'num flex h-8 w-full min-w-8 items-center justify-center rounded-md text-[10.5px] leading-none font-medium tracking-tight transition-[background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                                    s ? cn(SHIFTS[s.shift_type].cell, 'hover:ring-1 hover:ring-ring/40') : 'text-transparent hover:bg-accent hover:text-muted-foreground'
                                  )}
                                >
                                  {label || '+'}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {formatDay(d)} · {title}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        )
                      })}
                      <td className="num border-b border-l px-2 text-right font-medium">{workCount || <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 text-xs text-muted-foreground">На работе</td>
                  {days.map(d => {
                    const n = workingPerDay.get(d) ?? 0
                    return (
                      <td key={d} className="num px-0.5 py-2 text-center text-xs text-muted-foreground">
                        {n ? <span className="font-medium text-foreground">{n}</span> : '·'}
                      </td>
                    )
                  })}
                  <td className="num border-l px-2 py-2 text-right text-sm font-semibold">{formatNumber(totals.work)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <ShiftSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        employees={sheetEmployees}
        editing={editing}
        defaults={defaults}
        onSaved={fetchData}
        onDelete={handleDelete}
      />
    </PageContainer>
  )
}
