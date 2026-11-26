'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CalendarClock, CalendarOff, Check, CheckCheck, Clock, Columns3, List, ListChecks, ListTodo, Phone, Plus, SendHorizontal, SlidersHorizontal, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/erp/search-input'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { Combobox } from '@/components/erp/combobox'
import { useConfirm } from '@/components/erp/confirm'
import {
  ALL_ASSIGNEES,
  DeadlineSelect,
  PriorityBadge,
  PrioritySelect,
  TaskTypeSelect,
  assigneeOptions,
  byPriority,
  DEFAULT_PRIORITY,
  ageTone,
  deadlineLabel,
  timeSince,
  NewTaskSheet,
  TaskSheet,
  employeeName,
  isOverdue,
  participantOptions,
  taskType,
  type EmployeeLite,
  type NewTaskValues,
  type ParticipantLite,
  type Task,
  type TaskStatus,
} from '@/components/employee/task-parts'
import { LEAVE_STATUS, LeaveSheet, leaveRange, leaveTypeLabel, type LeaveRequest, type LeaveStatus } from '@/components/employee/leave-parts'
import { TimeTracker } from '@/components/employee/time-tracker'
import { PersonAvatar } from '@/components/crm/parts'

type View = 'active' | 'done' | 'all'


const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'К выполнению', in_progress: 'В работе', completed: 'Выполнено', cancelled: 'Отменено' }
const VIEW_KEY = 'tasks-layout'

/** «Список» or «Доска», remembered per browser. */
function useLayout(): ['list' | 'board', (v: 'list' | 'board') => void] {
  const [v, setV] = React.useState<'list' | 'board'>('list')
  React.useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'board') setV('board')
    } catch {}
  }, [])
  return [
    v,
    next => {
      setV(next)
      try {
        localStorage.setItem(VIEW_KEY, next)
      } catch {}
    },
  ]
}

function LayoutSwitch({ value, onChange }: { value: 'list' | 'board'; onChange: (v: 'list' | 'board') => void }) {
  return (
    <Segmented
      size="sm"
      aria-label="Вид"
      value={value}
      onChange={onChange}
      options={[
        { value: 'list', label: (<><List className="size-3.5" />Список</>) },
        { value: 'board', label: (<><Columns3 className="size-3.5" />Доска</>) },
      ]}
    />
  )
}

const COLUMNS: { id: TaskStatus; title: string; statuses: TaskStatus[]; dot: string }[] = [
  { id: 'todo', title: 'К выполнению', statuses: ['todo'], dot: 'bg-muted-foreground/50' },
  { id: 'in_progress', title: 'В работе', statuses: ['in_progress'], dot: 'bg-info' },
  { id: 'completed', title: 'Выполнено', statuses: ['completed', 'cancelled'], dot: 'bg-success' },
]
const DONE_ON_BOARD = 30

