'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Archive, CalendarPlus, Inbox, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatMoney, formatNumber, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { StatStrip } from '@/components/erp/stat-strip'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TotalsBar, TableSkeleton, rowActionsCls } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { useNavAction } from '@/components/app-shell/nav-context'
import { ParticipantFormSheet } from '@/components/participants/participant-form-sheet'
import { ParticipantDetailSheet } from '@/components/participants/participant-detail-sheet'
import { PaymentSheet, type PaymentPreset } from '@/components/finance/payment-sheet'
import type { Account } from '@/components/finance/types'
import { buildSchedule } from '@/lib/payment-schedule'
import {
  PARTICIPANT_STATUS,
  monthlyTariff,
  readPref,
  summarize,
  writePref,
  type MonthlyPayment,
  type Participant,
  type ParticipantSummary,
  type Program,
} from '@/components/participants/types'

type PaymentFilter = 'all' | 'overdue' | 'partial' | 'paid'

const PAGE_SIZE = 25
const PREFS_KEY = 'participants-page-prefs'
const NO_PAYMENTS: MonthlyPayment[] = []

const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'all', label: 'Все оплаты' },
  { value: 'overdue', label: 'С просрочкой' },
  { value: 'partial', label: 'С недоплатой' },
  { value: 'paid', label: 'Оплатили этот месяц' },
]

