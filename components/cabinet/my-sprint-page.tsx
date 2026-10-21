'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, ChevronRight, Clock, FileText, Flag, Link2, MessageCircleQuestion, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural, todayISO } from '@/lib/format'
import {
  STATUS,
  SUBMISSION,
  addDays,
  dateRange,
  daysBetween,
  effectiveDue,
  isOverdue,
  relativeDue,
  shortDate,
  sprintProgress,
  type MySprintData,
  type MyTask,
} from '@/lib/sprints'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '@/components/erp/empty-state'
import { MigrationRequired, api } from '@/components/sprints/shared'
import { FileChips, FileUploader, useReportFiles } from '@/components/sprints/report-files'
import { TelegramLinkCard } from '@/components/telegram/telegram-link-card'

type Filter = 'all' | 'todo' | 'review' | 'done'

const FILTERS: { id: Filter; label: string; test: (t: MyTask) => boolean }[] = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'todo', label: 'Сделать', test: t => t.assignment.status === 'todo' || t.assignment.status === 'rework' },
  { id: 'review', label: 'На проверке', test: t => t.assignment.status === 'review' },
  { id: 'done', label: 'Сдано', test: t => t.assignment.status === 'done' },
]

export function MySprintPage({ participantId }: { participantId: string | null }) {
  const today = todayISO()
  const [data, setData] = React.useState<MySprintData | null>(null)
  const [error, setError] = React.useState<'migration' | string | null>(null)
  const [sprintId, setSprintId] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [day, setDay] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!participantId) return
    try {
      const q = new URLSearchParams({ participant_id: participantId })
      if (sprintId) q.set('sprint_id', sprintId)
      const r = await api<{ data: MySprintData }>(`/api/my-sprint?${q}`)
      setData(r.data)
      setError(null)
    } catch (e) {
      setError(e instanceof MigrationRequired ? 'migration' : (e as Error).message)
    }
  }, [participantId, sprintId])

  React.useEffect(() => {
    load()
  }, [load])

  if (!participantId) {
    return (
      <Shell>
        <EmptyState
          icon={MessageCircleQuestion}
          title="Профиль участника не подключён"
          description="Ваш вход пока не связан с карточкой участника. Напишите менеджеру программы, и он подключит её."
        />
      </Shell>
    )
  }
  if (error === 'migration') {
    return (
      <Shell>
        <EmptyState icon={Flag} title="Раздел скоро заработает" description="Здесь появятся задачи спринтов от куратора. Загляните чуть позже." />
      </Shell>
    )
  }
  if (error && !data) {
    return (
      <Shell>
        <EmptyState
          icon={MessageCircleQuestion}
          title="Не удалось загрузить спринт"
          description="Проверьте интернет и попробуйте ещё раз."
          action={<Button variant="outline" size="sm" onClick={load}>Повторить</Button>}
        />
      </Shell>
    )
  }
  if (!data) return <Shell><LoadingState /></Shell>

  const sprint = data.current
  if (!sprint) {
    return (
      <Shell>
        <EmptyState
          icon={Flag}
          title="Спринтов пока нет"
          description={`Куратор ещё не запустил спринты${data.program ? ` в программе «${data.program.name}»` : ''}. Мы покажем задачи здесь, как только они появятся.`}
        />
        <TelegramLinkCard participantId={participantId} participantName={data.participant.name} />
      </Shell>
    )
  }

  const p = sprintProgress(sprint, today)
  const tasks = data.tasks
  const done = tasks.filter(t => t.assignment.status === 'done').length
  const open = tasks.filter(t => t.assignment.status !== 'done')
  const nextDue = open
    .map(t => ({ t, due: effectiveDue(t.task, t.assignment) }))
    .filter(x => x.due && x.due >= today)
    .sort((a, b) => a.due!.localeCompare(b.due!))[0]
  const rework = tasks.filter(t => t.assignment.status === 'rework')
  const shown = day
    ? tasks.filter(t => effectiveDue(t.task, t.assignment) === day)
    : tasks.filter(FILTERS.find(f => f.id === filter)!.test)
  const index = data.sprints.findIndex(s => s.id === sprint.id)
  const selected = tasks.find(t => t.assignment.id === openId) ?? null

  const toggleMark = async (t: MyTask) => {
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
    <Shell>
      <header className="px-1">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="-my-2 inline-flex items-center gap-0.5 rounded-md py-2 text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          Спринт {sprint.number} из {data.sprints.length} · все спринты
          <ChevronRight className="size-4" />
        </button>
        <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight text-balance sm:text-3xl">{sprint.title}</h1>
        {sprint.goal && <p className="mt-2 text-[15px] leading-relaxed text-pretty text-muted-foreground">Цель: {sprint.goal}</p>}
      </header>

      <section className="pt-glow-card flex flex-wrap items-center gap-x-5 gap-y-4 p-5">
        <Ring value={tasks.length ? done / tasks.length : 0} label={`${done}/${tasks.length}`} />
        <div className="min-w-0 flex-[1_1_180px]">
          <p className="num text-lg font-bold" aria-live="polite">
            {done} из {tasks.length} сдано
          </p>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {nextDue ? `Ближайший срок ${shortDate(nextDue.due)}: ${nextDue.t.task.title.toLowerCase()}` : open.length ? 'Сроков впереди нет' : 'Все задачи сданы'}
          </p>
        </div>
        <span className="num inline-flex h-7 items-center rounded-full border border-primary/40 bg-primary/10 px-3 text-[13px] font-semibold text-primary">
          {!p.started ? `старт ${shortDate(sprint.start_date)}` : p.finished ? 'спринт завершён' : `осталось ${p.left} ${plural(p.left, ['день', 'дня', 'дней'])}`}
        </span>
      </section>

      {rework.length > 0 && (
        <button
          type="button"
          onClick={() => setOpenId(rework[0].assignment.id)}
          className="flex w-full items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <RotateCcw className="size-5 shrink-0 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Куратор вернул на доработку</span>
            <span className="block truncate text-sm text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]">
              «{rework[0].task.title}»{rework.length > 1 ? ` и ещё ${rework.length - 1}` : ''}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </button>
      )}

      {p.finished && (
        <section className="flex items-start gap-3 rounded-2xl bg-muted px-4 py-3.5">
          <Flag className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Спринт завершён</span>
            <span className="num block text-sm text-muted-foreground">
              {tasks.length ? `Сдано ${done} из ${tasks.length}.` : 'Задач не было.'}
              {open.length ? ` Не сдано: ${open.length}, обсудите с куратором.` : tasks.length ? ' Всё сдано.' : ''}
            </span>
          </span>
        </section>
      )}

      <DayStrip sprint={sprint} tasks={tasks} today={today} selected={day} onSelect={setDay} />

      {day ? (
        <div className="flex min-h-9 items-center justify-between px-1">
          <span className="text-[17px] font-semibold">Срок {shortDate(day)}</span>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setDay(null)}>
            Все задачи
          </Button>
        </div>
      ) : (
        <div role="group" aria-label="Фильтр задач" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
          {FILTERS.map(f => {
            const on = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                  on ? 'border-primary-soft bg-primary-soft text-primary-soft-foreground' : 'bg-card hover:border-ring/40'
                )}
              >
                {f.label}
                <span className="num text-[12.5px] opacity-70">{tasks.filter(f.test).length}</span>
              </button>
            )
          })}
        </div>
      )}

      {shown.length ? (
        <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          {shown.map(t => (
            <TaskRow
              key={t.assignment.id}
              t={t}
              today={today}
              busy={busy === t.assignment.id}
              onToggle={() => toggleMark(t)}
              onOpen={() => setOpenId(t.assignment.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {day
            ? 'На этот день сроков нет'
            : filter === 'review'
              ? 'Отправленные отчёты появятся здесь, пока куратор их смотрит'
              : filter === 'done'
                ? 'Пока ничего не сдано. Отмечайте задачи, как только сделаете их'
                : tasks.length
                  ? 'Всё сделано'
                  : 'В этом спринте у вас пока нет задач'}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">Кружок — можно просто отметить. Квадрат — нужен отчёт.</p>

      <TaskSheet
        t={selected}
        participantId={participantId}
        today={today}
        onOpenChange={o => !o && setOpenId(null)}
        onChanged={load}
      />

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Мои спринты</SheetTitle>
            <SheetDescription>{data.program?.name}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <ol className="space-y-2">
              {data.sprints.map(s => {
                const cur = s.id === sprint.id
                const future = s.start_date > today
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSprintId(s.id)
                        setDay(null)
                        setFilter('all')
                        setHistoryOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30',
                        cur && 'border-primary bg-primary-soft hover:bg-primary-soft',
                        future && 'border-dashed'
                      )}
                    >
                      <span
                        className={cn(
                          'num flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                          s.total && s.done === s.total ? 'bg-success text-white' : cur ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {s.total && s.done === s.total ? <Check className="size-4" strokeWidth={3} /> : s.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.title}</span>
                        <span className="num block text-xs text-muted-foreground">
                          {dateRange(s.start_date, s.end_date)}
                          {future ? ' · скоро' : ` · сдано ${s.done} из ${s.total}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {index >= 0 && <p className="mt-3 text-xs text-muted-foreground">Сейчас открыт спринт {sprint.number}</p>}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-8 sm:pt-8">{children}</div>
}

function LoadingState() {
  return (
    <>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  )
}

function Ring({ value, label }: { value: number; label: string }) {
  const c = 97.4
  return (
    <span className="relative inline-flex size-16 shrink-0">
      <svg viewBox="0 0 36 36" className="size-16 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--track)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${(value * c).toFixed(1)} ${c}`}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[15px] font-bold">{label}</span>
    </span>
  )
}

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function DayStrip({
  sprint,
  tasks,
  today,
  selected,
  onSelect,
}: {
  sprint: { start_date: string; end_date: string }
  tasks: MyTask[]
  today: string
  selected: string | null
  onSelect: (d: string | null) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const total = daysBetween(sprint.start_date, sprint.end_date) + 1
  const days = Array.from({ length: total }, (_, i) => addDays(sprint.start_date, i))

  React.useEffect(() => {
    ref.current?.querySelector('[data-today="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div className="rounded-2xl border bg-card px-2 py-2.5 shadow-xs">
      <div ref={ref} role="group" aria-label="Дни спринта: нажмите, чтобы увидеть задачи с этим сроком" className="flex gap-0.5 overflow-x-auto scrollbar-none">
        {days.map(d => {
          const due = tasks.filter(t => effectiveDue(t.task, t.assignment) === d)
          const openDue = due.filter(t => t.assignment.status !== 'done')
          const sel = selected === d
          const isToday = d === today
          const soon = daysBetween(today, d) <= 2
          const weekday = WD[new Date(`${d}T00:00:00Z`).getUTCDay()]
          return (
            <button
              key={d}
              type="button"
              data-today={isToday}
              aria-pressed={sel}
              aria-label={`${shortDate(d)}${isToday ? ', сегодня' : ''}${due.length ? `, задач со сроком: ${due.length}` : ''}`}
              onClick={() => onSelect(sel ? null : d)}
              className={cn(
                'flex w-11 shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                sel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                isToday && !sel && 'ring-[1.5px] ring-primary ring-inset'
              )}
            >
              {weekday}
              <b className={cn('num text-base', sel ? 'text-primary-foreground' : d < today ? 'font-medium text-muted-foreground' : 'text-foreground')}>
                {Number(d.slice(8))}
              </b>
              <span
                className={cn(
                  'size-[5px] rounded-full',
                  !openDue.length ? 'bg-transparent' : sel ? 'bg-primary-foreground' : d < today || soon ? 'bg-warning' : 'bg-primary'
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TaskRow({
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
  const canTick = task.submission_type === 'mark' && a.status !== 'rework'
  const done = a.status === 'done'

  const chip =
    a.status === 'rework'
      ? { text: due ? `Исправить до ${shortDate(due)}` : 'Исправить', cls: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' }
      : a.status === 'review'
        ? { text: 'На проверке', cls: 'bg-info-soft text-info' }
        : done
          ? { text: 'Сдано', cls: 'bg-success-soft text-success' }
          : overdue
            ? { text: `Срок был ${shortDate(due)}`, cls: 'bg-destructive-soft text-destructive' }
            : due
              ? { text: relativeDue(due, today), cls: daysBetween(today, due) <= 2 ? 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'bg-muted text-muted-foreground' }
              : null

  return (
    <li className="flex min-h-[72px] items-center gap-3.5 border-b py-3 pr-3 pl-4 last:border-b-0">
      {canTick ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done || a.status === 'review'}
          aria-label={`${done ? 'Снять отметку' : 'Отметить выполненной'}: ${task.title}`}
          disabled={busy}
          onClick={onToggle}
          className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60"
        >
          <span
            className={cn(
              'flex size-[34px] items-center justify-center rounded-full border-2 transition-colors',
              done ? 'border-success bg-success text-white' : a.status === 'review' ? 'border-info bg-info-soft text-info' : 'border-muted-foreground/60 hover:border-success'
            )}
          >
            {done && <Check className="size-4" strokeWidth={3} />}
            {a.status === 'review' && <Clock className="size-4" />}
          </span>
        </button>
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex size-[34px] shrink-0 items-center justify-center rounded-[10px]',
            a.status === 'rework'
              ? 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]'
              : a.status === 'review'
                ? 'bg-info-soft text-info'
                : done
                  ? 'bg-success-soft text-success'
                  : 'bg-muted text-muted-foreground'
          )}
        >
          {a.status === 'rework' ? <RotateCcw className="size-4" /> : a.status === 'review' ? <Clock className="size-4" /> : done ? <Check className="size-4" strokeWidth={3} /> : task.submission_type === 'link' ? <Link2 className="size-4" /> : <FileText className="size-4" />}
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block text-base font-medium', done && 'text-muted-foreground')}>{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            {chip && <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium', chip.cls)}>{chip.text}</span>}
            {SUBMISSION[task.submission_type].label.toLowerCase()}
          </span>
        </span>
        <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

const EVENT_TEXT = {
  submitted: 'Вы отправили отчёт',
  returned: 'Вернули на доработку',
  accepted: 'Куратор принял',
  marked: 'Вы отметили выполненной',
  unmarked: 'Вы сняли отметку',
} as const

function TaskSheet({
  t,
  participantId,
  today,
  onOpenChange,
  onChanged,
}: {
  t: MyTask | null
  participantId: string
  today: string
  onOpenChange: (o: boolean) => void
  onChanged: () => Promise<void> | void
}) {
  const [text, setText] = React.useState('')
  const [link, setLink] = React.useState('')
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const id = t?.assignment.id
  const attachable = !!t && t.task.submission_type !== 'mark'
  const { files, reload: reloadFiles } = useReportFiles(id, attachable)

  React.useEffect(() => {
    if (!t) return
    setText(t.assignment.report_text ?? '')
    setLink(t.assignment.report_link ?? '')
    setEditing(t.assignment.status === 'todo' || t.assignment.status === 'rework')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!t) return <Sheet open={false} onOpenChange={onOpenChange} />
  const { task, assignment: a, events } = t
  const due = effectiveDue(task, a)
  const overdue = isOverdue(task, a, today)
  const lastReview = [...events].reverse().find(e => e.kind === 'returned' || e.kind === 'accepted')
  const isMark = task.submission_type === 'mark'

  const send = async (type: 'submit' | 'mark') => {
    setSaving(true)
    try {
      await api(`/api/sprints/assignments/${a.id}`, {
        method: 'POST',
        json: { type, participant_id: participantId, report_text: text, report_link: link },
      })
      toast.success(task.requires_review ? 'Отправлено на проверку' : 'Задача сдана', {
        description: task.requires_review ? 'Ответ куратора появится здесь и в Telegram' : undefined,
      })
      setEditing(false)
      await onChanged()
    } catch (e) {
      toast.error('Не удалось отправить', { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const st = STATUS[a.status]
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <div className="flex flex-wrap gap-1.5">
              <span
                className={cn(
                  'inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium',
                  a.status === 'rework' ? 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : a.status === 'review' ? 'bg-info-soft text-info' : a.status === 'done' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
                )}
              >
                {st.label}
              </span>
              {due && (
                <span className={cn('num inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-medium', overdue ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground')}>
                  {a.status === 'rework' ? `исправить до ${shortDate(due)}` : overdue ? `срок был ${shortDate(due)}` : `до ${shortDate(due)}`}
                </span>
              )}
            </div>
            <SheetTitle className="text-[22px] leading-tight font-bold tracking-tight">{task.title}</SheetTitle>
            <SheetDescription>{SUBMISSION[task.submission_type].label}{task.requires_review ? ' · проверяет куратор' : ''}</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5">
            {task.description && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{task.description}</p>}

            {lastReview?.comment && (
              <div className="flex items-end gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    lastReview.kind === 'returned' ? 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'bg-success-soft text-success'
                  )}
                >
                  {(lastReview.actor_name || 'К').slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 ml-1 text-xs text-muted-foreground">
                    {lastReview.actor_name || 'Куратор'} · {shortDate(lastReview.created_at.slice(0, 10))}
                  </p>
                  <p className={cn('rounded-2xl rounded-bl-md px-3.5 py-3 text-[15px] leading-relaxed', lastReview.kind === 'returned' ? 'bg-warning-soft' : 'bg-success-soft')}>
                    {lastReview.comment}
                  </p>
                </div>
              </div>
            )}

            {!isMark && editing && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="ms-text" className="mb-2 ml-1 block text-[15px] font-semibold">
                    {task.submission_type === 'link' ? 'Комментарий' : 'Ваш отчёт'}
                  </label>
                  <Textarea
                    id="ms-text"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={task.submission_type === 'link' ? 'Что получилось, где нужна помощь (необязательно)' : 'Что сделали и что поняли'}
                    className="min-h-36 resize-none rounded-xl text-base"
                  />
                  {a.status === 'rework' && a.report_text && <p className="mt-1.5 ml-1 text-xs text-muted-foreground">Прошлый вариант сохранён, допишите недостающее</p>}
                </div>
                <div>
                  <label htmlFor="ms-link" className="mb-2 ml-1 block text-[15px] font-semibold">
                    Ссылка <span className="font-normal text-muted-foreground">· необязательно</span>
                  </label>
                  <Input
                    id="ms-link"
                    type="url"
                    inputMode="url"
                    value={link}
                    onChange={e => setLink(e.target.value)}
                    placeholder="https://docs.google.com/…"
                    className="h-12 rounded-xl text-base"
                  />
                  <p className="mt-1.5 ml-1 text-xs text-muted-foreground">Большой файл или видео: загрузите в Google Диск и вставьте ссылку с доступом для просмотра</p>
                </div>
                <div>
                  <p className="mb-2 ml-1 text-[15px] font-semibold">
                    Файлы {task.submission_type === 'link' ? <span className="font-normal text-muted-foreground">· вместо ссылки</span> : <span className="font-normal text-muted-foreground">· необязательно</span>}
                  </p>
                  <FileUploader assignmentId={a.id} files={files} reload={reloadFiles} />
                </div>
              </div>
            )}

            {!editing && (a.report_text || a.report_link || files.length > 0) && (
              <div className="rounded-xl border p-3.5">
                <p className="mb-2 text-sm font-semibold">Ваш отчёт</p>
                {a.report_text && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{a.report_text}</p>}
                {a.report_link && (
                  <a href={a.report_link} target="_blank" rel="noreferrer noopener" className="mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.report_link}</span>
                  </a>
                )}
                <FileChips assignmentId={a.id} files={files} className={a.report_text || a.report_link ? 'mt-2' : undefined} />
              </div>
            )}

            {events.length > 0 && (
              <div>
                <p className="mb-2.5 text-[15px] font-semibold">История</p>
                <ol className="space-y-2.5">
                  {[...events].reverse().map(e => (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <span
                        className={cn(
                          'mt-1.5 size-2.5 shrink-0 rounded-full',
                          e.kind === 'accepted' ? 'bg-success' : e.kind === 'returned' ? 'bg-warning' : e.kind === 'submitted' || e.kind === 'marked' ? 'bg-info' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span>
                        {EVENT_TEXT[e.kind]}
                        {e.kind === 'returned' && e.due_date && `, исправить до ${shortDate(e.due_date)}`}
                        <span className="num text-muted-foreground"> · {shortDate(e.created_at.slice(0, 10))}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </SheetBody>
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            {isMark ? (
              a.status === 'done' || a.status === 'review' ? (
                <p className="w-full text-center text-sm text-muted-foreground">Отмечено. Снять отметку можно в списке задач.</p>
              ) : (
                <Button size="lg" className="h-12 w-full rounded-xl text-base" disabled={saving} onClick={() => send('mark')}>
                  <Check /> Отметить выполненной
                </Button>
              )
            ) : editing ? (
              <Button size="lg" className="h-12 w-full rounded-xl text-base" disabled={saving} onClick={() => send('submit')}>
                {saving ? 'Отправка…' : task.requires_review ? 'Отправить на проверку' : 'Сдать задачу'}
              </Button>
            ) : a.status === 'review' ? (
              <Button size="lg" variant="secondary" className="h-12 w-full rounded-xl text-base" onClick={() => setEditing(true)}>
                Изменить отчёт
              </Button>
            ) : (
              <p className="w-full text-center text-sm text-success">Задача принята</p>
            )}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
