'use client'

import { TelegramLinkCard } from '@/components/telegram/telegram-link-card'
import * as React from 'react'
import { CalendarCheck2, Inbox, MessageCircleQuestion, RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatDate, formatMoney, MONTHS_RU, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { EmptyState } from '@/components/erp/empty-state'
import { TotalsBar } from '@/components/erp/table-parts'

// ---------- Data ----------

interface ProgramInfo {
  id: string
  name: string
  price_per_month: number | null
  duration_months: number | null
}

interface ParticipantInfo {
  id: string
  name: string
  start_date: string | null
  status: string
  tariff: number | null
  program_id: string | null
  program?: ProgramInfo | null
}

interface PaymentRow {
  id: string
  participant_id: string
  month_number: number
  year: number
  plan_amount: number | null
  amount?: number | null
  fact_amount: number | null
  status: string
  paid_date: string | null
  notes: string | null
  currency?: string | null
  original_amount?: number | null
  participant?: ParticipantInfo | null
  program?: ProgramInfo | null
}

type MonthStatus = 'paid' | 'overdue' | 'partial' | 'due' | 'upcoming'

const STATUS: Record<MonthStatus, { label: string; variant: 'success' | 'destructive' | 'warning' | 'info' | 'secondary' }> = {
  paid: { label: 'Оплачено', variant: 'success' },
  overdue: { label: 'Просрочено', variant: 'destructive' },
  partial: { label: 'Частично', variant: 'warning' },
  due: { label: 'К оплате', variant: 'info' },
  upcoming: { label: 'Ожидается', variant: 'secondary' },
}

interface ScheduleMonth {
  idx: number
  month: number
  year: number
  plan: number
  fact: number
  status: MonthStatus
  paidDate: string | null
  notes: string | null
  original: { amount: number; currency: string } | null
  isCurrent: boolean
}

const EPS = 0.01
const monthIdx = (year: number, month: number) => year * 12 + (month - 1)
const monthName = (m: number, y: number) => `${MONTHS_RU[m - 1]} ${y}`

function buildSchedule(participant: ParticipantInfo, program: ProgramInfo | null, payments: PaymentRow[]) {
  const now = new Date()
  const currentIdx = monthIdx(now.getFullYear(), now.getMonth() + 1)
  const tariff = Number(participant.tariff) || Number(program?.price_per_month) || 0
  const duration = Number(program?.duration_months) || 0

  const byIdx = new Map<number, PaymentRow>()
  for (const p of payments) byIdx.set(monthIdx(p.year, p.month_number), p)

  const start = participant.start_date ? new Date(participant.start_date) : null
  const startIdx =
    start && !Number.isNaN(start.getTime())
      ? monthIdx(start.getFullYear(), start.getMonth() + 1)
      : payments.length
        ? Math.min(...byIdx.keys())
        : currentIdx
  const endIdx = duration > 0 ? startIdx + duration - 1 : Math.max(currentIdx, ...byIdx.keys())

  // Program months, plus any recorded payment outside them
  const indices = new Set<number>()
  for (let i = startIdx; i <= endIdx; i++) indices.add(i)
  for (const i of byIdx.keys()) indices.add(i)

  const months: ScheduleMonth[] = [...indices]
    .sort((a, b) => a - b)
    .map(idx => {
      const pay = byIdx.get(idx)
      const inProgram = idx >= startIdx && idx <= endIdx
      const plan = Number(pay?.plan_amount) || Number(pay?.amount) || (inProgram ? tariff : 0)
      const fact = Number(pay?.fact_amount) || 0
      let status: MonthStatus
      if (plan > 0 ? fact >= plan - EPS : fact > 0) status = 'paid'
      else if (idx < currentIdx) status = fact > 0 ? 'partial' : 'overdue'
      else if (idx === currentIdx) status = fact > 0 ? 'partial' : 'due'
      else status = fact > 0 ? 'partial' : 'upcoming'
      const original =
        pay?.currency && pay.currency !== 'USD' && Number(pay.original_amount) > 0
          ? { amount: Number(pay.original_amount), currency: pay.currency }
          : null
      return {
        idx,
        month: (idx % 12) + 1,
        year: Math.floor(idx / 12),
        plan,
        fact,
        status,
        paidDate: pay?.paid_date ?? null,
        notes: pay?.notes?.trim() || null,
        original,
        isCurrent: idx === currentIdx,
      }
    })

  const totalPaid = months.reduce((s, m) => s + m.fact, 0)
  const totalPlan = months.reduce((s, m) => s + m.plan, 0)
  const debt = months
    .filter(m => m.idx < currentIdx)
    .reduce((s, m) => s + Math.max(0, m.plan - m.fact), 0)
  const debtMonths = months.filter(m => m.idx < currentIdx && m.plan - m.fact > EPS).length
  const next = months.find(m => m.idx >= currentIdx && m.plan - m.fact > EPS) ?? null

  return {
    months,
    tariff,
    duration,
    startIdx,
    endIdx,
    totalPaid,
    totalPlan,
    debt: debt > EPS ? debt : 0,
    debtMonths,
    next,
  }
}

async function getJSON(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal })
  const json = await res.json()
  if (!res.ok || json?.error) throw new Error(json?.error || `Ошибка ${res.status}`)
  return json
}

