'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Check, ChevronRight, Radar, RotateCcw, Target, WalletCards } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, MONTHS_RU, plural, todayISO } from '@/lib/format'
import {
  daysBetween,
  effectiveDue,
  focusTasks,
  isOverdue,
  relativeDue,
  shortDate,
  sprintProgress,
  type MySprintData,
  type MyTask,
} from '@/lib/sprints'
import { Skeleton } from '@/components/ui/skeleton'
import { useNav } from '@/components/app-shell/nav-context'
import { TelegramLinkCard } from '@/components/telegram/telegram-link-card'
import { ProfilePrompt } from './profile-prompt'
import { NextLessonCard } from './next-lesson'
import { LessonsCalendarSection } from './lessons-calendar-section'
import { api } from '@/components/sprints/shared'
import { buildView, useMyPayments } from './my-payments-page'

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const warnText = 'text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]'

function greeting(hour: number) {
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function MyTodayPage({ participantId, participantName }: { participantId: string | null; participantName: string | null }) {
  const { navigate } = useNav()
  const today = todayISO()
  const now = new Date()
  const [sprint, setSprint] = React.useState<MySprintData | null>(null)
  const [sprintUnavailable, setSprintUnavailable] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const pay = useMyPayments(participantId)

  const load = React.useCallback(async () => {
    if (!participantId) return
    try {
      const r = await api<{ data: MySprintData }>(`/api/my-sprint?participant_id=${participantId}`)
      setSprint(r.data)
      setSprintUnavailable(false)
    } catch {
      // Migration not applied or the server is down: the rest of the page still works.
      setSprintUnavailable(true)
    }
  }, [participantId])

  React.useEffect(() => {
    load()
  }, [load])

  const schedule = React.useMemo(
    () => (pay.participant ? buildView(pay.participant, pay.program, pay.payments, pay.receipts) : null),
    [pay.participant, pay.program, pay.payments, pay.receipts]
  )

  const tasks = sprint?.tasks ?? []
  const current = sprint?.current ?? null
  const focus = focusTasks(tasks, today, 3)
  const done = tasks.filter(t => t.assignment.status === 'done').length
  const waiting = tasks.filter(t => t.assignment.status === 'review').length

  const toggleMark = async (t: MyTask) => {
    if (!participantId) return
    setBusy(t.assignment.id)
    try {
      await api(`/api/sprints/assignments/${t.assignment.id}`, {
        method: 'POST',
        json: { type: t.assignment.status === 'todo' ? 'mark' : 'unmark', participant_id: participantId },
      })
      await load()
    } catch (e) {
      toast.error('Не получилось', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-5 pb-8 sm:pt-8">
      <header className="px-1">
        <p className="text-sm text-muted-foreground">
          {WEEKDAYS[now.getDay()][0].toUpperCase() + WEEKDAYS[now.getDay()].slice(1)}, {now.getDate()} {MONTHS_GEN[now.getMonth()]}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight sm:text-3xl">
          {greeting(now.getHours())}
        </h1>
      </header>

      {participantId && <NextLessonCard participantId={participantId} />}

      {/* Sprint */}
      {!sprint && !sprintUnavailable ? (
        <Skeleton className="h-44 w-full rounded-3xl" />
      ) : current ? (
        <SprintHero
          title={current.title}
          number={current.number}
          total={sprint!.sprints.length}
          day={sprintProgress(current, today)}
          done={done}
          count={tasks.length}
          waiting={waiting}
          onOpen={() => navigate('my-sprint')}
        />
      ) : (
        <section className="pt-glow-card p-5">
          <p className="text-sm font-semibold text-primary">{sprint?.program?.name ?? 'Программа'}</p>
          <p className="mt-1 text-xl font-bold tracking-tight">Спринты скоро начнутся</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Куратор поставит цель и задачи к старту. Подключите Telegram, и мы сразу напишем, когда они появятся.
          </p>
        </section>
      )}

      {/* Main things today */}
      {current && (
        <section>
          <SectionHeader title="Главное сегодня" action={tasks.length ? { label: 'Все задачи', onClick: () => navigate('my-sprint') } : undefined} />
          {focus.items.length ? (
            <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              {focus.items.map(t => (
                <FocusRow key={t.assignment.id} t={t} today={today} busy={busy === t.assignment.id} onToggle={() => toggleMark(t)} onOpen={() => navigate('my-sprint')} />
              ))}
              {focus.rest > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => navigate('my-sprint')}
                    className="flex min-h-12 w-full items-center justify-between border-t px-4 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  >
                    Ещё {focus.rest} {plural(focus.rest, ['задача', 'задачи', 'задач'])}
                    <ChevronRight className="size-4" />
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed px-6 py-7 text-center text-sm text-muted-foreground">
              {tasks.length ? (waiting ? 'Всё сдано, куратор проверяет отчёты' : 'Все задачи сданы. Можно выдохнуть') : 'В этом спринте у вас пока нет задач'}
            </p>
          )}
        </section>
      )}

      {/* This week */}
      <section>
        <SectionHeader title="Ещё важное" />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate('my-payments')}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 active:scale-[0.985]"
          >
            <span className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <WalletCards className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </span>
            <PaymentLine loading={pay.loading} error={!!pay.error} schedule={schedule} />
          </button>
          <button
            type="button"
            onClick={() => navigate('life-wheel')}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 active:scale-[0.985]"
          >
            <span className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Radar className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </span>
            <span>
              <span className="block font-semibold">Колёса</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">Внимание, жизнь и бизнес</span>
            </span>
          </button>
        </div>
      </section>

      {/* Path */}
      {sprint && sprint.sprints.length > 0 && (
        <section>
          <SectionHeader title="Мой путь" action={{ label: 'Все спринты', onClick: () => navigate('my-sprint') }} />
          <div className="rounded-2xl border bg-card p-4 shadow-xs">
            <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${sprint.sprints.length}, minmax(0, 1fr))` }} aria-hidden>
              {sprint.sprints.map(s => (
                <span
                  key={s.id}
                  className={cn('h-2 rounded', s.id === current?.id ? 'bg-primary' : s.end_date < today ? 'bg-success' : 'bg-muted')}
                />
              ))}
            </div>
            <p className="num mt-3 text-sm text-muted-foreground">
              Спринт {current?.number} из {sprint.sprints.length}
              {(() => {
                const past = sprint.sprints.filter(s => s.end_date < today && s.total)
                const t = past.reduce((a, s) => a + s.total, 0)
                const d = past.reduce((a, s) => a + s.done, 0)
                return t ? ` · за прошлые сдано ${d} из ${t}` : ''
              })()}
            </p>
          </div>
        </section>
      )}

      {participantId && <LessonsCalendarSection participantId={participantId} />}

      {participantId && <ProfilePrompt participantId={participantId} />}

      {participantId && !sprintUnavailable && (
        <TelegramLinkCard participantId={participantId} participantName={participantName} />
      )}
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between px-1">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {action && (
        <button type="button" onClick={action.onClick} className="-my-2 rounded-md py-2 text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
          {action.label}
        </button>
      )}
    </div>
  )
}

function SprintHero({
  title,
  number,
  total,
  day,
  done,
  count,
  waiting,
  onOpen,
}: {
  title: string
  number: number
  total: number
  day: ReturnType<typeof sprintProgress>
  done: number
  count: number
  waiting: number
  onOpen: () => void
}) {
  const c = 97.4
  const value = count ? done / count : 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 text-left transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.985]"
    >
      {/* the landing's green glow */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(112_170_46/0.6),transparent)] blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(112_170_46/0.22),transparent)] blur-2xl" />
      <span className="relative flex items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <Target className="size-4" strokeWidth={2.25} />
          Спринт {number} из {total}
        </span>
        <span className="num inline-flex h-7 items-center rounded-full border border-primary/40 bg-primary/10 px-3 text-[12.5px] font-semibold text-primary">
          {!day.started ? 'скоро старт' : day.finished ? 'завершён' : `осталось ${day.left} ${plural(day.left, ['день', 'дня', 'дней'])}`}
        </span>
      </span>
      <span className="relative mt-3 block text-[24px] leading-[1.15] font-bold tracking-tight">{title}</span>
      <span className="relative mt-5 flex items-center gap-4">
        <span className="relative inline-flex size-[68px] shrink-0">
          <svg viewBox="0 0 36 36" className="size-[68px] -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--primary)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(value * c).toFixed(1)} ${c}`} />
          </svg>
          <span className="num absolute inset-0 flex items-center justify-center text-[15px] font-bold">
            {done}/{count}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">
            {count ? `${done} из ${count} сдано` : 'Задач пока нет'}
          </span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
            {waiting ? `${waiting} ${plural(waiting, ['отчёт', 'отчёта', 'отчётов'])} на проверке у куратора` : done === count && count ? 'Всё сдано' : 'Откройте спринт, чтобы увидеть задачи'}
          </span>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-active:rotate-45">
          <ArrowUpRight className="size-5" strokeWidth={2.25} />
        </span>
      </span>
    </button>
  )
}

function FocusRow({
  t,
  today,
  busy,
  onToggle,
  onOpen,
}: {
  t: MyTask
  today: string
  busy: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { task, assignment: a } = t
  const due = effectiveDue(task, a)
  const overdue = isOverdue(task, a, today)
  const rework = a.status === 'rework'
  const canTick = task.submission_type === 'mark' && !rework
  const soon = due ? daysBetween(today, due) <= 2 : false

  const chip = rework
    ? { text: due ? `Исправить до ${shortDate(due)}` : 'Исправить', cls: cn('bg-warning-soft', warnText) }
    : overdue
      ? { text: `Срок был ${shortDate(due)}`, cls: 'bg-destructive-soft text-destructive' }
      : due
        ? { text: relativeDue(due, today), cls: soon ? cn('bg-warning-soft', warnText) : 'bg-muted text-muted-foreground' }
        : null

  return (
    <li className="flex min-h-[68px] items-center gap-3.5 border-b py-3 pr-3 pl-4 last:border-b-0">
      {canTick ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label={`Отметить выполненной: ${task.title}`}
          disabled={busy}
          onClick={onToggle}
          className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
        >
          <span className="flex size-[34px] items-center justify-center rounded-full border-2 border-muted-foreground/60 transition-colors hover:border-success">
            {busy && <Check className="size-4 text-success" strokeWidth={3} />}
          </span>
        </button>
      ) : (
        <span aria-hidden className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[10px]', rework ? cn('bg-warning-soft', warnText) : 'bg-muted text-muted-foreground')}>
          {rework ? <RotateCcw className="size-4" /> : <Target className="size-4" />}
        </span>
      )}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium">{task.title}</span>
          {chip && <span className={cn('mt-1 inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium', chip.cls)}>{chip.text}</span>}
        </span>
        <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

function PaymentLine({ loading, error, schedule }: { loading: boolean; error: boolean; schedule: ReturnType<typeof buildView> | null }) {
  if (loading) return <Skeleton className="h-10 w-full" />
  if (error || !schedule) {
    return (
      <span>
        <span className="block font-semibold">Оплата</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">График платежей</span>
      </span>
    )
  }
  if (schedule.debt > 0) {
    return (
      <span>
        <span className="block font-semibold">Долг {formatMoney(schedule.debt)}</span>
        <span className="mt-0.5 block text-[13px] text-destructive">
          за {schedule.debtMonths} {plural(schedule.debtMonths, ['месяц', 'месяца', 'месяцев'])}
        </span>
      </span>
    )
  }
  if (schedule.next && schedule.next.remaining > 0) {
    return (
      <span>
        <span className="block font-semibold">{formatMoney(schedule.next.remaining)}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">
          {schedule.next.isCurrent ? 'осталось за ' : 'к оплате за '}
          {MONTHS_RU[schedule.next.month - 1].toLowerCase()}
        </span>
      </span>
    )
  }
  return (
    <span>
      <span className="block font-semibold">Долга нет</span>
      <span className="mt-0.5 block text-[13px] text-muted-foreground">Все месяцы оплачены</span>
    </span>
  )
}