/** Three columns; drag a card to another column to change its status, click to open it. */
function TaskBoard({ tasks, names, onMove, onOpen }: { tasks: Task[]; names?: Map<string, string>; onMove: (t: Task, s: TaskStatus) => void; onOpen: (t: Task) => void }) {
  const [over, setOver] = React.useState<TaskStatus | null>(null)
  const dragged = React.useRef<string | null>(null)
  const order = (a: Task, b: Task) => byPriority(a, b) || Number(isOverdue(b)) - Number(isOverdue(a)) || (a.due_date ?? '').localeCompare(b.due_date ?? '') || (a.created_at ?? '').localeCompare(b.created_at ?? '')
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
      <div className="grid min-h-full auto-cols-[17rem] grid-flow-col items-start gap-2.5 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-3">
        {COLUMNS.map(col => {
          let items = tasks.filter(t => col.statuses.includes(t.status))
          items = col.id === 'completed' ? items.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, DONE_ON_BOARD) : items.sort(order)
          return (
            <section
              key={col.id}
              aria-label={col.title}
              onDragOver={e => {
                e.preventDefault()
                setOver(col.id)
              }}
              onDragLeave={() => setOver(o => (o === col.id ? null : o))}
              onDrop={e => {
                e.preventDefault()
                setOver(null)
                const t = tasks.find(x => x.id === dragged.current)
                dragged.current = null
                if (t && !col.statuses.includes(t.status)) onMove(t, col.id)
              }}
              className={cn('flex min-h-48 flex-col rounded-2xl border-2 border-transparent bg-muted p-2 transition-colors', over === col.id && 'border-primary bg-primary-soft/60')}
            >
              <header className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-semibold">
                <span className={cn('size-2.5 rounded-full', col.dot)} />
                {col.title}
                <span className="num ml-auto font-medium text-muted-foreground">{items.length}</span>
              </header>
              <div className="flex flex-col gap-1.5">
                {items.map(t => {
                  const type = taskType(t.task_type)
                  const who = names?.get(t.assignee_id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      draggable
                      onDragStart={e => {
                        dragged.current = t.id
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', t.id)
                      }}
                      onClick={() => onOpen(t)}
                      className={cn(
                        'flex w-full cursor-grab flex-col gap-1.5 rounded-xl border bg-card p-3 text-left shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/30 active:cursor-grabbing',
                        isOverdue(t) && 'border-destructive/40',
                        t.priority === 1 && t.status !== 'completed' && 'border-l-4 border-l-destructive'
                      )}
                    >
                      <span className="flex items-start gap-1.5">
                        <type.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={type.label} />
                        <span className={cn('min-w-0 flex-1 text-sm leading-snug font-medium', t.status === 'completed' && 'text-muted-foreground line-through')}>{t.title}</span>
                      </span>
                      <PriorityBadge task={t} className="self-start" />
                      {t.target && <span className="self-start rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary-soft-foreground">{t.target.name}</span>}
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                        <TaskTiming task={t} />
                      </span>
                      {who && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <PersonAvatar name={who} seed={t.assignee_id} size="sm" className="size-5! text-[9px]!" />
                          {who}
                        </span>
                      )}
                    </button>
                  )
                })}
                {items.length === 0 && <p className="rounded-xl border border-dashed px-2 py-6 text-center text-xs text-muted-foreground">Перетащите сюда</p>}
                {col.id === 'completed' && tasks.filter(t => col.statuses.includes(t.status)).length > DONE_ON_BOARD && (
                  <p className="px-1 text-center text-[11px] text-muted-foreground">Показаны последние {DONE_ON_BOARD}; остальные — в списке</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

const isActive = (t: Task) => t.status === 'todo' || t.status === 'in_progress'

function readUser(): { id: string | null; employeeId: string | null; name: string | null } {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}')
    return { id: u.id ?? null, employeeId: u.employee_id ?? null, name: u.employee_name || u.full_name || null }
  } catch {
    return { id: null, employeeId: null, name: null }
  }
}

async function send(method: string, body: unknown, url = '/api/employee/tasks') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || result?.error) throw new Error(result?.error || `Ошибка ${res.status}`)
  return result
}

const isLater = (t: Task) => !!t.due_date && t.due_date > todayISO()

/** Overdue first, then today's work (in progress before to do), then later deadlines, then what is done. */
function groupTasks(tasks: Task[], view: View) {
  const active = tasks.filter(isActive)
  const overdue = active.filter(isOverdue).sort(byPriority)
  const today = active.filter(t => !isOverdue(t) && !isLater(t)).sort((a, b) => byPriority(a, b) || Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))
  const later = active.filter(isLater).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || byPriority(a, b))
  const done = tasks.filter(t => !isActive(t)).sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  const groups: { id: string; title: string; tone?: 'danger'; items: Task[] }[] = []
  if (view !== 'done') {
    if (overdue.length) groups.push({ id: 'overdue', title: 'Просрочено', tone: 'danger', items: overdue })
    if (today.length) groups.push({ id: 'today', title: 'На сегодня', items: today })
    if (later.length) groups.push({ id: 'later', title: 'Позже', items: later })
  }
  if (view !== 'active' && done.length) groups.push({ id: 'done', title: 'Выполнено', items: done })
  return groups
}