function useMyPayments(participantId: string | null) {
  const [state, setState] = React.useState<{
    loading: boolean
    error: string | null
    participant: ParticipantInfo | null
    program: ProgramInfo | null
    payments: PaymentRow[]
  }>({ loading: !!participantId, error: null, participant: null, program: null, payments: [] })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!participantId) return
    const ctrl = new AbortController()
    setState(s => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        const id = encodeURIComponent(participantId)
        const pays = await getJSON(`/api/monthly-payments?participant_id=${id}`, ctrl.signal)
        const payments: PaymentRow[] = (pays.data ?? []).filter((p: PaymentRow) => p.participant_id === participantId)

        // The payments already carry the participant and program; the full
        // participant list is only needed for someone without payments yet.
        let participant: ParticipantInfo | null = payments[0]?.participant ?? null
        let program: ProgramInfo | null = null
        if (participant) {
          program =
            payments.find(p => p.program?.id === participant!.program_id)?.program ?? payments[0]?.program ?? null
        } else {
          const all = await getJSON(`/api/participants?id=${id}`, ctrl.signal)
          const found = (all.data ?? []).find((p: ParticipantInfo) => p.id === participantId) ?? null
          participant = found
          program = found?.program ?? null
        }
        setState({ loading: false, error: null, participant, program, payments })
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setState(s => ({ ...s, loading: false, error: err.message || 'Не удалось загрузить данные' }))
      }
    })()
    return () => ctrl.abort()
  }, [participantId, attempt])

  return { ...state, retry: () => setAttempt(a => a + 1) }
}

// ---------- Page ----------

export function MyPaymentsPage({ participantId, participantName }: { participantId: string | null; participantName: string | null }) {
  const { loading, error, participant, program, payments, retry } = useMyPayments(participantId)
  const firstName = (participant?.name || participantName || '').trim().split(/\s+/)[0]
  const greeting = firstName ? `${firstName}, здесь ваш график платежей и всё, что уже оплачено` : 'Ваш график платежей и всё, что уже оплачено'

  if (!participantId) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Мои оплаты" />
        <Panel>
          <EmptyState
            icon={MessageCircleQuestion}
            title="Профиль участника не подключён"
            description="Ваш вход пока не связан с карточкой участника. Напишите менеджеру программы, и он подключит её, чтобы здесь появились ваши платежи."
          />
        </Panel>
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Мои оплаты" description={greeting} />
        <Panel>
          <EmptyState
            icon={Inbox}
            title="Не удалось загрузить оплаты"
            description="Проверьте интернет и попробуйте ещё раз."
            action={
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw /> Повторить
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  if (loading) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Мои оплаты" description={greeting} />
        <Panel className="mb-4 p-4 sm:p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </Panel>
        <StatStrip loading className="mb-6" stats={[{ label: 'Оплачено', value: '' }, { label: 'Долг', value: '' }, { label: 'Следующий платёж', value: '' }]} />
        <Panel>
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </div>
        </Panel>
      </PageContainer>
    )
  }

  if (!participant) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Мои оплаты" />
        <Panel>
          <EmptyState
            icon={MessageCircleQuestion}
            title="Не нашли вашу карточку участника"
            description="Возможно, её ещё не создали или она была изменена. Напишите менеджеру программы, он всё проверит."
          />
        </Panel>
      </PageContainer>
    )
  }

  return <MyPaymentsView participant={participant} program={program} payments={payments} greeting={greeting} />
}