export function ParticipantsPage() {
  const confirm = useConfirm()

  const [participants, setParticipants] = React.useState<Participant[]>([])
  const [programs, setPrograms] = React.useState<Program[]>([])
  const [payments, setPayments] = React.useState<MonthlyPayment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Filters
  const [query, setQuery] = React.useState('')
  const [filterStatus, setFilterStatus] = React.useState<PaymentFilter>('all')
  const [filterProgram, setFilterProgram] = React.useState('all')
  const [page, setPage] = React.useState(1)

  // Sheets
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Participant | null>(null)
  // «Внести оплату» from the participant card
  const [payOpen, setPayOpen] = React.useState(false)
  const [payPreset, setPayPreset] = React.useState<PaymentPreset | null>(null)
  const [accounts, setAccounts] = React.useState<Account[] | null>(null)
  const [scheduling, setScheduling] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    try {
      const [participantsRes, programsRes, paymentsRes] = await Promise.all([
        fetch('/api/participants').then(res => res.json()),
        fetch('/api/programs').then(res => res.json()),
        fetch('/api/monthly-payments').then(res => res.json()),
      ])
      if (participantsRes.error) throw new Error(participantsRes.error)
      if (programsRes.error) throw new Error(programsRes.error)
      if (paymentsRes.error) throw new Error(paymentsRes.error)

      setParticipants(participantsRes.data || [])
      setPrograms(programsRes.data || [])
      setPayments(paymentsRes.data || [])
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

  // Program filter is remembered between visits
  React.useEffect(() => {
    try {
      const saved = JSON.parse(readPref(PREFS_KEY) || '{}')
      if (saved.program) setFilterProgram(saved.program)
    } catch {}
  }, [])
  React.useEffect(() => {
    writePref(PREFS_KEY, JSON.stringify({ program: filterProgram }))
  }, [filterProgram])

  React.useEffect(() => setPage(1), [query, filterStatus, filterProgram])

  // A remembered program that no longer exists falls back to «all»
  React.useEffect(() => {
    if (!loading && filterProgram !== 'all' && !programs.some(p => p.id === filterProgram)) setFilterProgram('all')
  }, [loading, programs, filterProgram])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (p: Participant) => {
    setEditing(p)
    setFormOpen(true)
  }
  const openDetail = (p: Participant) => {
    setDetailId(p.id)
    setDetailOpen(true)
  }

  useNavAction('new-participant', openCreate)

  // «open-participant» from search or notifications: open the card once the list is loaded
  const [pendingOpenId, setPendingOpenId] = React.useState<string | null>(null)
  useNavAction('open-participant', payload => {
    if (typeof payload?.id === 'string') setPendingOpenId(payload.id)
  })
  React.useEffect(() => {
    if (!pendingOpenId || loading) return
    const target = participants.find(p => p.id === pendingOpenId)
    setPendingOpenId(null)
    if (target) openDetail(target)
    else toast.error('Участник не найден', { description: 'Возможно, его удалили' })
  }, [pendingOpenId, loading, participants])

  // ---------- Derived data ----------
  const paymentsBy = React.useMemo(() => {
    const map = new Map<string, MonthlyPayment[]>()
    for (const pay of payments) {
      const list = map.get(pay.participant_id)
      if (list) list.push(pay)
      else map.set(pay.participant_id, [pay])
    }
    return map
  }, [payments])

  const summaries = React.useMemo(() => {
    const map = new Map<string, ParticipantSummary>()
    for (const p of participants) map.set(p.id, summarize(p, paymentsBy.get(p.id) ?? NO_PAYMENTS))
    return map
  }, [participants, paymentsBy])

  // Paid months out of the expected schedule (start date × program duration)
  const progress = React.useMemo(() => {
    const map = new Map<string, { paid: number; scheduled: number }>()
    for (const p of participants) {
      const s = buildSchedule(p, paymentsBy.get(p.id) ?? NO_PAYMENTS)
      map.set(p.id, { paid: s.paidCount, scheduled: s.scheduledCount })
    }
    return map
  }, [participants, paymentsBy])

  const q = query.trim().toLowerCase()
  const filteredParticipants = participants.filter(p => {
    const s = summaries.get(p.id)
    const matchesSearch =
      !q || p.name.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)

    let matchesStatus = true
    if (filterStatus === 'overdue') matchesStatus = !!s?.overdue
    else if (filterStatus === 'partial') matchesStatus = !!s?.partial
    else if (filterStatus === 'paid') matchesStatus = !!s?.paidThisMonth

    const matchesProgram = filterProgram === 'all' || p.program_id === filterProgram
    return matchesSearch && matchesStatus && matchesProgram
  })

  const activeCount = filteredParticipants.filter(p => p.status === 'active').length
  const totalMonthlyPlanned = filteredParticipants
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.tariff || p.program?.price_per_month || 0), 0)
  const overdueCount = filteredParticipants.filter(p => summaries.get(p.id)?.overdue).length
  const partialCount = filteredParticipants.filter(p => summaries.get(p.id)?.partial).length
  const visibleCollected = filteredParticipants.reduce((sum, p) => sum + (summaries.get(p.id)?.collected ?? 0), 0)

  const pageRows = filteredParticipants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filtersActive = !!query || filterStatus !== 'all' || filterProgram !== 'all'
  const resetFilters = () => {
    setQuery('')
    setFilterStatus('all')
    setFilterProgram('all')
  }

  const detail = participants.find(p => p.id === detailId) ?? null

  // ---------- Actions ----------
  const openPayment = async (participant: Participant, month: number, year: number) => {
    setPayPreset({ participantId: participant.id, month, year })
    if (!accounts) {
      try {
        const res = await fetch('/api/accounts').then(r => r.json())
        setAccounts(Array.isArray(res) ? res : [])
      } catch {
        setAccounts([])
      }
    }
    setPayOpen(true)
  }

  /** Bulk: create the missing schedule months of every active participant. */
  const generateSchedules = async () => {
    setScheduling(true)
    try {
      const preview = await fetch('/api/payments/schedule').then(r => r.json())
      if (preview.error) throw new Error(preview.error)
      const todo = (preview.participants as any[]).filter(p => p.created > 0)
      const noData = (preview.participants as any[]).filter(p => p.reason)
      if (!todo.length) {
        toast.success('Графики уже полные', {
          description: noData.length
            ? `Без даты начала, длительности или тарифа: ${noData.length} ${participantsWord(noData.length)}`
            : 'У всех активных участников есть все месяцы программы',
        })
        return
      }
      const ok = await confirm({
        title: 'Сформировать графики оплат?',
        description: `Будет создано ${formatNumber(preview.created)} ${plural(preview.created, ['строка', 'строки', 'строк'])} графика для ${formatNumber(todo.length)} ${participantsWord(todo.length)}: недостающие месяцы от даты начала на срок программы, план — тариф участника. Уже внесённые месяцы и оплаты не изменятся.${
          noData.length ? ` Пропустим ${noData.length} ${participantsWord(noData.length)} без даты начала, длительности или тарифа.` : ''
        }`,
        confirmText: `Создать ${formatNumber(preview.created)}`,
      })
      if (!ok) return
      const res = await fetch('/api/payments/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: todo.map(p => p.id) }),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      if (res.failed) toast.error('Графики сформированы не для всех', { description: `Создано ${res.created}, с ошибкой ${res.failed} ${participantsWord(res.failed)}` })
      else toast.success('Графики сформированы', { description: `Создано ${formatNumber(res.created)} ${plural(res.created, ['строка', 'строки', 'строк'])}` })
      fetchData()
    } catch (err: any) {
      toast.error('Не удалось сформировать графики', { description: err.message })
    } finally {
      setScheduling(false)
    }
  }

  const handleSaved = (saved: Participant, mode: 'create' | 'update') => {
    if (mode === 'create') setParticipants(list => [saved, ...list])
    else setParticipants(list => list.map(p => (p.id === saved.id ? saved : p)))
  }

  const handleArchive = async (participant: Participant) => {
    const ok = await confirm({
      title: 'Перевести в архив?',
      description: `${participant.name} перестанет считаться активным участником. История платежей сохранится.`,
      confirmText: 'В архив',
    })
    if (!ok) return

    try {
      const response = await fetch('/api/participants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: participant.id, status: 'archived' }),
      })
      const result = await response.json()
      if (result.error) throw new Error(result.error)

      if (result.data && result.data[0]) {
        setParticipants(list => list.map(p => (p.id === participant.id ? result.data[0] : p)))
      }
      toast.success('Участник в архиве', { description: participant.name })
    } catch (err: any) {
      toast.error('Не удалось перевести в архив', { description: err.message })
    }
  }

  const handleDelete = async (participant: Participant) => {
    const ok = await confirm({
      title: `Удалить участника «${participant.name}»?`,
      description: 'Данные участника и все его платежи будут удалены навсегда. Если человек просто закончил обучение, лучше перевести его в архив.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch('/api/participants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: participant.id }),
      })
      const result = await response.json()
      if (result.error) throw new Error(result.error)

      setParticipants(list => list.filter(p => p.id !== participant.id))
      if (detailId === participant.id) setDetailOpen(false)
      toast.success('Участник удалён', { description: participant.name })
    } catch (err: any) {
      toast.error('Не удалось удалить участника', { description: err.message })
    }
  }

  // ---------- Render ----------
  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Участники" />
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить участников"
            description={error}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  setError(null)
                  fetchData()
                }}
              >
                Повторить
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const participantsWord = (n: number) => plural(n, ['участник', 'участника', 'участников'])

  return (
    <PageContainer>
      <PageHeader
        title="Участники"
        description="Кто учится, по какому тарифу и как платит"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={generateSchedules} disabled={scheduling || loading}>
              <CalendarPlus /> {scheduling ? 'Считаем…' : 'Сформировать графики'}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus /> Новый участник
            </Button>
          </>
        }
      />

      <StatStrip
        loading={loading}
        className="mb-6 grid-cols-2"
        stats={[
          {
            label: 'Активных участников',
            value: formatNumber(activeCount),
            sub: `из ${formatNumber(filteredParticipants.length)} в списке`,
          },
          {
            label: 'Плановый доход в месяц',
            value: formatMoney(totalMonthlyPlanned),
            sub: 'по тарифам активных',
          },
          {
            label: 'С просрочкой',
            value: formatNumber(overdueCount),
            tone: overdueCount ? 'destructive' : 'default',
            sub: filterStatus === 'overdue' ? 'Фильтр включён' : 'Показать только их',
            onClick: () => setFilterStatus(s => (s === 'overdue' ? 'all' : 'overdue')),
          },
          {
            label: 'С недоплатой',
            value: formatNumber(partialCount),
            tone: partialCount ? 'warning' : 'default',
            sub: filterStatus === 'partial' ? 'Фильтр включён' : 'Показать только их',
            onClick: () => setFilterStatus(s => (s === 'partial' ? 'all' : 'partial')),
          },
        ]}
      />

      {loading ? (
        <TableSkeleton />
      ) : (
        <Panel>
          <PanelToolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="Имя, телефон или email" className="sm:w-72" />
            <Select value={filterStatus} onValueChange={v => setFilterStatus(v as PaymentFilter)}>
              <SelectTrigger size="sm" className="min-w-40 max-sm:flex-1" aria-label="Оплата">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProgram} onValueChange={setFilterProgram}>
              <SelectTrigger size="sm" className="min-w-40 max-sm:flex-1" aria-label="Программа">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все программы</SelectItem>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtersActive && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={resetFilters}>
                Сбросить
              </Button>
            )}
            <div className="ml-auto">
              <ExportButton
                empty={filteredParticipants.length === 0}
                onExport={() =>
                  exportToExcel({
                    filename: 'Участники',
                    rows: filteredParticipants,
                    totals: { sum: ['Собрано, USD', 'Долг, USD'] },
                    columns: [
                      { header: 'Участник', value: p => p.name },
                      { header: 'Программа', value: p => p.program?.name ?? '' },
                      { header: 'Телефон', value: p => p.phone ?? '' },
                      { header: 'Email', value: p => p.email ?? '' },
                      { header: 'Дата начала', value: p => p.start_date ?? '', type: 'date' },
                      { header: 'Статус', value: p => p.status ?? '' },
                      { header: 'Тариф, USD', value: p => p.tariff ?? p.program?.price_per_month ?? 0, type: 'money' },
                      { header: 'Оплачено месяцев', value: p => summaries.get(p.id)?.paidCount ?? 0, type: 'number' },
                      { header: 'Собрано, USD', value: p => summaries.get(p.id)?.collected ?? 0, type: 'money' },
                      { header: 'Долг, USD', value: p => summaries.get(p.id)?.overdueDebt ?? 0, type: 'money' },
                    ],
                  })
                }
              />
            </div>
          </PanelToolbar>

          {filteredParticipants.length === 0 ? (
            participants.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Участников пока нет"
                description="Добавьте первого участника, чтобы отслеживать его оплаты"
                action={
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> Новый участник
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="Никого не нашли"
                description="Измените поиск или фильтры"
                action={
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    Сбросить фильтры
                  </Button>
                }
              />
            )
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Участник</TableHead>
                    <TableHead className="text-right max-md:hidden">Тариф</TableHead>
                    <TableHead className="w-40 max-sm:hidden">Платежи</TableHead>
                    <TableHead className="text-right">Собрано</TableHead>
                    <TableHead className="max-sm:hidden">Оплата</TableHead>
                    <TableHead className="max-lg:hidden">Статус</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(p => {
                    const s = summaries.get(p.id)
                    return (
                      <TableRow
                        key={p.id}
                        tabIndex={0}
                        className="group cursor-pointer outline-none focus-visible:bg-accent"
                        onClick={() => openDetail(p)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && e.target === e.currentTarget) openDetail(p)
                        }}
                      >
                        <TableCell className="max-w-72">
                          <div className="truncate font-medium">{p.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.program?.name || 'Программа не указана'}
                          </div>
                          {s && <PaymentBadges summary={s} className="mt-1 sm:hidden" />}
                        </TableCell>
                        <TableCell className="text-right max-md:hidden">
                          <span className="num">{formatMoney(monthlyTariff(p))}</span>
                        </TableCell>
                        <TableCell className="max-sm:hidden">{progress.get(p.id) && <PaymentsProgress {...progress.get(p.id)!} />}</TableCell>
                        <TableCell className="num text-right font-medium">{formatMoney(s?.collected ?? 0)}</TableCell>
                        <TableCell className="max-sm:hidden">
                          {s && <PaymentBadges summary={s} empty={<span className="text-muted-foreground">—</span>} />}
                        </TableCell>
                        <TableCell className="max-lg:hidden">
                          <Badge variant={PARTICIPANT_STATUS[p.status]?.variant ?? 'secondary'}>
                            {PARTICIPANT_STATUS[p.status]?.label ?? p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className={rowActionsCls}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label="Действия" className="text-muted-foreground">
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openEdit(p)}>
                                  <Pencil /> Изменить
                                </DropdownMenuItem>
                                {p.status !== 'archived' && (
                                  <DropdownMenuItem onSelect={() => handleArchive(p)}>
                                    <Archive /> В архив
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => handleDelete(p)}>
                                  <Trash2 /> Удалить
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <TotalsBar
                label={`${formatNumber(filteredParticipants.length)} ${participantsWord(filteredParticipants.length)}${
                  filtersActive ? ` из ${formatNumber(participants.length)}` : ''
                } · собрано`}
                value={formatMoney(visibleCollected)}
              />
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filteredParticipants.length} onPageChange={setPage} />
            </>
          )}
        </Panel>
      )}

      <ParticipantDetailSheet
        open={detailOpen}
        participant={detail}
        payments={(detail && paymentsBy.get(detail.id)) || NO_PAYMENTS}
        summary={(detail && summaries.get(detail.id)) || null}
        onOpenChange={setDetailOpen}
        onEdit={openEdit}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onAddPayment={openPayment}
        onChanged={fetchData}
      />

      <PaymentSheet
        open={payOpen}
        onOpenChange={setPayOpen}
        participants={participants}
        accounts={accounts ?? []}
        preset={payPreset}
        onSaved={fetchData}
      />

      <ParticipantFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        programs={programs}
        onSaved={handleSaved}
      />
    </PageContainer>
  )
}

function PaymentBadges({
  summary,
  className,
  empty = null,
}: {
  summary: ParticipantSummary
  className?: string
  empty?: React.ReactNode
}) {
  if (!summary.overdue && !summary.partial && !summary.paidThisMonth) return <>{empty}</>
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {summary.overdue && <Badge variant="destructive">Просрочено</Badge>}
      {summary.partial && <Badge variant="warning">Частично</Badge>}
      {summary.paidThisMonth && <Badge variant="success">Оплачен месяц</Badge>}
    </div>
  )
}

function PaymentsProgress({ paid: paidCount, scheduled: totalCount }: { paid: number; scheduled: number }) {
  if (!totalCount) return <span className="text-xs text-muted-foreground">Нет графика</span>
  const pct = Math.min(100, Math.round((paidCount / totalCount) * 100))
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-200', pct === 100 ? 'bg-success' : 'bg-success/70')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="num shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{paidCount}</span>/{totalCount}
      </span>
    </div>
  )
}
