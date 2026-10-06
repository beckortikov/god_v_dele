'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'
import { formatNumber, plural } from '@/lib/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TotalsBar, TableSkeleton } from '@/components/erp/table-parts'
import { Avatar, MonthSwitcher, currentYearMonth, monthLabel, type YearMonth } from '@/components/hr/shared'

interface TimesheetRow {
  employee_id: string
  employee_name: string
  position: string
  days_worked: number
  total_minutes: number
}

const hours = (minutes: number) => minutes / 60
const fmtHours = (h: number) => `${h.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ч`

export function TimesheetPage() {
  const [ym, setYm] = React.useState<YearMonth>(currentYearMonth)
  const [data, setData] = React.useState<TimesheetRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/hr/timesheet?month=${ym.month}&year=${ym.year}`)
      .then(res => res.json())
      .then(result => {
        if (cancelled) return
        if (!result.error) setData(Array.isArray(result) ? result : [])
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ym.month, ym.year])

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? data.filter(r => `${r.employee_name} ${r.position}`.toLowerCase().includes(q)) : data
  }, [data, query])

  const totalMinutes = data.reduce((s, r) => s + (r.total_minutes || 0), 0)
  const totalDays = data.reduce((s, r) => s + (r.days_worked || 0), 0)
  const avgPerDay = totalDays ? hours(totalMinutes) / totalDays : 0
  const maxMinutes = Math.max(1, ...data.map(r => r.total_minutes || 0))
  const visibleMinutes = visible.reduce((s, r) => s + (r.total_minutes || 0), 0)

  return (
    <PageContainer>
      <PageHeader
        title="Табель учёта времени"
        description="Отработанные часы по отметкам сотрудников в личном кабинете"
        actions={<MonthSwitcher value={ym} onChange={setYm} />}
      />

      <StatStrip
        className="max-sm:grid-cols-2 max-sm:[&>*]:px-4"
        loading={loading}
        stats={[
          {
            label: 'Отработано',
            value: fmtHours(hours(totalMinutes)),
            sub: monthLabel(ym),
          },
          {
            label: 'Сотрудников отмечалось',
            value: formatNumber(data.length),
            sub: plural(data.length, ['человек', 'человека', 'человек']),
          },
          {
            label: 'Человеко-дней',
            value: formatNumber(totalDays),
            sub: 'дни хотя бы с одной отметкой',
          },
          {
            label: 'В среднем за день',
            value: totalDays ? fmtHours(avgPerDay) : '—',
            sub: 'на одного сотрудника',
          },
        ]}
      />

      <div className="mt-6">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : (
          <Panel>
            {data.length > 0 && (
              <PanelToolbar>
                <SearchInput value={query} onChange={setQuery} placeholder="Сотрудник или должность" />
              </PanelToolbar>
            )}
            {visible.length === 0 ? (
              <EmptyState
                icon={Clock}
                title={data.length ? 'Никого не нашли' : `Нет отметок за ${monthLabel(ym).toLowerCase()}`}
                description={
                  data.length ? 'Измените запрос поиска' : 'Сотрудники отмечают начало и конец работы в личном кабинете, после этого часы появятся здесь'
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky left-0 z-10 bg-card">Сотрудник</TableHead>
                      <TableHead className="max-md:hidden">Должность</TableHead>
                      <TableHead className="text-right">Дней</TableHead>
                      <TableHead className="text-right">Часов</TableHead>
                      <TableHead className="text-right max-sm:hidden">В среднем</TableHead>
                      <TableHead className="w-48 max-lg:hidden">
                        <span className="sr-only">Доля от максимума</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map(row => {
                      const h = hours(row.total_minutes || 0)
                      const avg = row.days_worked ? h / row.days_worked : 0
                      const [first, ...rest] = row.employee_name.trim().split(' ')
                      return (
                        <TableRow key={row.employee_id} className="group">
                          <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted">
                            <div className="flex items-center gap-3">
                              <Avatar person={{ first_name: first, last_name: rest.join(' ') }} className="max-sm:hidden" />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{row.employee_name.trim() || 'Без имени'}</div>
                                <div className="truncate text-xs text-muted-foreground md:hidden">{row.position}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground max-md:hidden">{row.position || '—'}</TableCell>
                          <TableCell className="num text-right">{formatNumber(row.days_worked)}</TableCell>
                          <TableCell className="num text-right font-medium">{fmtHours(h)}</TableCell>
                          <TableCell className="num text-right text-muted-foreground max-sm:hidden">{fmtHours(avg)}</TableCell>
                          <TableCell className="max-lg:hidden">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-[width] duration-300"
                                style={{ width: `${Math.round(((row.total_minutes || 0) / maxMinutes) * 100)}%` }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <TotalsBar
                  label={`${formatNumber(visible.length)} ${plural(visible.length, ['сотрудник', 'сотрудника', 'сотрудников'])}`}
                  value={fmtHours(hours(visibleMinutes))}
                />
              </>
            )}
          </Panel>
        )}
      </div>
    </PageContainer>
  )
}
