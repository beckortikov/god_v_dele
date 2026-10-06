'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarDays,
  FileSpreadsheet,
  MapPin,
  MoreHorizontal,
  Pencil,
  Receipt,
  SearchX,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageContainer, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton, TotalsBar, dangerIconCls, rowActionsCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { EventSheet } from '@/components/events/event-sheet'
import { AddAttendeesSheet, EditAttendeeSheet } from '@/components/events/attendee-sheets'
import { EventExpenseSheet } from '@/components/events/event-expense-sheet'
import { exportEventToExcel } from '@/components/events/event-export'
import { Initials } from '@/components/events/parts'
import {
  ATTENDANCE,
  EVENT_STATUS,
  attendanceOf,
  attendeeName,
  categoryLabel,
  fmtPct,
  num,
  type Attendee,
  type EventExpense,
  type EventParticipant,
  type EventStatus,
  type FinancialSummary,
  type OfflineEvent,
} from '@/components/events/types'

interface EventDetailPageProps {
  eventId: string
  onBack: () => void
}

type Tab = 'attendees' | 'expenses' | 'finance'
type TypeFilter = 'all' | 'participant' | 'guest'

export function EventDetailPage({ eventId, onBack }: EventDetailPageProps) {
  const confirm = useConfirm()
  const [event, setEvent] = React.useState<OfflineEvent | null>(null)
  const [attendees, setAttendees] = React.useState<Attendee[]>([])
  const [expenses, setExpenses] = React.useState<EventExpense[]>([])
  const [summary, setSummary] = React.useState<FinancialSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [participantsList, setParticipantsList] = React.useState<EventParticipant[]>([])

  const [tab, setTab] = React.useState<Tab>('attendees')
  const [query, setQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')

  // Sheets
  const [addOpen, setAddOpen] = React.useState(false)
  const [editAttendee, setEditAttendee] = React.useState<Attendee | null>(null)
  const [editAttendeeOpen, setEditAttendeeOpen] = React.useState(false)
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [editingExpense, setEditingExpense] = React.useState<EventExpense | null>(null)
  const [eventSheetOpen, setEventSheetOpen] = React.useState(false)

  // Fetch Data (the skeleton shows only on the first load; refreshes are silent)
  const fetchData = React.useCallback(async () => {
    try {
      const [eventRes, attendeesRes, expensesRes, summaryRes, participantsRes] = await Promise.all([
        fetch(`/api/offline-events/${eventId}`).then(r => r.json()),
        fetch(`/api/offline-events/${eventId}/attendees`).then(r => r.json()),
        fetch(`/api/offline-events/${eventId}/expenses`).then(r => r.json()),
        fetch(`/api/offline-events/${eventId}/financial-summary`).then(r => r.json()),
        fetch(`/api/participants`).then(r => r.json()),
      ])

      if (eventRes.data) setEvent(eventRes.data)
      if (attendeesRes.data) setAttendees(attendeesRes.data)
      if (expensesRes.data) setExpenses(expensesRes.data)
      if (summaryRes.data) setSummary(summaryRes.data)
      if (participantsRes.data) setParticipantsList(participantsRes.data)
    } catch (error) {
      console.error('Error loading event details:', error)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  React.useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // ---------- Actions ----------
  const handleDeleteAttendee = async (a: Attendee) => {
    const ok = await confirm({
      title: `Убрать «${attendeeName(a)}» из события?`,
      description: num(a.payment_received) > 0 ? `Оплата ${formatMoney(a.payment_received)} тоже исчезнет из доходов события.` : 'Действие нельзя отменить.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/offline-events/${eventId}/attendees/${a.id}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      toast.success('Участник удалён')
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось удалить участника', { description: err.message })
    }
  }

  const handleDeleteExpense = async (e: EventExpense) => {
    const ok = await confirm({
      title: 'Удалить расход?',
      description: `«${e.name}» на ${formatMoney(e.amount)}. Действие нельзя отменить.`,
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/offline-events/${eventId}/expenses/${e.id}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      toast.success('Расход удалён')
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось удалить расход', { description: err.message })
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/offline-events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setEvent(prev => (prev ? { ...prev, status: newStatus as EventStatus } : null))
      toast.success(`Статус: ${EVENT_STATUS[newStatus as EventStatus]?.label ?? newStatus}`)
    } catch (error: any) {
      toast.error('Не удалось изменить статус', { description: error.message })
    }
  }

  /** Quick attendance mark right from the table. */
  const handleAttendanceChange = async (a: Attendee, status: string) => {
    if (status === a.attendance_status) return
    const prev = attendees
    setAttendees(list => list.map(x => (x.id === a.id ? { ...x, attendance_status: status } : x)))
    try {
      const res = await fetch(`/api/offline-events/${eventId}/attendees/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_status: status }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      fetchData()
    } catch (err: any) {
      setAttendees(prev)
      toast.error('Не удалось изменить статус', { description: err.message })
    }
  }

  const handleDeleteEvent = async () => {
    if (!event) return
    const ok = await confirm({
      title: `Удалить «${event.name}»?`,
      description: 'Событие будет удалено вместе со списком участников. Действие нельзя отменить.',
      confirmText: 'Удалить событие',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/offline-events/${event.id}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      toast.success('Событие удалено')
      onBack()
    } catch (err: any) {
      toast.error('Не удалось удалить событие', { description: err.message })
    }
  }

  const openExpense = (e: EventExpense | null) => {
    setEditingExpense(e)
    setExpenseOpen(true)
  }
  const openAttendee = (a: Attendee) => {
    setEditAttendee(a)
    setEditAttendeeOpen(true)
  }

  const runExport = () => {
    if (!event) return
    try {
      exportEventToExcel(event, attendees, expenses, summary)
    } catch (err: any) {
      toast.error('Не удалось сформировать файл', { description: err?.message })
    }
  }

  // ---------- Render ----------
  if (loading) return <DetailSkeleton onBack={onBack} />
  if (!event) {
    return (
      <PageContainer>
        <BackButton onBack={onBack} />
        <Panel>
          <EmptyState
            icon={SearchX}
            title="Событие не найдено"
            description="Возможно, его удалили. Вернитесь к списку событий."
            action={
              <Button size="sm" variant="outline" onClick={onBack}>
                К списку событий
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const st = EVENT_STATUS[event.status] ?? { label: event.status, variant: 'secondary' as const }
  const totalIncome = num(summary?.total_income ?? event.total_income)
  const totalExpenses = num(summary?.total_expenses ?? event.total_expenses)
  const balance = num(summary?.balance ?? event.balance)
  const roi = num(summary?.roi)
  const attendedCount = attendees.filter(a => a.attendance_status === 'attended').length
  const guestsCount = attendees.filter(a => a.attendee_type === 'guest').length
  const existingParticipantIds = new Set(attendees.map(a => a.participant_id).filter(Boolean) as string[])

  return (
    <PageContainer>
      {/* Header */}
      <BackButton onBack={onBack} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">{event.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {formatDate(event.event_date, 'long')}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {event.location}
              </span>
            )}
            {event.description && <span className="max-w-xl truncate">{event.description}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={event.status} onValueChange={handleStatusChange}>
            <SelectTrigger size="sm" className="min-w-40" aria-label="Статус события">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    st.variant === 'success' ? 'bg-success' : st.variant === 'info' ? 'bg-info' : 'bg-muted-foreground/60'
                  )}
                />
                {st.label}
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              {(Object.keys(EVENT_STATUS) as EventStatus[]).map(k => (
                <SelectItem key={k} value={k}>
                  {EVENT_STATUS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Действия с событием">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEventSheetOpen(true)}>
                <Pencil /> Изменить событие
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={runExport}>
                <FileSpreadsheet /> Экспорт в Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleDeleteEvent}>
                <Trash2 /> Удалить событие
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => openExpense(null)}>
            <Receipt /> Расход
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus /> Добавить участников
          </Button>
        </div>
      </div>

      {/* Key numbers */}
      <StatStrip
        stats={[
          {
            label: 'Доход',
            dot: 'var(--chart-income)',
            value: formatMoney(totalIncome),
            sub:
              summary && (summary.income_breakdown.guest_payments > 0 || summary.income_breakdown.other_income > 0)
                ? `гости ${formatMoney(summary.income_breakdown.guest_payments)} · участники ${formatMoney(summary.income_breakdown.other_income)}`
                : 'оплат пока нет',
            onClick: () => setTab('finance'),
          },
          {
            label: 'Расходы',
            dot: 'var(--chart-expense)',
            value: formatMoney(totalExpenses),
            sub: `${formatNumber(expenses.length)} ${plural(expenses.length, ['статья', 'статьи', 'статей'])}`,
            onClick: () => setTab('expenses'),
          },
          {
            label: 'Баланс',
            value: formatMoney(balance, 'USD', { sign: true }),
            tone: balance < 0 ? 'destructive' : balance > 0 ? 'success' : 'default',
            sub: totalExpenses > 0 ? `ROI ${fmtPct(roi)}` : 'расходов нет',
          },
          {
            label: 'Участники',
            value: formatNumber(attendees.length),
            sub: `пришли ${formatNumber(attendedCount)} · гостей ${formatNumber(guestsCount)}`,
            onClick: () => setTab('attendees'),
          },
        ]}
      />

      <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
        <Segmented
          aria-label="Раздел события"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'attendees', label: 'Участники', count: attendees.length },
            { value: 'expenses', label: 'Расходы', count: expenses.length },
            { value: 'finance', label: 'Финансы' },
          ]}
        />
      </div>

      {tab === 'attendees' ? (
        <AttendeesPanel
          attendees={attendees}
          query={query}
          setQuery={setQuery}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          onAdd={() => setAddOpen(true)}
          onEdit={openAttendee}
          onDelete={handleDeleteAttendee}
          onAttendance={handleAttendanceChange}
        />
      ) : tab === 'expenses' ? (
        <ExpensesPanel expenses={expenses} onAdd={() => openExpense(null)} onEdit={openExpense} onDelete={handleDeleteExpense} />
      ) : (
        <FinancePanel summary={summary} attendees={attendees} expenses={expenses} income={totalIncome} spent={totalExpenses} balance={balance} roi={roi} />
      )}

      <AddAttendeesSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        eventId={eventId}
        participants={participantsList}
        existingIds={existingParticipantIds}
        onSaved={fetchData}
      />
      <EditAttendeeSheet open={editAttendeeOpen} onOpenChange={setEditAttendeeOpen} eventId={eventId} attendee={editAttendee} onSaved={fetchData} />
      <EventExpenseSheet open={expenseOpen} onOpenChange={setExpenseOpen} eventId={eventId} editing={editingExpense} onSaved={fetchData} />
      <EventSheet open={eventSheetOpen} onOpenChange={setEventSheetOpen} editing={event} onSaved={() => fetchData()} />
    </PageContainer>
  )
}

// ---------------------------------------------------------------------------

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="mb-2 -ml-2.5 text-muted-foreground" onClick={onBack}>
      <ArrowLeft /> Все события
    </Button>
  )
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <PageContainer>
      <BackButton onBack={onBack} />
      <div className="mb-5">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <StatStrip loading stats={[{ label: 'Доход', value: '' }, { label: 'Расходы', value: '' }, { label: 'Баланс', value: '' }, { label: 'Участники', value: '' }]} />
      <div className="mt-6">
        <TableSkeleton rows={6} />
      </div>
    </PageContainer>
  )
}

function Money({ usd, currency, original, className }: { usd: number; currency?: string; original?: number; className?: string }) {
  return (
    <>
      <div className={cn('num', className)}>{formatMoney(usd)}</div>
      {currency === 'TJS' && num(original) > 0 && <div className="num text-xs font-normal text-muted-foreground">{formatMoney(num(original), 'TJS')}</div>}
    </>
  )
}

// ---------- Attendees ----------

function AttendeesPanel({
  attendees,
  query,
  setQuery,
  typeFilter,
  setTypeFilter,
  onAdd,
  onEdit,
  onDelete,
  onAttendance,
}: {
  attendees: Attendee[]
  query: string
  setQuery: (v: string) => void
  typeFilter: TypeFilter
  setTypeFilter: (v: TypeFilter) => void
  onAdd: () => void
  onEdit: (a: Attendee) => void
  onDelete: (a: Attendee) => void
  onAttendance: (a: Attendee, status: string) => void
}) {
  const q = query.trim().toLowerCase()
  const visible = attendees.filter(a => {
    if (typeFilter !== 'all' && a.attendee_type !== typeFilter) return false
    if (!q) return true
    return [attendeeName(a), a.guest_phone, a.guest_email, a.payment_notes].some(v => v?.toLowerCase().includes(q))
  })
  const paid = visible.reduce((s, a) => s + num(a.payment_received), 0)
  const participantsCount = attendees.filter(a => a.attendee_type === 'participant').length

  return (
    <Panel>
      {attendees.length > 0 && (
        <PanelToolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Имя, контакт или комментарий" className="sm:w-72" />
          <Segmented
            size="sm"
            aria-label="Тип"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: 'Все', count: attendees.length },
              { value: 'participant', label: 'Участники', count: participantsCount },
              { value: 'guest', label: 'Гости', count: attendees.length - participantsCount },
            ]}
          />
        </PanelToolbar>
      )}
      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={attendees.length ? 'Никого не найдено' : 'Список пока пуст'}
          description={attendees.length ? 'Измените поиск или фильтр' : 'Добавьте участников программ или гостей, чтобы учитывать оплаты и присутствие'}
          action={
            !attendees.length && (
              <Button size="sm" onClick={onAdd}>
                <UserPlus /> Добавить участников
              </Button>
            )
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Имя</TableHead>
                <TableHead className="max-md:hidden">Тип</TableHead>
                <TableHead>Присутствие</TableHead>
                <TableHead className="text-right">Оплата</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(a => {
                const name = attendeeName(a)
                const isGuest = a.attendee_type === 'guest'
                const contact = a.guest_phone || a.guest_email
                const att = attendanceOf(a.attendance_status)
                const amount = num(a.payment_received)
                return (
                  <TableRow key={a.id} className="group cursor-pointer" onClick={() => onEdit(a)}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <div className="flex items-center gap-2.5">
                        <Initials name={name} guest={isGuest} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{name}</div>
                          {(contact || a.payment_notes) && (
                            <div className="truncate text-xs text-muted-foreground">{[isGuest ? contact : null, a.payment_notes].filter(Boolean).join(' · ')}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-md:hidden">
                      <Badge variant={isGuest ? 'info' : 'secondary'}>{isGuest ? 'Гость' : 'Участник'}</Badge>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select value={a.attendance_status} onValueChange={v => onAttendance(a, v)}>
                        <SelectTrigger
                          size="sm"
                          aria-label={`Присутствие: ${name}`}
                          className="-ml-2 h-7 gap-1 border-transparent bg-transparent px-2 shadow-none hover:border-input dark:bg-transparent [&>svg]:opacity-0 group-hover:[&>svg]:opacity-60"
                        >
                          <Badge variant={att.variant}>{att.label}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {ATTENDANCE.map(o => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {amount > 0 ? (
                        <Money usd={amount} currency={a.currency} original={a.original_amount} className="font-medium text-success" />
                      ) : (
                        <span className="text-muted-foreground/70">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className={rowActionsCls}>
                        <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => onEdit(a)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => onDelete(a)}>
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
            label={`${formatNumber(visible.length)} ${plural(visible.length, ['человек', 'человека', 'человек'])}`}
            value={formatMoney(paid, 'USD', { sign: true })}
            tone={paid > 0 ? 'success' : undefined}
          />
        </>
      )}
    </Panel>
  )
}

// ---------- Expenses ----------

function ExpensesPanel({
  expenses,
  onAdd,
  onEdit,
  onDelete,
}: {
  expenses: EventExpense[]
  onAdd: () => void
  onEdit: (e: EventExpense) => void
  onDelete: (e: EventExpense) => void
}) {
  const total = expenses.reduce((s, e) => s + num(e.amount), 0)
  return (
    <Panel>
      {expenses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Расходов пока нет"
          description="Аренда зала, еда, транспорт: всё, что потрачено на событие"
          action={
            <Button size="sm" onClick={onAdd}>
              <Receipt /> Новый расход
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28">Дата</TableHead>
                <TableHead>Расход</TableHead>
                <TableHead className="max-sm:hidden">Категория</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map(e => (
                <TableRow key={e.id} className="group cursor-pointer" onClick={() => onEdit(e)}>
                  <TableCell className="num text-muted-foreground">{formatDate(e.expense_date)}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal">
                    <div className="truncate font-medium">{e.name}</div>
                    {e.description && <div className="truncate text-xs text-muted-foreground">{e.description}</div>}
                  </TableCell>
                  <TableCell className="max-sm:hidden">
                    <Badge variant="secondary">{categoryLabel(e.category)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money usd={-num(e.amount)} currency={e.currency} original={e.original_amount} className="font-medium" />
                  </TableCell>
                  <TableCell className="text-right" onClick={ev => ev.stopPropagation()}>
                    <div className={rowActionsCls}>
                      <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => onEdit(e)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => onDelete(e)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TotalsBar label={`${formatNumber(expenses.length)} ${plural(expenses.length, ['расход', 'расхода', 'расходов'])}`} value={formatMoney(-total)} />
        </>
      )}
    </Panel>
  )
}

// ---------- Finance ----------

function FinancePanel({
  summary,
  attendees,
  expenses,
  income,
  spent,
  balance,
  roi,
}: {
  summary: FinancialSummary | null
  attendees: Attendee[]
  expenses: EventExpense[]
  income: number
  spent: number
  balance: number
  roi: number
}) {
  const guest = num(summary?.income_breakdown?.guest_payments)
  const other = num(summary?.income_breakdown?.other_income)
  const breakdown = summary?.expense_breakdown
    ? Object.entries(summary.expense_breakdown).map(([k, v]) => ({ key: k, value: num(v) }))
    : Object.entries(
        expenses.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + num(e.amount)), acc), {})
      ).map(([key, value]) => ({ key, value }))
  breakdown.sort((a, b) => b.value - a.value)
  // Totals are kept by the database; show any part not covered by expense rows
  const unexplained = spent - breakdown.reduce((t, b) => t + b.value, 0)

  const share = (v: number, of: number) => (of > 0 ? Math.round((v / of) * 100) : 0)

  const line = (label: React.ReactNode, value: number, opts?: { muted?: boolean; pctOf?: number; strong?: boolean; signed?: boolean }) => (
    <div className={cn('flex items-center gap-3 border-b py-2 text-sm last:border-0', opts?.strong && 'font-semibold')}>
      <span className={cn('min-w-0 flex-1 truncate', opts?.muted && 'pl-3 text-muted-foreground')}>{label}</span>
      {opts?.pctOf != null && <span className="num w-12 text-right text-xs text-muted-foreground">{share(value, opts.pctOf)}%</span>}
      <span className={cn('num w-28 text-right', opts?.signed && value < 0 && 'text-destructive', opts?.signed && value > 0 && 'text-success')}>
        {formatMoney(value, 'USD', { sign: opts?.signed })}
      </span>
    </div>
  )

  const counts = ATTENDANCE.map(a => ({ ...a, n: attendees.filter(x => x.attendance_status === a.value).length })).filter(a => a.n > 0)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="px-4 py-3.5">
        <h3 className="mb-1 text-sm font-semibold">Итоги события</h3>
        {line('Доход', income, { strong: true })}
        {line('от участников программ', other, { muted: true, pctOf: income })}
        {line('от гостей', guest, { muted: true, pctOf: income })}
        {line('Расходы', spent, { strong: true })}
        {breakdown.length === 0 && unexplained <= 0.005 ? (
          <p className="border-b py-2 pl-3 text-sm text-muted-foreground">Расходов нет</p>
        ) : (
          breakdown.map(b => <React.Fragment key={b.key}>{line(categoryLabel(b.key), b.value, { muted: true, pctOf: spent })}</React.Fragment>)
        )}
        {unexplained > 0.005 && line('без детализации по статьям', unexplained, { muted: true, pctOf: spent })}
        <div className="-mx-4 mt-1 -mb-3.5 flex items-center justify-between bg-muted/50 px-4 py-3">
          <span className="font-semibold">Баланс</span>
          <span className="flex items-baseline gap-3">
            <span className="num text-xs text-muted-foreground">{spent > 0 ? `ROI ${fmtPct(roi)}` : ''}</span>
            <span className={cn('num text-base font-semibold', balance < 0 && 'text-destructive', balance > 0 && 'text-success')}>
              {formatMoney(balance, 'USD', { sign: true })}
            </span>
          </span>
        </div>
      </Panel>

      <Panel className="px-4 py-3.5">
        <h3 className="mb-3 text-sm font-semibold">Присутствие</h3>
        {attendees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Участников пока нет</p>
        ) : (
          <>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
              {counts.map(c => (
                <div
                  key={c.value}
                  style={{ flex: c.n }}
                  className={cn(
                    c.variant === 'success' && 'bg-success',
                    c.variant === 'info' && 'bg-info',
                    c.variant === 'warning' && 'bg-warning',
                    c.variant === 'destructive' && 'bg-destructive',
                    c.variant === 'secondary' && 'bg-muted-foreground/40'
                  )}
                />
              ))}
            </div>
            <div className="mt-3 divide-y">
              {counts.map(c => (
                <div key={c.value} className="flex items-center justify-between py-2 text-sm">
                  <Badge variant={c.variant}>{c.label}</Badge>
                  <span className="num">
                    {formatNumber(c.n)} <span className="text-xs text-muted-foreground">· {share(c.n, attendees.length)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
