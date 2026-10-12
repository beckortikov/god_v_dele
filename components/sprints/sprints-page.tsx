'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Check, CornerUpLeft, Flag, ListChecks, MoreHorizontal, Plus, Search, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural, todayISO } from '@/lib/format'
import {
  SUBMISSION,
  dateRange,
  isOverdue,
  percent,
  pickCurrentSprint,
  shortDate,
  sprintProgress,
  type Assignment,
  type BoardData,
  type SprintSummary,
  type SprintTask,
} from '@/lib/sprints'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton } from '@/components/erp/table-parts'
import { useConfirm } from '@/components/erp/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CellState, Legend, MigrationNotice, MigrationRequired, StatusCell, api, useStoredState } from './shared'
import { TaskSheet } from './task-sheet'
import { SprintSheet } from './sprint-sheet'
import { ReviewSheet } from './review-sheet'

interface Program {
  id: string
  name: string
}

type View = 'people' | 'tasks'

export function SprintsPage() {
  const confirm = useConfirm()
  const today = todayISO()
  const [programs, setPrograms] = React.useState<Program[] | null>(null)
  const [programId, setProgramId] = useStoredState<string>('sprints-program', '')
  const [sprints, setSprints] = React.useState<SprintSummary[] | null>(null)
  const [sprintId, setSprintId] = React.useState<string | null>(null)
  const [board, setBoard] = React.useState<BoardData | null>(null)
  const [backlog, setBacklog] = React.useState<SprintTask[]>([])
  const [migration, setMigration] = React.useState(false)
  const [view, setView] = useStoredState<View>('sprints-view', 'people')
  const [query, setQuery] = React.useState('')
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [taskFor, setTaskFor] = React.useState<string[] | undefined>()
  const [sprintOpen, setSprintOpen] = React.useState(false)
  const [review, setReview] = React.useState<{ participantId: string; taskId?: string } | null>(null)

  const fail = React.useCallback((e: unknown, what: string) => {
    if (e instanceof MigrationRequired) setMigration(true)
    else toast.error(what, { description: (e as Error).message })
  }, [])

  // Programs (= потоки)
  React.useEffect(() => {
    api<{ data: Program[] }>('/api/programs')
      .then(r => setPrograms(r.data ?? []))
      .catch(e => {
        setPrograms([])
        fail(e, 'Не удалось загрузить программы')
      })
  }, [fail])

  React.useEffect(() => {
    if (programs?.length && !programs.some(p => p.id === programId)) setProgramId(programs[0].id)
  }, [programs, programId, setProgramId])

  const loadSprints = React.useCallback(
    async (prefer?: string) => {
      if (!programId) return
      try {
        const [s, b] = await Promise.all([
          api<{ data: SprintSummary[] }>(`/api/sprints?program_id=${programId}`),
          api<{ data: SprintTask[] }>(`/api/sprints/tasks?program_id=${programId}`),
        ])
        setMigration(false)
        setSprints(s.data)
        setBacklog(b.data)
        setSprintId(cur => {
          if (prefer && s.data.some(x => x.id === prefer)) return prefer
          if (cur && s.data.some(x => x.id === cur)) return cur
          return pickCurrentSprint(s.data, today)?.id ?? null
        })
      } catch (e) {
        setSprints([])
        fail(e, 'Не удалось загрузить спринты')
      }
    },
    [programId, today, fail]
  )

  const loadBoard = React.useCallback(async () => {
    if (!sprintId) {
      setBoard(null)
      return
    }
    try {
      const r = await api<{ data: BoardData }>(`/api/sprints/${sprintId}/board`)
      setBoard(r.data)
    } catch (e) {
      fail(e, 'Не удалось загрузить спринт')
    }
  }, [sprintId, fail])

  React.useEffect(() => {
    setSprints(null)
    setBoard(null)
    setSprintId(null)
    loadSprints()
  }, [loadSprints])

  React.useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const refresh = React.useCallback(() => {
    loadBoard()
    loadSprints()
  }, [loadBoard, loadSprints])

  const program = programs?.find(p => p.id === programId)
  const sprint = board?.sprint.id === sprintId ? board.sprint : null

  // ---- derived matrix
  const byKey = React.useMemo(() => {
    const m = new Map<string, Assignment>()
    for (const a of board?.assignments ?? []) m.set(`${a.participant_id}:${a.task_id}`, a)
    return m
  }, [board])

  const cellState = React.useCallback(
    (task: SprintTask, a?: Assignment): CellState => (!a ? 'none' : isOverdue(task, a, today) ? 'overdue' : a.status),
    [today]
  )

  const rows = React.useMemo(() => {
    if (!board) return []
    return board.participants
      .map(p => {
        const cells = board.tasks.map(t => ({ task: t, a: byKey.get(`${p.id}:${t.id}`) }))
        const own = cells.filter(c => c.a)
        const done = own.filter(c => c.a!.status === 'done').length
        const overdue = own.filter(c => cellState(c.task, c.a) === 'overdue').length
        const waiting = own.filter(c => c.a!.status === 'review').length
        return { p, cells, total: own.length, done, overdue, waiting, pct: percent(done, own.length) }
      })
      .filter(r => !query.trim() || r.p.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => b.overdue - a.overdue || a.pct - b.pct || a.p.name.localeCompare(b.p.name, 'ru'))
  }, [board, byKey, cellState, query])

  const stats = React.useMemo(() => {
    const all = board?.assignments ?? []
    const taskOf = new Map(board?.tasks.map(t => [t.id, t]) ?? [])
    const overdue = all.filter(a => taskOf.has(a.task_id) && isOverdue(taskOf.get(a.task_id)!, a, today))
    const behind = new Set(overdue.map(a => a.participant_id)).size
    const waiting = all.filter(a => a.status === 'review')
    return {
      total: all.length,
      done: all.filter(a => a.status === 'done').length,
      waiting: waiting.length,
      waitingPeople: new Set(waiting.map(a => a.participant_id)).size,
      overdue: overdue.length,
      behind,
    }
  }, [board, today])

  const taskStats = (t: SprintTask) => {
    const list = board?.assignments.filter(a => a.task_id === t.id) ?? []
    return { total: list.length, done: list.filter(a => a.status === 'done').length, review: list.filter(a => a.status === 'review').length }
  }

  // ---- actions
  const moveToSprint = async (task: SprintTask) => {
    if (!sprint) return
    try {
      await api(`/api/sprints/tasks/${task.id}`, { method: 'PATCH', json: { sprint_id: sprint.id } })
      toast.success('Задача в спринте', { description: task.title })
      refresh()
    } catch (e) {
      fail(e, 'Не удалось перенести задачу')
    }
  }

  const toBacklog = async (task: SprintTask) => {
    try {
      await api(`/api/sprints/tasks/${task.id}`, { method: 'PATCH', json: { sprint_id: null } })
      toast.success('Задача в бэклоге', { description: task.title })
      refresh()
    } catch (e) {
      fail(e, 'Не удалось вернуть в бэклог')
    }
  }

  const removeTask = async (task: SprintTask) => {
    const s = taskStats(task)
    const ok = await confirm({
      title: `Удалить «${task.title}»?`,
      description: s.total
        ? `Задача пропадёт у ${s.total} ${plural(s.total, ['участника', 'участников', 'участников'])} вместе с их отчётами (сдано: ${s.done}). Запись останется в журнале изменений.`
        : 'Задача ещё никому не назначена.',
      confirmText: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    try {
      await api(`/api/sprints/tasks/${task.id}`, { method: 'DELETE' })
      toast.success('Задача удалена')
      refresh()
    } catch (e) {
      fail(e, 'Не удалось удалить задачу')
    }
  }

  const openTask = (forIds?: string[]) => {
    setTaskFor(forIds)
    setTaskOpen(true)
  }

  // ---- render
  const header = (
    <PageHeader
      title="Спринты"
      description="Задачи участников потока по спринтам"
      actions={
        <>
          {programs && programs.length > 0 && (
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger size="sm" className="w-56" aria-label="Поток">
                <SelectValue placeholder="Поток" />
              </SelectTrigger>
              <SelectContent>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" disabled={!programId || migration} onClick={() => setSprintOpen(true)}>
            Новый спринт
          </Button>
          <Button size="sm" disabled={!programId || migration} onClick={() => openTask()}>
            <Plus /> Новая задача
          </Button>
        </>
      }
    />
  )

  if (migration) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <MigrationNotice />
        </Panel>
      </PageContainer>
    )
  }

  if (programs && !programs.length) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState icon={Users} title="Нет программ" description="Сначала создайте программу и добавьте в неё участников." />
        </Panel>
      </PageContainer>
    )
  }

  const progress = sprint ? sprintProgress(sprint, today) : null

  return (
    <PageContainer>
      {header}

      {sprints === null ? (
        <TableSkeleton rows={6} />
      ) : !sprints.length ? (
        <Panel>
          <EmptyState
            icon={Flag}
            title="В этом потоке ещё нет спринтов"
            description="Спринт — это одна-две недели с целью и набором задач для всех участников."
            action={
              <Button size="sm" onClick={() => setSprintOpen(true)}>
                <Plus /> Первый спринт
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          <Panel>
            <div className="flex gap-2 overflow-x-auto border-b p-3 scrollbar-none">
              {sprints.map(s => {
                const active = s.id === sprintId
                const past = s.end_date < today
                const future = s.start_date > today
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSprintId(s.id)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                      active ? 'border-primary bg-primary-soft font-medium text-primary-soft-foreground' : 'hover:bg-accent',
                      future && !active && 'border-dashed text-muted-foreground'
                    )}
                  >
                    {past && !active && <Check className="size-3.5 text-success" strokeWidth={3} />}
                    {!past && !future && <span className="size-1.5 rounded-full bg-primary" />}
                    Спринт {s.number}
                    <span className={cn('num', active ? '' : 'text-muted-foreground')}>{dateRange(s.start_date, s.end_date)}</span>
                  </button>
                )
              })}
            </div>
            {sprint && progress && (
              <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-[1_1_380px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Спринт {sprint.number} · {sprint.title}
                    </h2>
                    <Badge variant={progress.finished ? 'secondary' : progress.started ? 'default' : 'outline'}>
                      {progress.finished ? 'Завершён' : progress.started ? 'Идёт' : 'Скоро'}
                    </Badge>
                  </div>
                  {sprint.goal && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Цель: {sprint.goal}</p>}
                </div>
                <div className="min-w-60 flex-[0_1_320px]">
                  <div className="mb-2 flex justify-between text-[13px]">
                    <span className="font-medium">
                      {progress.started ? `День ${progress.day} из ${progress.total}` : `Начнётся ${shortDate(sprint.start_date)}`}
                    </span>
                    <span className="num text-muted-foreground">
                      {progress.finished ? 'завершён' : `осталось ${progress.left} ${plural(progress.left, ['день', 'дня', 'дней'])}`}
                    </span>
                  </div>
                  <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${progress.total}, minmax(0, 1fr))` }} aria-hidden>
                    {Array.from({ length: progress.total }, (_, i) => (
                      <span key={i} className={cn('h-2 rounded-[3px]', i < progress.day ? 'bg-primary' : 'bg-muted')} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {board && sprint && (
            <StatStrip
              stats={[
                { label: 'Выполнено', value: `${stats.done} из ${stats.total}`, sub: `${percent(stats.done, stats.total)}% задач спринта` },
                {
                  label: 'Ждут проверки',
                  value: stats.waiting,
                  tone: stats.waiting ? 'warning' : 'default',
                  sub: stats.waiting ? `от ${stats.waitingPeople} ${plural(stats.waitingPeople, ['участника', 'участников', 'участников'])}` : 'всё проверено',
                },
                { label: 'Просрочено', value: stats.overdue, tone: stats.overdue ? 'destructive' : 'default', sub: stats.overdue ? 'не сдано вовремя' : 'без просрочек' },
                {
                  label: 'Отстают',
                  value: stats.behind,
                  tone: stats.behind ? 'warning' : 'default',
                  sub: `${plural(stats.behind, ['участник', 'участника', 'участников'])} с просрочкой`,
                },
              ]}
            />
          )}

          <Panel>
            <PanelToolbar>
              <Segmented
                aria-label="Вид"
                value={view}
                onChange={setView}
                options={[
                  { value: 'people', label: <>Участники <span className="text-muted-foreground">{board?.participants.length ?? 0}</span></> },
                  { value: 'tasks', label: <>Задачи <span className="text-muted-foreground">{board?.tasks.length ?? 0}</span></> },
                ]}
              />
              {view === 'people' && (
                <label className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Имя участника…"
                    aria-label="Поиск участника"
                    className="h-8 w-52 rounded-md border border-input bg-card pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  />
                </label>
              )}
              {view === 'people' && <Legend className="ml-auto max-lg:hidden" />}
            </PanelToolbar>

            {!board ? (
              <TableSkeleton rows={6} toolbar={false} />
            ) : view === 'people' ? (
              board.tasks.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="В спринте пока нет задач"
                  description="Поставьте задачу всему потоку или возьмите её из бэклога."
                  action={
                    <Button size="sm" onClick={() => openTask()}>
                      <Plus /> Новая задача
                    </Button>
                  }
                />
              ) : rows.length === 0 ? (
                <EmptyState icon={Users} title="Никого не нашли" description={query ? 'Попробуйте другое имя.' : 'В потоке нет активных участников.'} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-56">Участник</TableHead>
                      {board.tasks.map(t => {
                        const late = t.due_date && t.due_date < today
                        return (
                          <TableHead key={t.id} className="w-28 text-center align-bottom">
                            <span className="line-clamp-2 block font-medium whitespace-normal text-foreground" title={t.title}>
                              {t.title}
                            </span>
                            {t.due_date && (
                              <span className={cn('num block font-normal', late ? 'text-destructive' : 'text-muted-foreground')}>
                                до {shortDate(t.due_date)}
                              </span>
                            )}
                          </TableHead>
                        )
                      })}
                      <TableHead className="w-36">Прогресс</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.p.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setReview({ participantId: r.p.id })}
                            className="flex items-center gap-2 rounded-md text-left font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/30"
                          >
                            {r.p.name}
                            {r.overdue > 0 && <Badge variant="destructive">просрочка</Badge>}
                            {r.waiting > 0 && <Badge variant="info">ждёт {r.waiting}</Badge>}
                          </button>
                        </TableCell>
                        {r.cells.map(({ task, a }) => {
                          const state = cellState(task, a)
                          return (
                            <TableCell key={task.id} className="text-center">
                              <StatusCell
                                state={state}
                                label={`${r.p.name}, «${task.title}»: ${state === 'none' ? 'не назначено' : state === 'overdue' ? 'просрочено' : a ? statusWord(a) : ''}`}
                                onClick={() => setReview({ participantId: r.p.id, taskId: task.id })}
                              />
                            </TableCell>
                          )
                        })}
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', r.overdue ? 'bg-destructive' : r.pct >= 60 ? 'bg-success' : 'bg-primary')}
                                style={{ width: `${r.pct}%` }}
                              />
                            </div>
                            <span className="num w-9 text-right text-[13px]">{r.pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="font-medium">Сдали</TableCell>
                      {board.tasks.map(t => {
                        const s = taskStats(t)
                        return (
                          <TableCell key={t.id} className="num text-center font-medium">
                            {s.done}/{s.total}
                          </TableCell>
                        )
                      })}
                      <TableCell className="num font-medium">в среднем {percent(stats.done, stats.total)}%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )
            ) : (
              <TasksView
                tasks={board.tasks}
                stats={taskStats}
                onDelete={removeTask}
                onBacklog={toBacklog}
                onNew={() => openTask()}
              />
            )}
          </Panel>

          {view === 'tasks' && (
            <Panel>
              <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                <div className="flex-1">
                  <h2 className="text-[15px] font-semibold">Бэклог потока</h2>
                  <p className="text-sm text-muted-foreground">Задачи на потом. Берите их в спринт, когда придёт время.</p>
                </div>
              </div>
              {backlog.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Пусто. В форме новой задачи выберите «В бэклог», чтобы отложить её.
                </p>
              ) : (
                <ul className="divide-y">
                  {backlog.map(t => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {SUBMISSION[t.submission_type].label} · {t.audience === 'all' ? 'для всего потока' : 'личная'}
                        </span>
                      </span>
                      <Button size="sm" variant="outline" disabled={!sprint} onClick={() => moveToSprint(t)}>
                        В спринт {sprint?.number}
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Удалить «${t.title}»`} onClick={() => removeTask(t)}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {program && (
        <>
          <TaskSheet
            open={taskOpen}
            onOpenChange={setTaskOpen}
            programId={program.id}
            sprints={(sprints ?? []).filter(s => s.end_date >= today)}
            defaultSprintId={sprint && sprint.end_date >= today ? sprint.id : null}
            participants={board?.participants.filter(p => p.status === 'active') ?? []}
            preselect={taskFor}
            onCreated={refresh}
          />
          <SprintSheet
            open={sprintOpen}
            onOpenChange={setSprintOpen}
            programId={program.id}
            programName={program.name}
            sprints={sprints ?? []}
            backlog={backlog}
            onCreated={s => {
              setSprintId(s.id)
              loadSprints(s.id)
            }}
          />
        </>
      )}
      {board && sprint && (
        <ReviewSheet
          open={!!review}
          onOpenChange={o => !o && setReview(null)}
          participant={board.participants.find(p => p.id === review?.participantId) ?? null}
          sprint={sprint}
          tasks={board.tasks}
          assignments={board.assignments}
          focusTaskId={review?.taskId}
          onChanged={refresh}
          onNewPersonalTask={id => {
            setReview(null)
            openTask([id])
          }}
        />
      )}
    </PageContainer>
  )
}

function statusWord(a: Assignment) {
  return { todo: 'не сдано', review: 'на проверке', rework: 'на доработке', done: 'выполнено' }[a.status]
}

function TasksView({
  tasks,
  stats,
  onDelete,
  onBacklog,
  onNew,
}: {
  tasks: SprintTask[]
  stats: (t: SprintTask) => { total: number; done: number; review: number }
  onDelete: (t: SprintTask) => void
  onBacklog: (t: SprintTask) => void
  onNew: () => void
}) {
  const today = todayISO()
  if (!tasks.length) {
    return (
      <EmptyState
        icon={ListChecks}
        title="В спринте пока нет задач"
        action={
          <Button size="sm" onClick={onNew}>
            <Plus /> Новая задача
          </Button>
        }
      />
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Задача</TableHead>
          <TableHead className="w-32 max-md:hidden">Кому</TableHead>
          <TableHead className="w-24">Срок</TableHead>
          <TableHead className="w-36 max-lg:hidden">Как сдать</TableHead>
          <TableHead className="w-44">Сдали</TableHead>
          <TableHead className="w-28">Проверка</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map(t => {
          const s = stats(t)
          const late = t.due_date && t.due_date < today
          return (
            <TableRow key={t.id} className="group">
              <TableCell>
                <p className="font-medium">{t.title}</p>
                {t.description && <p className="line-clamp-1 max-w-xl text-xs text-muted-foreground">{t.description}</p>}
              </TableCell>
              <TableCell className="text-sm max-md:hidden">{t.audience === 'all' ? 'Весь поток' : `Личная · ${s.total}`}</TableCell>
              <TableCell className={cn('num text-sm', late ? 'text-destructive' : '')}>{t.due_date ? shortDate(t.due_date) : '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground max-lg:hidden">{SUBMISSION[t.submission_type].label}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: `${percent(s.done, s.total)}%` }} />
                  </div>
                  <span className="num text-[13px]">
                    {s.done}/{s.total}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {s.review ? <Badge variant="info">ждут {s.review}</Badge> : <span className="text-sm text-muted-foreground">{t.requires_review ? '—' : 'без проверки'}</span>}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Действия: ${t.title}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={s.total > 0 && s.done + s.review > 0} onSelect={() => onBacklog(t)}>
                      <CornerUpLeft /> Вернуть в бэклог
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(t)}>
                      <Trash2 /> Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
