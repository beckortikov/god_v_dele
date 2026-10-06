'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { CalendarOff, Check, ListChecks, MoreHorizontal, Plus, Trash2, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { StatStrip } from '@/components/erp/stat-strip'
import { Segmented } from '@/components/erp/segmented'
import { SearchInput } from '@/components/erp/search-input'
import { Combobox } from '@/components/erp/combobox'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import {
    Avatar,
    DueLabel,
    NewTaskSheet,
    STATUS_ORDER,
    TASK_STATUS,
    TaskSheet,
    employeeName,
    isOverdue,
    taskType,
    type EmployeeLite,
    type NewTaskValues,
    type ParticipantLite,
    type Task,
    type TaskStatus,
} from './task-parts'
import { LEAVE_STATUS, LeaveStatusBadge, leaveRange, leaveTypeLabel, type LeaveRequest, type LeaveStatus } from './leave-parts'

type Tab = 'tasks' | 'leaves'
type Column = 'todo' | 'in_progress' | 'done'

const PREFS_KEY = 'manager-dashboard-prefs'
const LAST_ASSIGNEE_KEY = 'manager-last-assignee'

function readLastAssignee() {
    try {
        return localStorage.getItem(LAST_ASSIGNEE_KEY) || ''
    } catch {
        return ''
    }
}

const COLUMNS: { id: Column; title: string; statuses: TaskStatus[] }[] = [
    { id: 'todo', title: 'К выполнению', statuses: ['todo'] },
    { id: 'in_progress', title: 'В работе', statuses: ['in_progress'] },
    { id: 'done', title: 'Завершено', statuses: ['completed', 'cancelled'] },
]

function readPrefs(): { tab?: Tab; employee?: string } {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    } catch {
        return {}
    }
}

function writePrefs(p: { tab: Tab; employee: string }) {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {}
}