/** The deadline and how long ago the task was set (or how long it took). */
function TaskTiming({ task }: { task: Task }) {
  const done = task.status === 'completed'
  const tone = ageTone(task)
  return (
    <>
      {task.due_date && !done && (isOverdue(task) || isLater(task)) && (
        <span className={cn('num inline-flex items-center gap-1', isOverdue(task) ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
          <CalendarClock className="size-3.5" />
          {isOverdue(task) ? `просрочено · срок ${formatDate(task.due_date).slice(0, 5)}` : `до ${deadlineLabel(task.due_date)}`}
        </span>
      )}
      {task.created_at && (
        <span
          className={cn(
            'num inline-flex items-center gap-1',
            tone === 'late' ? 'font-semibold text-destructive' : tone === 'warn' ? 'font-medium text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]' : 'text-muted-foreground'
          )}
          title={`Поставлена ${new Date(task.created_at).toLocaleString('ru-RU')}`}
        >
          <Clock className="size-3.5" />
          {done && task.updated_at ? `сделано за ${timeSince(task.created_at, new Date(task.updated_at).getTime())}` : `${timeSince(task.created_at)} назад`}
        </span>
      )}
    </>
  )
}

/** One task: a round tick on the left (done ↔ back to work), the task in the middle, details on click. */
function TaskRow({
  task,
  assignee,
  busy,
  onToggle,
  onStart,
  onOpen,
}: {
  task: Task
  assignee?: string
  busy: boolean
  onToggle: () => void
  onStart: () => void
  onOpen: () => void
}) {
  const done = task.status === 'completed'
  const cancelled = task.status === 'cancelled'
  const type = taskType(task.task_type)
  const tel = task.target?.phone ? `tel:${task.target.phone.replace(/[^\d+]/g, '')}` : null
  return (
    <li className="group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/70">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy || cancelled}
        aria-label={done ? `Вернуть в работу: ${task.title}` : `Выполнено: ${task.title}`}
        aria-pressed={done}
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
          done ? 'border-success bg-success text-white' : 'border-muted-foreground/40 text-transparent hover:border-success hover:text-success'
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none focus-visible:rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/30">
        <span className="flex items-center gap-1.5">
          <type.icon className="size-4 shrink-0 text-muted-foreground" aria-label={type.label} />
          {!done && !cancelled && <PriorityBadge task={task} />}
          <span className={cn('min-w-0 truncate text-[15px] font-medium', (done || cancelled) && 'text-muted-foreground line-through')}>{task.title}</span>
        </span>
        {task.description && <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">{task.description}</span>}
        {task.result_comment && done && <span className="mt-0.5 line-clamp-1 block text-sm text-success">Итог: {task.result_comment}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {task.status === 'in_progress' && <span className="rounded-md bg-info-soft px-1.5 py-0.5 font-semibold text-info">В работе</span>}
          {cancelled && <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">Отменено</span>}
          {task.target && <span className="rounded-md bg-primary-soft px-1.5 py-0.5 font-medium text-primary-soft-foreground">{task.target.name}</span>}
          <TaskTiming task={task} />
          {assignee && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <PersonAvatar name={assignee} seed={task.assignee_id} className="size-5! text-[9px]!" size="sm" />
              {assignee}
            </span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1">
        {tel && !done && (
          <Button asChild size="icon" variant="ghost" className="size-8 text-success" aria-label={`Позвонить: ${task.target?.name}`}>
            <a href={tel}>
              <Phone />
            </a>
          </Button>
        )}
        {task.status === 'todo' && (
          <Button type="button" size="sm" variant="ghost" className="h-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:hidden" onClick={onStart} disabled={busy}>
            Начать
          </Button>
        )}
      </span>
    </li>
  )
}

function TaskGroups({
  tasks,
  view,
  names,
  busyId,
  onToggle,
  onStart,
  onOpen,
  empty,
}: {
  tasks: Task[]
  view: View
  names?: Map<string, string>
  busyId: string | null
  onToggle: (t: Task) => void
  onStart: (t: Task) => void
  onOpen: (t: Task) => void
  empty: React.ReactNode
}) {
  const groups = groupTasks(tasks, view)
  if (!groups.length) return <>{empty}</>
  return (
    <div className="space-y-4">
      {groups.map(g => (
        <section key={g.id} aria-label={g.title}>
          <h2 className={cn('flex items-center px-2.5 pb-1 text-xs font-semibold', g.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')}>
            {g.title}
            <span className="num ml-2 font-medium">{g.items.length}</span>
          </h2>
          <ul className="space-y-0.5">
            {g.items.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                assignee={names?.get(t.assignee_id)}
                busy={busyId === t.id}
                onToggle={() => onToggle(t)}
                onStart={() => onStart(t)}
                onOpen={() => onOpen(t)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** The composer at the bottom: type, client, (whom), the task itself, Enter. «Подробнее» opens the full form. */
function QuickAdd({
  participants,
  employees,
  assignee,
  onAssignee,
  placeholder,
  onCreate,
  onMore,
}: {
  participants: ParticipantLite[]
  employees?: EmployeeLite[]
  assignee?: string
  onAssignee?: (id: string) => void
  placeholder: string
  onCreate: (v: NewTaskValues, due: string) => Promise<boolean>
  onMore: () => void
}) {
  const [title, setTitle] = React.useState('')
  const [due, setDue] = React.useState(todayISO())
  const [type, setType] = React.useState('call')
  const [priority, setPriority] = React.useState(DEFAULT_PRIORITY)
  const [client, setClient] = React.useState('none')
  const [busy, setBusy] = React.useState(false)
  const clientOptions = React.useMemo(() => [{ value: 'none', label: 'Без клиента' }, ...participantOptions(participants)], [participants])

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const ok = await onCreate({
      assignee_id: assignee ?? '',
      title: title.trim(),
      description: '',
      task_type: type,
      priority,
      target_type: client === 'none' ? 'none' : 'participant',
      target_participant_id: client,
      guest_name: '',
    }, due)
    setBusy(false)
    if (ok) {
      setTitle('')
      setClient('none')
      setDue(todayISO())
      setPriority(DEFAULT_PRIORITY)
    }
  }

  return (
    <form
      className="space-y-2 border-t bg-card px-3 pt-2.5 pb-3 sm:px-4"
      onSubmit={e => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskTypeSelect value={type} onChange={setType} />
        <PrioritySelect value={priority} onChange={setPriority} />
        <DeadlineSelect value={due} onChange={setDue} />
        <Combobox size="sm" value={client} onChange={setClient} options={clientOptions} searchPlaceholder="Имя или телефон клиента…" className="w-full sm:w-56" contentClassName="sm:min-w-80" stacked />
        {employees && onAssignee && (
          <Combobox
            size="sm"
            value={assignee ?? ''}
            onChange={onAssignee}
            placeholder="Кому"
            options={assigneeOptions(employees)}
            searchPlaceholder="Имя сотрудника…"
            className="w-full sm:w-64"
            contentClassName="sm:min-w-80" stacked
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="quick-task" className="sr-only">
          Новая задача
        </label>
        <input
          id="quick-task"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={placeholder}
          maxLength={300}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-full border bg-background px-4 text-[15px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" aria-label="Подробная форма: описание, гость" onClick={onMore}>
          <SlidersHorizontal />
        </Button>
        <Button type="submit" size="icon" disabled={!title.trim() || busy || (!!employees && !assignee)} aria-label="Добавить задачу" className="size-11 shrink-0 rounded-full">
          <SendHorizontal />
        </Button>
      </div>
    </form>
  )
}

/** Shared task state: load, tick, start, change, delete. */
function useTasks(url: string | null) {
  const [tasks, setTasks] = React.useState<Task[] | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    if (!url) return
    try {
      const res = await fetch(url)
      const data = await res.json()
      setTasks(res.ok && Array.isArray(data) ? data : [])
    } catch {
      setTasks(t => t ?? [])
    }
  }, [url])
  React.useEffect(() => {
    load()
  }, [load])

  const setStatus = async (task: Task, status: TaskStatus, message?: string) => {
    const prev = tasks
    setBusyId(task.id)
    setTasks(ts => ts?.map(t => (t.id === task.id ? { ...t, status } : t)) ?? ts)
    try {
      await send('PUT', { id: task.id, status })
      if (message) toast.success(message, { description: task.title })
    } catch (e) {
      setTasks(prev)
      toast.error('Не удалось обновить задачу', { description: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }
  return {
    tasks,
    setTasks,
    load,
    busyId,
    toggle: (t: Task) => setStatus(t, t.status === 'completed' ? 'todo' : 'completed', t.status === 'completed' ? undefined : 'Выполнено'),
    move: (t: Task, status: TaskStatus) => t.status !== status && setStatus(t, status, TASK_STATUS_LABEL[status]),
    start: (t: Task) => setStatus(t, 'in_progress', 'В работе'),
  }
}

/** Creates the task; «Всем сотрудникам» gives each of `team` their own copy. */
async function createTask(v: NewTaskValues, creatorId: string | null, due = todayISO(), team: EmployeeLite[] = []): Promise<boolean> {
  let title = v.title
  if (v.target_type === 'guest' && v.guest_name.trim()) title = `${v.title} (Гость: ${v.guest_name.trim()})`
  try {
    await send('POST', {
      ...(v.assignee_id === ALL_ASSIGNEES ? { assignee_ids: team.map(e => e.id) } : { assignee_id: v.assignee_id }),
      creator_id: creatorId,
      priority: v.priority ?? DEFAULT_PRIORITY,
      title,
      description: v.description,
      task_type: v.task_type,
      due_date: due,
      target_participant_id: v.target_type === 'participant' && v.target_participant_id !== 'none' ? v.target_participant_id : null,
    })
    return true
  } catch (e) {
    toast.error('Не удалось создать задачу', { description: (e as Error).message })
    return false
  }
}

function Progress({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter(t => t.status === 'completed').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  return (
    <div className="flex min-w-40 items-center gap-2.5">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Выполнено ${done} из ${tasks.length}`}>
        <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="num text-xs text-muted-foreground">
        {done} из {tasks.length}
      </span>
    </div>
  )
}

function TaskSkeleton() {
  return (
    <div className="space-y-2 p-1">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 p-1.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// «Задачи»: the team

/**
 * CRM → «Задачи» for the head and the admin: the team on the left like a chat list (active and
 * overdue counts), the selected person's tasks in the middle with a composer at the bottom,
 * and leave requests a tab away.
 */
export function TeamTasksPage() {
  const confirm = useConfirm()
  const [me, setMe] = React.useState<string | null>(null)
  const [employees, setEmployees] = React.useState<EmployeeLite[]>([])
  const [participants, setParticipants] = React.useState<ParticipantLite[]>([])
  const [leaves, setLeaves] = React.useState<LeaveRequest[] | null>(null)
  const [who, setWho] = React.useState<string>('all')
  const [assignee, setAssignee] = React.useState<string>('')
  const [tab, setTab] = React.useState<'tasks' | 'leaves'>('tasks')
  const [view, setView] = React.useState<View>('active')
  const [query, setQuery] = React.useState('')
  const [pane, setPane] = React.useState<'list' | 'tasks'>('list')
  const [selected, setSelected] = React.useState<Task | null>(null)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const { tasks, setTasks, load, busyId, toggle, start, move } = useTasks(`/api/employee/tasks?date=${todayISO()}&open=1`)
  const [layout, setLayout] = useLayout()

  React.useEffect(() => {
    setMe(readUser().id)
    Promise.all([fetch('/api/hr/employees').then(r => r.json()), fetch('/api/participants?limit=100').then(r => r.json())])
      .then(([emps, parts]) => {
        setEmployees(Array.isArray(emps) ? emps.filter((e: EmployeeLite) => e.status !== 'terminated') : [])
        setParticipants(Array.isArray(parts) ? parts : parts?.data || [])
      })
      .catch(() => {})
    fetch('/api/employee/leave-requests')
      .then(r => r.json())
      .then(d => setLeaves(Array.isArray(d) ? d : []))
      .catch(() => setLeaves([]))
  }, [])

  const names = React.useMemo(() => new Map(employees.map(e => [e.id, employeeName(e)])), [employees])
  const all = tasks ?? []
  const stats = (list: Task[]) => ({ active: list.filter(isActive).length, overdue: list.filter(isOverdue).length, done: list.filter(t => t.status === 'completed').length })
  const scoped = who === 'all' ? all : all.filter(t => t.assignee_id === who)
  const q = query.trim().toLowerCase()
  const visible = q ? scoped.filter(t => [t.title, t.description, t.target?.name, t.target?.phone, names.get(t.assignee_id)].some(v => v?.toLowerCase().includes(q))) : scoped
  const pending = (leaves ?? []).filter(l => l.status === 'pending')
  const current = who === 'all' ? null : employees.find(e => e.id === who) ?? null

  const pick = (id: string) => {
    setWho(id)
    setTab('tasks')
    setPane('tasks')
    if (id !== 'all') setAssignee(id)
  }

  const create = async (v: NewTaskValues, due?: string) => {
    const target = v.assignee_id || assignee
    if (!target) {
      toast.error('Выберите, кому задача')
      return false
    }
    const ok = await createTask({ ...v, assignee_id: target }, me, due, employees)
    if (ok) {
      toast.success('Задача поставлена', { description: `${v.title} · ${target === ALL_ASSIGNEES ? 'всем сотрудникам' : names.get(target) ?? ''}` })
      load()
    }
    return ok
  }

  const remove = async (t: Task) => {
    const ok = await confirm({ title: 'Удалить задачу?', description: `«${t.title}» исчезнет у сотрудника.`, confirmText: 'Удалить', destructive: true })
    if (!ok) return
    try {
      const res = await fetch(`/api/employee/tasks?id=${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
      setTasks(ts => ts?.filter(x => x.id !== t.id) ?? ts)
      setSelected(null)
      toast.success('Задача удалена')
    } catch (e) {
      toast.error('Не удалось удалить задачу', { description: (e as Error).message })
    }
  }

  const decide = async (r: LeaveRequest, status: LeaveStatus) => {
    try {
      await send('PUT', { id: r.id, status, approved_by: me }, '/api/employee/leave-requests')
      setLeaves(ls => ls?.map(l => (l.id === r.id ? { ...l, status } : l)) ?? ls)
      toast.success(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', { description: `${names.get(r.employee_id) ?? ''} · ${leaveTypeLabel(r.type)}` })
    } catch (e) {
      toast.error('Не удалось сохранить решение', { description: (e as Error).message })
    }
  }

  const teamRow = (id: string, name: string, sub: string, s: ReturnType<typeof stats>, icon?: React.ReactNode) => {
    const on = who === id && tab === 'tasks'
    return (
      <button
        key={id}
        type="button"
        onClick={() => pick(id)}
        aria-current={on || undefined}
        className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30', on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
      >
        {icon ?? <PersonAvatar name={name} seed={id} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{name}</span>
          <span className={cn('block truncate text-[13px]', on ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{sub}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {s.overdue > 0 && <span className={cn('num rounded-full px-1.5 text-[11px] font-bold', on ? 'bg-primary-foreground/25' : 'bg-destructive text-white')}>{s.overdue}</span>}
          <span className={cn('num text-xs', on ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
            {s.active} {plural(s.active, ['задача', 'задачи', 'задач'])}
          </span>
        </span>
      </button>
    )
  }

  const allStats = stats(all)
  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-r bg-card lg:flex lg:w-[22.5rem]', pane === 'tasks' && 'max-lg:hidden')}>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <ListChecks className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold">Задачи</h1>
            <p className="num text-xs text-muted-foreground">
              {tasks ? `${allStats.active} в работе · ${allStats.done} выполнено${allStats.overdue ? ` · ${allStats.overdue} просрочено` : ''}` : 'Загружаем…'}
            </p>
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <Segmented
            aria-label="Раздел"
            className="grid w-full grid-cols-2"
            value={tab}
            onChange={v => {
              setTab(v)
              setPane('tasks')
            }}
            options={[
              { value: 'tasks', label: 'Задачи' },
              { value: 'leaves', label: 'Отгулы', count: pending.length || undefined },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t p-1.5">
          {teamRow(
            'all',
            'Вся команда',
            `${employees.length} ${plural(employees.length, ['сотрудник', 'сотрудника', 'сотрудников'])}`,
            allStats,
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Users className="size-5" />
            </span>
          )}
          <h2 className="px-2.5 pt-3 pb-1 text-xs font-semibold text-muted-foreground">Сотрудники</h2>
          {employees.map(e => teamRow(e.id, employeeName(e), e.position || 'Сотрудник', stats(all.filter(t => t.assignee_id === e.id))))}
          {!employees.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Сотрудников пока нет: их заводят в «Персонал → Сотрудники»</p>}
        </div>
      </aside>

      <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40 lg:flex', pane === 'list' && 'max-lg:hidden')}>
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
          <Button type="button" variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="К списку" onClick={() => setPane('list')}>
            <ArrowLeft />
          </Button>
          {tab === 'tasks' ? (
            <>
              {current ? <PersonAvatar name={employeeName(current)} seed={current.id} size="sm" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{current ? employeeName(current) : 'Вся команда'}</p>
                <p className="truncate text-xs text-muted-foreground">{current?.position || 'Поручения на сегодня и всё, что не закрыто раньше'}</p>
              </div>
              <Progress tasks={scoped} />
              <LayoutSwitch value={layout} onChange={setLayout} />
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Заявки на отгул</p>
              <p className="text-xs text-muted-foreground">Отгулы, отпуска и больничные сотрудников</p>
            </div>
          )}
        </header>

        {tab === 'tasks' ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 sm:px-4">
              {layout === 'list' && (
                <Segmented
                  size="sm"
                  aria-label="Показать"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'active', label: 'Активные', count: scoped.filter(isActive).length },
                    { value: 'done', label: 'Выполненные', count: scoped.filter(t => !isActive(t)).length },
                    { value: 'all', label: 'Все' },
                  ]}
                />
              )}
              <SearchInput value={query} onChange={setQuery} placeholder="Задача, клиент или сотрудник" className="min-w-0 flex-[1_1_12rem] sm:max-w-72" />
            </div>
            {layout === 'board' && tasks !== null ? (
              <TaskBoard tasks={visible} names={who === 'all' ? names : undefined} onMove={move} onOpen={setSelected} />
            ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              {tasks === null ? (
                <TaskSkeleton />
              ) : (
                <TaskGroups
                  tasks={visible}
                  view={view}
                  names={who === 'all' ? names : undefined}
                  busyId={busyId}
                  onToggle={toggle}
                  onStart={start}
                  onOpen={setSelected}
                  empty={
                    <EmptyState
                      icon={view === 'done' ? CheckCheck : ListChecks}
                      title={q ? 'Ничего не найдено' : view === 'done' ? 'Пока ничего не выполнено' : current ? 'У сотрудника нет задач' : 'Задач пока нет'}
                      description={q ? undefined : 'Напишите задачу внизу и нажмите Enter — она сразу появится у сотрудника'}
                    />
                  }
                />
              )}
            </div>
            )}
            <QuickAdd
              participants={participants}
              employees={who === 'all' ? employees : undefined}
              assignee={who === 'all' ? assignee : who}
              onAssignee={setAssignee}
              placeholder={current ? `Задача для ${current.first_name}… Enter — поставить` : 'Новая задача… Enter — поставить'}
              onCreate={create}
              onMore={() => setMoreOpen(true)}
            />
          </>
        ) : (
          <LeaveList leaves={leaves} names={names} onDecide={decide} />
        )}
      </section>

      <NewTaskSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        participants={participants}
        employees={employees}
        defaultAssignee={who === 'all' ? assignee : who}
        description="Срок: сегодня. Задача сразу появится у сотрудника в «Моих задачах»"
        onCreate={async v => {
          const ok = await create(v)
          return ok
        }}
      />
      <TaskSheet
        task={selected}
        open={!!selected}
        onOpenChange={o => !o && setSelected(null)}
        assigneeName={selected ? names.get(selected.assignee_id) : undefined}
        employees={employees}
        onSaved={updated => {
          setTasks(ts => ts?.map(t => (t.id === updated.id ? { ...t, ...updated } : t)) ?? ts)
          setSelected(null)
        }}
        onDelete={remove}
      />
    </div>
  )
}

function LeaveList({ leaves, names, onDecide }: { leaves: LeaveRequest[] | null; names: Map<string, string>; onDecide: (r: LeaveRequest, s: LeaveStatus) => void }) {
  const [view, setView] = React.useState<'pending' | 'all'>('pending')
  const rows = (leaves ?? []).filter(l => view === 'all' || l.status === 'pending')
  return (
    <>
      <div className="border-b bg-card px-3 py-2 sm:px-4">
        <Segmented
          size="sm"
          aria-label="Показать заявки"
          value={view}
          onChange={setView}
          options={[
            { value: 'pending', label: 'Ждут решения', count: (leaves ?? []).filter(l => l.status === 'pending').length },
            { value: 'all', label: 'Все', count: (leaves ?? []).length },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {leaves === null ? (
          <TaskSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarOff} title={view === 'pending' ? 'Новых заявок нет' : 'Заявок пока нет'} description="Сотрудники отправляют заявки из «Моих задач»" />
        ) : (
          <ul className="space-y-2">
            {rows.map(r => {
              const name = names.get(r.employee_id) || 'Сотрудник'
              const st = LEAVE_STATUS[r.status]
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
                  <PersonAvatar name={name} seed={r.employee_id} size="sm" />
                  <div className="min-w-0 flex-[1_1_14rem]">
                    <p className="font-semibold">{name}</p>
                    <p className="num text-sm text-muted-foreground">
                      {leaveTypeLabel(r.type)} · {leaveRange(r)}
                    </p>
                    {r.reason && <p className="mt-0.5 line-clamp-2 text-sm">{r.reason}</p>}
                  </div>
                  {r.status === 'pending' ? (
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => onDecide(r, 'rejected')}>
                        <X /> Отклонить
                      </Button>
                      <Button size="sm" onClick={() => onDecide(r, 'approved')}>
                        <Check /> Одобрить
                      </Button>
                    </div>
                  ) : (
                    <span className={cn('ml-auto rounded-md px-2 py-0.5 text-xs font-semibold', r.status === 'approved' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>{st.label}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// «Мои задачи»: one employee

function LeavesBlock({ leaves, onNew }: { leaves: LeaveRequest[] | null; onNew: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Отгулы и отпуска</h2>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus /> Заявка
        </Button>
      </div>
      {leaves === null ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : leaves.length === 0 ? (
        <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Заявок пока нет. Нужен отгул или отпуск — отправьте заявку руководителю.</p>
      ) : (
        <ul className="space-y-1.5">
          {leaves.slice(0, 8).map(l => (
            <li key={l.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{leaveTypeLabel(l.type)}</span>
                <span className="num block text-xs text-muted-foreground">{leaveRange(l)}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                  l.status === 'approved' ? 'bg-success-soft text-success' : l.status === 'rejected' ? 'bg-destructive-soft text-destructive' : 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]'
                )}
              >
                {LEAVE_STATUS[l.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
}

/**
 * CRM → «Мои задачи»: today's list with a round tick per task and a composer at the bottom;
 * on the right the work-day timer and leave requests.
 */
export function MyTasksPage() {
  const [user, setUser] = React.useState<ReturnType<typeof readUser> | null>(null)
  const [participants, setParticipants] = React.useState<ParticipantLite[]>([])
  const [team, setTeam] = React.useState<EmployeeLite[]>([])
  const [assignee, setAssignee] = React.useState('')
  const [leaves, setLeaves] = React.useState<LeaveRequest[] | null>(null)
  const [view, setView] = React.useState<View>('active')
  const [selected, setSelected] = React.useState<Task | null>(null)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  React.useEffect(() => setUser(readUser()), [])
  const eid = user?.employeeId ?? null
  const { tasks, setTasks, load, busyId, toggle, start, move } = useTasks(eid ? `/api/employee/tasks?assignee_id=${eid}&date=${todayISO()}&open=1` : null)
  const [layout, setLayout] = useLayout()

  const loadLeaves = React.useCallback(() => {
    if (!eid) return
    fetch(`/api/employee/leave-requests?employee_id=${eid}`)
      .then(r => r.json())
      .then(d => setLeaves(Array.isArray(d) ? d : []))
      .catch(() => setLeaves([]))
  }, [eid])
  React.useEffect(() => {
    if (!eid) return
    loadLeaves()
    fetch('/api/participants?limit=100')
      .then(r => r.json())
      .then(d => setParticipants(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {})
    fetch('/api/employee/team')
      .then(r => r.json())
      .then(d => setTeam(Array.isArray(d) ? d : []))
      .catch(() => {})
    setAssignee(eid)
  }, [eid, loadLeaves])

  if (!user) return null
  if (!eid) {
    return <EmptyState className="m-auto h-full" icon={ListTodo} title="Аккаунт не связан с карточкой сотрудника" description="Попросите администратора связать вход с вашей карточкой в «Персонал → Сотрудники»" />
  }

  const all = tasks ?? []
  const firstName = (user.name || '').split(' ')[0]
  const teamName = (id: string) => {
    const e = team.find(x => x.id === id)
    return e ? employeeName(e) : ''
  }
  const create = async (v: NewTaskValues, due?: string) => {
    const target = v.assignee_id || assignee || eid
    const ok = await createTask({ ...v, assignee_id: target }, user.id, due, team)
    if (ok) {
      const whom = target === eid ? '' : target === ALL_ASSIGNEES ? ' · всем сотрудникам' : ` · ${teamName(target)}`
      toast.success(target === eid ? 'Задача добавлена' : 'Задача поставлена', { description: `${v.title}${whom}` })
      load()
    }
    return ok
  }
  // «Кому» lists me first as «Себе»
  const teamForPick: EmployeeLite[] = team.length
    ? [...team.filter(e => e.id === eid).map(e => ({ ...e, first_name: 'Себе', last_name: '', position: employeeName(e) })), ...team.filter(e => e.id !== eid)]
    : []

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40">
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{firstName ? `${greeting()}, ${firstName}` : 'Мои задачи'}</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <Progress tasks={all} />
          <LayoutSwitch value={layout} onChange={setLayout} />
        </header>
        <div className={cn('border-b bg-card px-3 py-2 sm:px-4', layout === 'board' && 'hidden')}>
          <Segmented
            size="sm"
            aria-label="Показать"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Активные', count: all.filter(isActive).length },
              { value: 'done', label: 'Выполненные', count: all.filter(t => !isActive(t)).length },
              { value: 'all', label: 'Все' },
            ]}
          />
        </div>
        {layout === 'board' && tasks !== null ? (
          <TaskBoard tasks={all} onMove={move} onOpen={setSelected} />
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          {/* Phones: the timer above the list */}
          <div className="mb-3 xl:hidden">
            <TimeTracker employeeId={eid} />
          </div>
          {tasks === null ? (
            <TaskSkeleton />
          ) : (
            <TaskGroups
              tasks={all}
              view={view}
              busyId={busyId}
              onToggle={toggle}
              onStart={start}
              onOpen={setSelected}
              empty={
                <EmptyState
                  icon={all.length ? CheckCheck : ListTodo}
                  title={all.length && view === 'active' ? 'Все задачи выполнены' : 'Задач нет'}
                  description={all.length && view === 'active' ? 'Отличная работа. Новые задачи появятся здесь.' : 'Добавьте звонок или дело на сегодня внизу'}
                />
              }
            />
          )}
          <div className="mt-5 border-t pt-4 xl:hidden">
            <LeavesBlock leaves={leaves} onNew={() => setLeaveOpen(true)} />
          </div>
        </div>
        )}
        <QuickAdd
          participants={participants}
          employees={teamForPick.length > 1 ? teamForPick : undefined}
          assignee={assignee}
          onAssignee={setAssignee}
          placeholder={assignee && assignee !== eid ? (assignee === ALL_ASSIGNEES ? 'Задача всем сотрудникам… Enter' : `Задача для ${teamName(assignee).split(' ')[0]}… Enter`) : 'Добавить себе задачу… Enter'}
          onCreate={create}
          onMore={() => setMoreOpen(true)}
        />
      </section>

      <aside aria-label="Рабочий день и отгулы" className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l bg-card p-4 xl:block">
        <TimeTracker employeeId={eid} />
        <LeavesBlock leaves={leaves} onNew={() => setLeaveOpen(true)} />
      </aside>

      <NewTaskSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        participants={participants}
        employees={teamForPick.length > 1 ? teamForPick : undefined}
        defaultAssignee={assignee || eid}
        onCreate={create}
      />
      <TaskSheet
        task={selected}
        open={!!selected}
        onOpenChange={o => !o && setSelected(null)}
        employees={team.length > 1 ? team : undefined}
        onSaved={updated => {
          // Handed to a colleague: it leaves my list
          setTasks(ts => (updated.assignee_id !== eid ? ts?.filter(t => t.id !== updated.id) : ts?.map(t => (t.id === updated.id ? { ...t, ...updated } : t))) ?? ts)
          setSelected(null)
        }}
      />
      <LeaveSheet open={leaveOpen} onOpenChange={setLeaveOpen} employeeId={eid} onSaved={loadLeaves} />
    </div>
  )
}