function MyPaymentsView({
  participant,
  program,
  payments,
  greeting,
}: {
  participant: ParticipantInfo
  program: ProgramInfo | null
  payments: PaymentRow[]
  greeting: string
}) {
  const s = React.useMemo(() => buildSchedule(participant, program, payments), [participant, program, payments])
  const pct = s.totalPlan > 0 ? Math.min(100, Math.round((s.totalPaid / s.totalPlan) * 100)) : 0
  const paidMonths = s.months.filter(m => m.status === 'paid').length
  const finished = participant.status === 'completed' || participant.status === 'archived'

  const nextRemaining = s.next ? s.next.plan - s.next.fact : 0

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Мои оплаты" description={greeting} />
      <div className="mb-4">
        <TelegramLinkCard participantId={participant.id} participantName={participant.name} />
      </div>

      {/* Program and tariff */}
      <Panel className="mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Программа</p>
            <p className="mt-0.5 text-base font-semibold tracking-tight sm:text-lg">{program?.name || 'Программа не указана'}</p>
          </div>
          {finished && <Badge variant="secondary">{participant.status === 'completed' ? 'Обучение завершено' : 'В архиве'}</Badge>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Тариф</dt>
            <dd className="num mt-0.5 font-medium">{s.tariff ? `${formatMoney(s.tariff)} в месяц` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Срок</dt>
            <dd className="mt-0.5 font-medium">
              {s.duration ? `${s.duration} ${plural(s.duration, ['месяц', 'месяца', 'месяцев'])}` : '—'}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-muted-foreground">Период</dt>
            <dd className="mt-0.5 font-medium">
              {MONTHS_RU[s.startIdx % 12].toLowerCase()} {Math.floor(s.startIdx / 12)} — {MONTHS_RU[s.endIdx % 12].toLowerCase()}{' '}
              {Math.floor(s.endIdx / 12)}
            </dd>
          </div>
        </dl>
        {s.totalPlan > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Оплачено <span className="num font-medium text-foreground">{formatMoney(s.totalPaid)}</span> из{' '}
                <span className="num">{formatMoney(s.totalPlan)}</span>
              </span>
              <span className="num">{pct}%</span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Оплачено от стоимости программы"
            >
              <div className="h-full rounded-full bg-success transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </Panel>

      <StatStrip
        className="mb-6"
        stats={[
          {
            label: 'Оплачено',
            value: formatMoney(s.totalPaid),
            sub: paidMonths
              ? `${paidMonths} ${plural(paidMonths, ['месяц', 'месяца', 'месяцев'])} полностью`
              : 'Полностью оплаченных месяцев пока нет',
          },
          {
            label: 'Текущий долг',
            value: s.debt ? formatMoney(s.debt) : 'Нет',
            tone: s.debt ? 'destructive' : 'success',
            sub: s.debt
              ? `за ${s.debtMonths} ${plural(s.debtMonths, ['месяц', 'месяца', 'месяцев'])}`
              : 'Все прошлые месяцы оплачены',
          },
          {
            label: 'Следующий платёж',
            value: s.next ? formatMoney(nextRemaining) : '—',
            sub: s.next
              ? `${s.next.isCurrent ? 'в этом месяце, ' : ''}${monthName(s.next.month, s.next.year).toLowerCase()}`
              : s.debt
                ? 'Новых начислений нет, остался только долг'
                : 'Программа полностью оплачена',
          },
        ]}
      />

      <h2 className="mb-2 text-sm font-semibold">График платежей</h2>
      {s.months.length === 0 ? (
        <Panel>
          <EmptyState
            icon={CalendarCheck2}
            title="График пока пуст"
            description="Когда менеджер укажет дату начала обучения, здесь появятся месяцы и суммы."
          />
        </Panel>
      ) : (
        <Panel>
          {/* Phones: a simple list */}
          <ul className="divide-y sm:hidden">
            {s.months.map(m => (
              <li key={m.idx} className={cn('px-4 py-3', m.isCurrent && 'bg-primary-soft/40')}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 font-medium">
                    {monthName(m.month, m.year)}
                    {m.isCurrent && <span className="ml-1.5 text-xs font-normal text-muted-foreground">сейчас</span>}
                  </p>
                  <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
                </div>
                <p className="num mt-1 text-sm text-muted-foreground">
                  <span className={cn('font-medium', m.fact > 0 ? 'text-foreground' : '')}>{formatMoney(m.fact)}</span> из{' '}
                  {formatMoney(m.plan)}
                  {m.paidDate && m.fact > 0 && <span> · {formatDate(m.paidDate)}</span>}
                </p>
                {m.status !== 'paid' && m.fact > 0 && (
                  <p className="num mt-0.5 text-xs text-muted-foreground">Осталось {formatMoney(m.plan - m.fact)}</p>
                )}
                {m.notes && <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>}
              </li>
            ))}
          </ul>

          {/* Wider screens: a table */}
          <Table className="max-sm:hidden">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Месяц</TableHead>
                <TableHead className="text-right">План</TableHead>
                <TableHead className="text-right">Оплачено</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="max-md:hidden">Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.months.map(m => (
                <TableRow key={m.idx} className={cn('hover:bg-transparent', m.isCurrent && 'bg-primary-soft/40 hover:bg-primary-soft/40')}>
                  <TableCell className="font-medium">
                    {monthName(m.month, m.year)}
                    {m.isCurrent && <span className="ml-1.5 text-xs font-normal text-muted-foreground">сейчас</span>}
                  </TableCell>
                  <TableCell className="num text-right">{formatMoney(m.plan)}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn('num', m.fact > 0 ? 'font-medium' : 'text-muted-foreground')}>{formatMoney(m.fact)}</span>
                    {(m.paidDate && m.fact > 0) || m.original ? (
                      <span className="num block text-xs text-muted-foreground">
                        {[m.original && formatMoney(m.original.amount, m.original.currency), m.paidDate && m.fact > 0 && formatDate(m.paidDate)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
                    {m.status !== 'paid' && m.fact > 0 && (
                      <span className="num mt-0.5 block text-xs text-muted-foreground">осталось {formatMoney(m.plan - m.fact)}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 text-sm text-muted-foreground max-md:hidden">
                    <span className="line-clamp-2">{m.notes || '—'}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TotalsBar label={`оплачено из ${formatMoney(s.totalPlan)}`} value={formatMoney(s.totalPaid)} />
        </Panel>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Суммы указаны в долларах. Если что-то не сходится, напишите менеджеру программы.
      </p>
    </PageContainer>
  )
}