export function ManagerDashboard() {
    const confirm = useConfirm()

    const [employees, setEmployees] = useState<EmployeeLite[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [participants, setParticipants] = useState<ParticipantLite[]>([])
    const [leaves, setLeaves] = useState<LeaveRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string>('')

    // View state
    const [tab, setTab] = useState<Tab>('tasks')
    const [employeeFilter, setEmployeeFilter] = useState<string>('all')
    const [query, setQuery] = useState('')
    const [mobileColumn, setMobileColumn] = useState<Column>('todo')
    const [leaveView, setLeaveView] = useState<'pending' | 'all'>('pending')
    const [prefsLoaded, setPrefsLoaded] = useState(false)

    // Sheets
    const [newTaskOpen, setNewTaskOpen] = useState(false)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [taskOpen, setTaskOpen] = useState(false)

    useEffect(() => {
        // The creator is the signed-in app user (stored at login as `user`)
        let id = ''
        try {
            id = JSON.parse(localStorage.getItem('user') || '{}').id || ''
        } catch {}
        setUserId(id || localStorage.getItem('userId') || '')
        const p = readPrefs()
        if (p.tab) setTab(p.tab)
        if (p.employee) setEmployeeFilter(p.employee)
        setPrefsLoaded(true)
        fetchData()
    }, [])

    useEffect(() => {
        if (prefsLoaded) writePrefs({ tab, employee: employeeFilter })
    }, [tab, employeeFilter, prefsLoaded])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [empRes, partRes] = await Promise.all([
                fetch('/api/hr/employees'),
                fetch('/api/participants?limit=100') // fetch some participants to assign
            ])
            const empData = await empRes.json()
            const partData = await partRes.json()

            if (empRes.ok) setEmployees(empData)
            if (partRes.ok) setParticipants(Array.isArray(partData) ? partData : partData.data || partData.participants || [])
        } catch (error) {
            console.error('Error fetching data:', error)
        }
        await Promise.all([fetchTasks(), fetchLeaves()])
        setLoading(false)
    }

    /** All tasks due today or earlier, for every employee; filtered on the client. */
    const fetchTasks = async () => {
        try {
            const today = new Date().toISOString().split('T')[0]
            const res = await fetch(`/api/employee/tasks?date=${today}`)
            const data = await res.json()
            if (res.ok && Array.isArray(data)) {
                setTasks(data)
            }
        } catch (error) {
            console.error('Error fetching tasks:', error)
        }
    }

    const fetchLeaves = async () => {
        try {
            const res = await fetch('/api/employee/leave-requests')
            const data = await res.json()
            if (res.ok && Array.isArray(data)) setLeaves(data)
        } catch (error) {
            console.error('Error fetching leave requests:', error)
        }
    }

    const handleCreateTask = async (newTask: NewTaskValues) => {
        const assigneeId = newTask.assignee_id
        if (!assigneeId) {
            toast.error('Сначала выберите сотрудника')
            return false
        }

        let taskTitle = newTask.title
        let targetId: string | null =
            newTask.target_participant_id === 'none' || !newTask.target_participant_id ? null : newTask.target_participant_id

        if (newTask.target_type === 'guest') {
            taskTitle = `${newTask.title} (Гость: ${newTask.guest_name})`
            targetId = null
        } else if (newTask.target_type === 'none') {
            targetId = null
        }

        const payload = {
            assignee_id: assigneeId,
            creator_id: userId || null,
            title: taskTitle,
            description: newTask.description,
            target_participant_id: targetId,
            due_date: new Date().toISOString().split('T')[0],
            task_type: newTask.task_type
        }

        try {
            const res = await fetch('/api/employee/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            if (res.ok) {
                const emp = employees.find(e => e.id === assigneeId)
                try {
                    localStorage.setItem(LAST_ASSIGNEE_KEY, assigneeId)
                } catch {}
                toast.success('Задача поставлена', { description: `${taskTitle} · ${employeeName(emp)}` })
                fetchTasks()
                return true
            }
            const err = await res.json().catch(() => ({}))
            toast.error('Не удалось создать задачу', { description: err.error })
            return false
        } catch (error) {
            console.error('Error creating task:', error)
            toast.error('Не удалось создать задачу', { description: 'Сервер не ответил, попробуйте ещё раз' })
            return false
        }
    }

    const handleDeleteTask = async (task: Task) => {
        const ok = await confirm({
            title: 'Удалить задачу?',
            description: `«${task.title}» исчезнет у сотрудника. Это действие нельзя отменить.`,
            confirmText: 'Удалить',
            destructive: true,
        })
        if (!ok) return

        try {
            const res = await fetch(`/api/employee/tasks?id=${task.id}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                setTasks(ts => ts.filter(t => t.id !== task.id))
                setTaskOpen(false)
                toast.success('Задача удалена')
            } else {
                const err = await res.json().catch(() => ({}))
                toast.error('Не удалось удалить задачу', { description: err.error })
            }
        } catch (error) {
            console.error('Error deleting task', error)
            toast.error('Не удалось удалить задачу', { description: 'Сервер не ответил, попробуйте ещё раз' })
        }
    }

    const changeStatus = async (task: Task, status: TaskStatus) => {
        if (task.status === status) return
        const prev = tasks
        setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, status } : t)))
        try {
            const res = await fetch('/api/employee/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status })
            })
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
            toast.success(`Статус: ${TASK_STATUS[status].label.toLowerCase()}`, { description: task.title })
        } catch (err: any) {
            setTasks(prev)
            toast.error('Не удалось сменить статус', { description: err.message })
        }
    }

    const decideLeave = async (req: LeaveRequest, status: LeaveStatus) => {
        try {
            const res = await fetch('/api/employee/leave-requests', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: req.id, status, approved_by: userId || null })
            })
            const result = await res.json().catch(() => ({}))
            if (!res.ok || result.error) throw new Error(result.error)
            setLeaves(ls => ls.map(l => (l.id === req.id ? { ...l, status } : l)))
            toast.success(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена', {
                description: `${employeeName(empById.get(req.employee_id))} · ${leaveTypeLabel(req.type)}`,
            })
        } catch (err: any) {
            toast.error('Не удалось сохранить решение', { description: err.message })
        }
    }

    // -----------------------------------------------------------------------

    const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

    const employeeOptions = useMemo(
        () => [
            { value: 'all', label: 'Все сотрудники' },
            ...employees.map(e => ({ value: e.id, label: employeeName(e), hint: e.position || undefined })),
        ],
        [employees]
    )

    const scoped = useMemo(
        () => (employeeFilter === 'all' ? tasks : tasks.filter(t => t.assignee_id === employeeFilter)),
        [tasks, employeeFilter]
    )

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return scoped
        return scoped.filter(t =>
            [t.title, t.description, t.target?.name, t.target?.phone, employeeName(empById.get(t.assignee_id))]
                .filter(Boolean)
                .some(s => String(s).toLowerCase().includes(q))
        )
    }, [scoped, query, empById])

    const counts = useMemo(() => {
        const c = { todo: 0, in_progress: 0, completed: 0, cancelled: 0, overdue: 0 }
        for (const t of scoped) {
            c[t.status] = (c[t.status] ?? 0) + 1
            if (isOverdue(t)) c.overdue++
        }
        return c
    }, [scoped])

    const donePct = scoped.length ? Math.round((counts.completed / scoped.length) * 100) : 0
    const pendingLeaves = leaves.filter(l => l.status === 'pending').length
    const showAssignee = employeeFilter === 'all'

    const openTask = (t: Task) => {
        setSelectedTask(t)
        setTaskOpen(true)
    }

    const columnTasks = (col: (typeof COLUMNS)[number]) =>
        visible
            .filter(t => col.statuses.includes(t.status))
            .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)))

    return (
        <PageContainer>
            <PageHeader
                title="Задачи сотрудников"
                description="Поручения на сегодня и всё, что не закрыто раньше"
                actions={
                    <>
                        <Combobox
                            size="sm"
                            value={employeeFilter}
                            onChange={setEmployeeFilter}
                            options={employeeOptions}
                            searchPlaceholder="Имя сотрудника…"
                            className="w-full sm:w-56"
                        />
                        <Button size="sm" onClick={() => setNewTaskOpen(true)} className="max-sm:flex-1">
                            <Plus /> Новая задача
                        </Button>
                    </>
                }
            />

            <StatStrip
                loading={loading}
                className="grid-cols-2"
                stats={[
                    { label: 'К выполнению', value: counts.todo, sub: 'ещё не начаты', onClick: () => { setTab('tasks'); setMobileColumn('todo') } },
                    { label: 'В работе', value: counts.in_progress, sub: 'сотрудники занимаются', onClick: () => { setTab('tasks'); setMobileColumn('in_progress') } },
                    {
                        label: 'Просрочено',
                        value: counts.overdue,
                        tone: counts.overdue ? 'destructive' : 'default',
                        sub: counts.overdue ? 'не закрыты в срок' : 'всё в срок',
                    },
                    {
                        label: 'Выполнено',
                        value: counts.completed,
                        sub: scoped.length ? `${donePct}% от ${scoped.length} ${plural(scoped.length, ['задачи', 'задач', 'задач'])}` : 'задач пока нет',
                        tone: counts.completed ? 'success' : 'default',
                        onClick: () => { setTab('tasks'); setMobileColumn('done') },
                    },
                ]}
            />

            <div className="mt-6 mb-3 overflow-x-auto scrollbar-none">
                <Segmented
                    aria-label="Раздел"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'tasks', label: 'Задачи', count: loading ? undefined : visible.length },
                        { value: 'leaves', label: 'Заявки на отгул', count: loading ? undefined : pendingLeaves },
                    ]}
                />
            </div>

            {tab === 'tasks' ? (
                <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <SearchInput value={query} onChange={setQuery} placeholder="Задача, участник или сотрудник" className="sm:w-80" />
                        <div className="w-full overflow-x-auto scrollbar-none lg:hidden">
                            <Segmented
                                size="sm"
                                aria-label="Статус"
                                value={mobileColumn}
                                onChange={setMobileColumn}
                                options={COLUMNS.map(c => ({ value: c.id, label: c.title, count: loading ? undefined : columnTasks(c).length }))}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid gap-3 lg:grid-cols-3">
                            {COLUMNS.map(c => (
                                <div key={c.id} className={cn('space-y-2 rounded-xl bg-muted/50 p-2', c.id !== 'todo' && 'max-lg:hidden')}>
                                    <Skeleton className="m-1.5 h-4 w-28" />
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <Skeleton key={i} className="h-20 w-full rounded-lg bg-card" />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : scoped.length === 0 ? (
                        <Panel>
                            <EmptyState
                                icon={ListChecks}
                                title={employeeFilter === 'all' ? 'Задач пока нет' : 'У сотрудника нет задач'}
                                description="Поставьте задачу: она появится в кабинете сотрудника на сегодня"
                                action={<Button size="sm" onClick={() => setNewTaskOpen(true)}><Plus /> Новая задача</Button>}
                            />
                        </Panel>
                    ) : (
                        <div className="grid items-start gap-3 lg:grid-cols-3">
                            {COLUMNS.map(col => {
                                const items = columnTasks(col)
                                return (
                                    <section
                                        key={col.id}
                                        aria-label={col.title}
                                        className={cn('rounded-xl bg-muted/50 p-2', mobileColumn !== col.id && 'max-lg:hidden')}
                                    >
                                        <header className="flex items-center justify-between px-1.5 pt-1 pb-2.5 max-lg:hidden">
                                            <h3 className="text-sm font-medium">{col.title}</h3>
                                            <span className="num text-xs text-muted-foreground">{items.length}</span>
                                        </header>
                                        {items.length === 0 ? (
                                            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                                                {query ? 'Ничего не найдено' : 'Пусто'}
                                            </p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {items.map(task => (
                                                    <TaskTile
                                                        key={task.id}
                                                        task={task}
                                                        assignee={showAssignee ? employeeName(empById.get(task.assignee_id)) || 'Сотрудник' : undefined}
                                                        onOpen={() => openTask(task)}
                                                        onStatus={s => changeStatus(task, s)}
                                                        onDelete={() => handleDeleteTask(task)}
                                                    />
                                                ))}
                                            </ul>
                                        )}
                                    </section>
                                )
                            })}
                        </div>
                    )}
                </>
            ) : (
                <LeavesPanel
                    loading={loading}
                    leaves={leaves}
                    view={leaveView}
                    onViewChange={setLeaveView}
                    employeeFilter={employeeFilter}
                    empById={empById}
                    onDecide={decideLeave}
                />
            )}

            <NewTaskSheet
                open={newTaskOpen}
                onOpenChange={setNewTaskOpen}
                participants={participants}
                employees={employees}
                defaultAssignee={employeeFilter === 'all' ? (newTaskOpen && empById.has(readLastAssignee()) ? readLastAssignee() : '') : employeeFilter}
                description="Срок: сегодня. Задача сразу появится в кабинете сотрудника"
                onCreate={handleCreateTask}
            />
            <TaskSheet
                task={selectedTask}
                open={taskOpen}
                onOpenChange={setTaskOpen}
                assigneeName={selectedTask ? employeeName(empById.get(selectedTask.assignee_id)) : undefined}
                onSaved={updated => setTasks(ts => ts.map(t => (t.id === updated.id ? updated : t)))}
                onDelete={handleDeleteTask}
            />
        </PageContainer>
    )
}

// ---------------------------------------------------------------------------

function TaskTile({
    task,
    assignee,
    onOpen,
    onStatus,
    onDelete,
}: {
    task: Task
    assignee?: string
    onOpen: () => void
    onStatus: (s: TaskStatus) => void
    onDelete: () => void
}) {
    const type = taskType(task.task_type)
    const TypeIcon = type.icon
    const finished = task.status === 'completed' || task.status === 'cancelled'
    const status = TASK_STATUS[task.status] ?? TASK_STATUS.todo

    return (
        <li
            className="group cursor-pointer rounded-lg border bg-card p-3 shadow-xs transition-[border-color,box-shadow] hover:border-ring/40"
            onClick={onOpen}
        >
            <div className="flex items-start gap-2">
                <TypeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={type.label} />
                <p className={cn('min-w-0 flex-1 text-sm leading-snug font-medium', finished && 'text-muted-foreground')}>
                    {task.title}
                </p>
            </div>

            {(task.description || task.target) && (
                <div className="mt-1.5 space-y-1 pl-6 text-xs text-muted-foreground">
                    {task.target && (
                        <p className="flex items-center gap-1.5 truncate">
                            <User className="size-3.5 shrink-0" />
                            <span className="truncate">{task.target.name}</span>
                            {task.target.phone && <span className="num shrink-0">· {task.target.phone}</span>}
                        </p>
                    )}
                    {task.description && <p className="line-clamp-2">{task.description}</p>}
                </div>
            )}

            {task.result_comment && (
                <p className="mt-2 ml-6 line-clamp-2 rounded-md bg-muted px-2 py-1.5 text-xs text-foreground/80">{task.result_comment}</p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-6" onClick={e => e.stopPropagation()}>
                {assignee && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Avatar name={assignee} className="size-5 text-[9px]" />
                        <span className="truncate">{assignee}</span>
                    </span>
                )}
                <DueLabel task={task} className="text-xs whitespace-nowrap" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label={`Статус: ${status.label}. Изменить`}
                            className={cn(
                                'ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                                task.status === 'todo' && 'bg-secondary text-secondary-foreground hover:bg-accent',
                                task.status === 'in_progress' && 'bg-info-soft text-info hover:bg-info-soft/70',
                                task.status === 'completed' && 'bg-success-soft text-success hover:bg-success-soft/70',
                                task.status === 'cancelled' && 'border text-muted-foreground hover:bg-accent'
                            )}
                        >
                            {status.label}
                            <MoreHorizontal className="size-3.5 opacity-60" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Статус</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={task.status} onValueChange={v => onStatus(v as TaskStatus)}>
                            {STATUS_ORDER.map(s => (
                                <DropdownMenuRadioItem key={s} value={s}>
                                    {TASK_STATUS[s].label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                            <Trash2 /> Удалить
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </li>
    )
}

function LeavesPanel({
    loading,
    leaves,
    view,
    onViewChange,
    employeeFilter,
    empById,
    onDecide,
}: {
    loading: boolean
    leaves: LeaveRequest[]
    view: 'pending' | 'all'
    onViewChange: (v: 'pending' | 'all') => void
    employeeFilter: string
    empById: Map<string, EmployeeLite>
    onDecide: (r: LeaveRequest, s: LeaveStatus) => void
}) {
    const scoped = employeeFilter === 'all' ? leaves : leaves.filter(l => l.employee_id === employeeFilter)
    const pending = scoped.filter(l => l.status === 'pending')
    const rows = view === 'pending' ? pending : scoped

    return (
        <Panel>
            <PanelToolbar>
                <Segmented
                    size="sm"
                    aria-label="Показать заявки"
                    value={view}
                    onChange={onViewChange}
                    options={[
                        { value: 'pending', label: LEAVE_STATUS.pending.label, count: loading ? undefined : pending.length },
                        { value: 'all', label: 'Все', count: loading ? undefined : scoped.length },
                    ]}
                />
            </PanelToolbar>
            {loading ? (
                <div className="divide-y">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-4 flex-1" />
                        </div>
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={CalendarOff}
                    title={view === 'pending' ? 'Новых заявок нет' : 'Заявок пока нет'}
                    description="Сотрудники отправляют заявки на отгул, отпуск и больничный из своего кабинета"
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Сотрудник</TableHead>
                            <TableHead className="max-sm:hidden">Период</TableHead>
                            <TableHead className="max-md:hidden">Причина</TableHead>
                            <TableHead className="text-right">Решение</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(r => {
                            const name = employeeName(empById.get(r.employee_id)) || 'Сотрудник'
                            return (
                                <TableRow key={r.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <Avatar name={name} className="size-7 text-[11px]" />
                                            <div className="min-w-0">
                                                <div className="font-medium">{name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {leaveTypeLabel(r.type)}
                                                    <span className="sm:hidden"> · {leaveRange(r)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="num text-muted-foreground max-sm:hidden">{leaveRange(r)}</TableCell>
                                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground max-md:hidden">
                                        <span className="line-clamp-2">{r.reason}</span>
                                        {r.created_at && <span className="num text-xs">подана {formatDate(r.created_at)}</span>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {r.status === 'pending' ? (
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button size="sm" variant="outline" onClick={() => onDecide(r, 'rejected')} aria-label="Отклонить">
                                                    <X /> <span className="max-sm:hidden">Отклонить</span>
                                                </Button>
                                                <Button size="sm" onClick={() => onDecide(r, 'approved')} aria-label="Одобрить">
                                                    <Check /> <span className="max-sm:hidden">Одобрить</span>
                                                </Button>
                                            </div>
                                        ) : (
                                            <LeaveStatusBadge status={r.status} />
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            )}
        </Panel>
    )
}
