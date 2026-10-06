'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarDays, Inbox, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton, TotalsBar, dangerIconCls, rowActionsCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { useNavAction } from '@/components/app-shell/nav-context'
import { EventDetailPage } from '@/components/offline-event-detail-page'
import { EventSheet } from '@/components/events/event-sheet'
import { EVENT_STATUS, fmtPct, num, type EventStatus, type OfflineEvent } from '@/components/events/types'

type StatusFilter = 'all' | EventStatus

/** «сегодня», «завтра», «через 5 дн.» for upcoming dates. */
function untilLabel(date: string) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days < 0) return null
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`
}

export function OfflineEventsPage() {
  const confirm = useConfirm()
  const [events, setEvents] = React.useState<OfflineEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null)
  const [filterStatus, setFilterStatus] = React.useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = React.useState('')

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OfflineEvent | null>(null)

  // Detail opens at the top; going back restores the list position
  const listScroll = React.useRef(0)
  const openDetail = (id: string) => {
    listScroll.current = document.querySelector('main')?.scrollTop ?? 0
    setSelectedEventId(id)
  }
  React.useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (main) main.scrollTop = selectedEventId ? 0 : listScroll.current
  }, [selectedEventId])

  const fetchEvents = React.useCallback(async () => {
    try {
      const res = await fetch('/api/offline-events')
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setEvents(result.data || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const openCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openEdit = (ev: OfflineEvent) => {
    setEditing(ev)
    setSheetOpen(true)
  }

  // «Создать → Событие» in the top bar
  useNavAction('new-event', () => {
    setSelectedEventId(null)
    openCreate()
  })

  const handleDeleteEvent = async (ev: OfflineEvent) => {
    const ok = await confirm({
      title: `Удалить «${ev.name}»?`,
      description: `Событие от ${formatDate(ev.event_date)} будет удалено. Действие нельзя отменить.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/offline-events/${ev.id}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      toast.success('Событие удалено')
      fetchEvents()
    } catch (err: any) {
      toast.error('Не удалось удалить событие', { description: err.message })
    }
  }

  const sheet = (
    <EventSheet
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      editing={editing}
      onSaved={id => {
        fetchEvents()
        // A new event opens right away so attendees can be added
        if (!editing && id) openDetail(id)
      }}
    />
  )

  // Detail view
  if (selectedEventId) {
    return (
      <>
        <EventDetailPage
          eventId={selectedEventId}
          onBack={() => {
            setSelectedEventId(null)
            fetchEvents() // Refresh data on back
          }}
        />
        {sheet}
      </>
    )
  }

  const q = searchQuery.trim().toLowerCase()
  const byStatus = (s: StatusFilter) => (s === 'all' ? events : events.filter(e => e.status === s))
  const filteredEvents = byStatus(filterStatus).filter(
    event => event.name.toLowerCase().includes(q) || (event.location && event.location.toLowerCase().includes(q))
  )

  // Numerics may come back as strings: sum them as numbers
  const totalIncome = filteredEvents.reduce((sum, e) => sum + num(e.total_income), 0)
  const totalExpenses = filteredEvents.reduce((sum, e) => sum + num(e.total_expenses), 0)
  const totalBalance = totalIncome - totalExpenses
  const totalAttendees = filteredEvents.reduce((sum, e) => sum + num(e.attendees_attended), 0)

  return (
    <PageContainer>
      <PageHeader
        title="Оффлайн-события"
        description="Мероприятия, гости и бюджет каждого события"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus /> Новое событие
          </Button>
        }
      />

      {error ? (
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить события"
            description={error}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoading(true)
                  fetchEvents()
                }}
              >
                Повторить
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <StatStrip
            loading={loading}
            stats={[
              {
                label: 'Доход',
                dot: 'var(--chart-income)',
                value: formatMoney(totalIncome),
                sub: `${formatNumber(filteredEvents.length)} ${plural(filteredEvents.length, ['событие', 'события', 'событий'])}`,
              },
              { label: 'Расходы', dot: 'var(--chart-expense)', value: formatMoney(totalExpenses) },
              {
                label: 'Баланс',
                value: formatMoney(totalBalance, 'USD', { sign: true }),
                tone: totalBalance < 0 ? 'destructive' : totalBalance > 0 ? 'success' : 'default',
                sub: totalExpenses > 0 ? `ROI ${fmtPct((totalBalance / totalExpenses) * 100)}` : undefined,
              },
              { label: 'Посетители', value: formatNumber(totalAttendees), sub: 'участники и гости' },
            ]}
          />

          <div className="mt-6">
            {loading ? (
              <TableSkeleton rows={6} />
            ) : (
              <Panel>
                <PanelToolbar>
                  <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Название или место" className="sm:w-72" />
                  <div className="overflow-x-auto scrollbar-none">
                    <Segmented
                      size="sm"
                      aria-label="Статус"
                      value={filterStatus}
                      onChange={setFilterStatus}
                      options={[
                        { value: 'all', label: 'Все', count: events.length },
                        ...(Object.keys(EVENT_STATUS) as EventStatus[]).map(s => ({ value: s, label: EVENT_STATUS[s].label, count: byStatus(s).length })),
                      ]}
                    />
                  </div>
                </PanelToolbar>

                {filteredEvents.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title={events.length ? 'Ничего не найдено' : 'Событий пока нет'}
                    description={events.length ? 'Измените поиск или статус' : 'Создайте первое мероприятие, затем добавьте участников и расходы'}
                    action={
                      !events.length && (
                        <Button size="sm" onClick={openCreate}>
                          <Plus /> Новое событие
                        </Button>
                      )
                    }
                  />
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-28">Дата</TableHead>
                          <TableHead>Событие</TableHead>
                          <TableHead className="max-sm:hidden">Статус</TableHead>
                          <TableHead className="text-right max-md:hidden">Участники</TableHead>
                          <TableHead className="text-right max-lg:hidden">Доход</TableHead>
                          <TableHead className="text-right max-lg:hidden">Расходы</TableHead>
                          <TableHead className="text-right">Баланс</TableHead>
                          <TableHead className="text-right max-xl:hidden">ROI</TableHead>
                          <TableHead className="w-20" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEvents.map(event => {
                          const income = num(event.total_income)
                          const expenses = num(event.total_expenses)
                          const balance = num(event.balance)
                          const roi = expenses > 0 ? (balance / expenses) * 100 : 0
                          const st = EVENT_STATUS[event.status] ?? { label: event.status, variant: 'secondary' as const }
                          const until = event.status === 'planned' ? untilLabel(event.event_date) : null
                          return (
                            <TableRow key={event.id} className="group cursor-pointer" onClick={() => openDetail(event.id)}>
                              <TableCell>
                                <div className="num text-muted-foreground">{formatDate(event.event_date)}</div>
                                {until && <div className="text-xs text-info">{until}</div>}
                              </TableCell>
                              <TableCell className="max-w-80 whitespace-normal">
                                <div className="truncate font-medium">{event.name}</div>
                                {event.location && (
                                  <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                    <MapPin className="size-3 shrink-0" />
                                    <span className="truncate">{event.location}</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="max-sm:hidden">
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </TableCell>
                              <TableCell className="text-right max-md:hidden">
                                <span className="num">{formatNumber(num(event.attendees_attended))}</span>
                              </TableCell>
                              <TableCell className="text-right max-lg:hidden">
                                <span className={cn('num', !income && 'text-muted-foreground/70')}>{income ? formatMoney(income) : '—'}</span>
                              </TableCell>
                              <TableCell className="text-right max-lg:hidden">
                                <span className={cn('num', !expenses && 'text-muted-foreground/70')}>{expenses ? formatMoney(expenses) : '—'}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={cn('num font-medium', balance < 0 && 'text-destructive', balance > 0 && 'text-success')}>
                                  {formatMoney(balance, 'USD', { sign: true })}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground max-xl:hidden">
                                <span className={cn('num', roi < 0 && 'text-destructive')}>{expenses > 0 ? fmtPct(roi) : '—'}</span>
                              </TableCell>
                              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                <div className={rowActionsCls}>
                                  <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => openEdit(event)}>
                                    <Pencil />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => handleDeleteEvent(event)}>
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
                      label={`${formatNumber(filteredEvents.length)} ${plural(filteredEvents.length, ['событие', 'события', 'событий'])}`}
                      value={formatMoney(totalBalance, 'USD', { sign: true })}
                      tone={totalBalance < 0 ? 'destructive' : totalBalance > 0 ? 'success' : undefined}
                    />
                  </>
                )}
              </Panel>
            )}
          </div>
        </>
      )}

      {sheet}
    </PageContainer>
  )
}
