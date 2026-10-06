'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, CalendarOff, CheckCheck, ListTodo, Phone, Plus, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { TimeTracker } from './time-tracker'
import {
    DueLabel,
    NewTaskSheet,
    TaskSheet,
    TaskStatusBadge,
    taskType,
    type NewTaskValues,
    type ParticipantLite,
    type Task,
} from './task-parts'
import { LeaveSheet, LeaveStatusBadge, leaveRange, leaveTypeLabel, type LeaveRequest } from './leave-parts'

type TaskView = 'active' | 'done' | 'all'

function greeting() {
    const h = new Date().getHours()
    if (h < 5) return 'Доброй ночи'
    if (h < 12) return 'Доброе утро'
    if (h < 18) return 'Добрый день'
    return 'Добрый вечер'
}

export function EmployeeDashboard() {
    const [ready, setReady] = useState(false)
    const [employeeId, setEmployeeId] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [position, setPosition] = useState<string | null>(null)
    const [employeeName, setEmployeeName] = useState<string | null>(null)
    const [appFullName, setAppFullName] = useState<string | null>(null)
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [participants, setParticipants] = useState<ParticipantLite[]>([])
    const [leaves, setLeaves] = useState<LeaveRequest[]>([])
    const [leavesLoading, setLeavesLoading] = useState(true)

    const [view, setView] = useState<TaskView>('active')
    const [newTaskOpen, setNewTaskOpen] = useState(false)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [taskOpen, setTaskOpen] = useState(false)
    const [leaveOpen, setLeaveOpen] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)

    useEffect(() => {
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser)
                setEmployeeId(user.employee_id || null)
                setUserId(user.id || null)
                setPosition(user.position || null)
                setEmployeeName(user.employee_name || null)
                setAppFullName(user.full_name || null)
            } catch (e) {
                console.error('Error parsing user data', e)
            }
        }
        setReady(true)
    }, [])

    const fetchTasksAndParticipants = async () => {
        if (employeeId) {
            try {
                const today = new Date().toISOString().split('T')[0]
                const [tasksRes, partRes] = await Promise.all([
                    fetch(`/api/employee/tasks?assignee_id=${employeeId}&date=${today}`),
                    fetch(`/api/participants?limit=100`) // Only fetch some or add a search API
                ])
                if (tasksRes.ok) {
                    const data = await tasksRes.json()
                    setTasks(data || [])
                }
                if (partRes.ok) {
                    const partData = await partRes.json()
                    setParticipants(partData.data || partData || [])
                }
            } catch (err) {
                console.error('Error fetching data', err)
            } finally {
                setLoading(false)
            }
        }
    }

    const fetchLeaves = async () => {
        if (!employeeId) return
        try {
            const res = await fetch(`/api/employee/leave-requests?employee_id=${employeeId}`)
            const data = await res.json()
            if (res.ok && Array.isArray(data)) setLeaves(data)
        } catch (err) {
            console.error('Error fetching leave requests', err)
        } finally {
            setLeavesLoading(false)
        }
    }

    useEffect(() => {
        fetchTasksAndParticipants()
        fetchLeaves()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId])

    const handleCreateTask = async (newTask: NewTaskValues) => {
        try {
            let finalTitle = newTask.title;
            if (newTask.target_type === 'guest' && newTask.guest_name.trim() !== '') {
                finalTitle = `${newTask.title} (Гость: ${newTask.guest_name})`;
            }

            const bodyData: any = {
                assignee_id: employeeId,
                creator_id: userId,
                title: finalTitle,
                description: newTask.description,
                task_type: newTask.task_type,
                due_date: new Date().toISOString().split('T')[0] // Today
            }

            if (newTask.target_type === 'participant' && newTask.target_participant_id !== 'none') {
                bodyData.target_participant_id = newTask.target_participant_id;
            }

            const res = await fetch('/api/employee/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            })

            if (res.ok) {
                toast.success('Задача добавлена', { description: finalTitle })
                fetchTasksAndParticipants()
                return true
            }
            const err = await res.json().catch(() => ({}))
            toast.error('Не удалось создать задачу', { description: err.error })
            return false
        } catch (error) {
            console.error('Failed to create task', error)
            toast.error('Не удалось создать задачу', { description: 'Проверьте соединение и попробуйте ещё раз' })
            return false
        }
    }

    /** One-tap checkbox: done ↔ back to work. Sends only the status. */
    const toggleDone = async (task: Task) => {
        const next = task.status === 'completed' ? 'todo' : 'completed'
        const prev = tasks
        setBusyId(task.id)
        setTasks(ts => ts.map(t => (t.id === task.id ? { ...t, status: next } : t)))
        try {
            const res = await fetch('/api/employee/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status: next })
            })
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
            if (next === 'completed') toast.success('Задача выполнена', { description: task.title })
        } catch (err: any) {
            setTasks(prev)
            toast.error('Не удалось обновить задачу', { description: err.message })
        } finally {
            setBusyId(null)
        }
    }

    const openTask = (task: Task) => {
        setSelectedTask(task)
        setTaskOpen(true)
    }

    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const totalTasks = tasks.length
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    const activeTasks = useMemo(() => tasks.filter(t => t.status === 'todo' || t.status === 'in_progress'), [tasks])
    const doneTasks = useMemo(() => tasks.filter(t => t.status === 'completed' || t.status === 'cancelled'), [tasks])
    const visible = view === 'active' ? activeTasks : view === 'done' ? doneTasks : tasks
    // In-progress first, then to-do; the API already sorts by due date
    const sorted = useMemo(
        () => [...visible].sort((a, b) => (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1)),
        [visible]
    )

    if (!ready) return null

    if (!employeeId) {
        return (
            <PageContainer>
                <PageHeader title="Мой кабинет" />
                <Panel>
                    <EmptyState
                        icon={UserX}
                        title="Аккаунт не связан с карточкой сотрудника"
                        description="Попросите администратора привязать вашу учётную запись к профилю сотрудника. После этого здесь появятся задачи и учёт времени."
                    />
                </Panel>
            </PageContainer>
        )
    }

    const name = employeeName || appFullName
    const firstName = name?.split(' ')[0]
    const todayLong = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

    return (
        <PageContainer>
            <PageHeader
                title={firstName ? `${greeting()}, ${firstName}` : 'Мой кабинет'}
                description={
                    <>
                        {position && <>{position} · </>}
                        <span className="first-letter:uppercase">{todayLong}</span>
                    </>
                }
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-5">
                {/* Time tracker: first on phones, top right on desktop */}
                <div className="lg:col-start-2 lg:row-start-1">
                    <TimeTracker employeeId={employeeId} />
                </div>

                {/* Tasks */}
                <Panel className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
                    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
                        <div className="min-w-0">
                            <h2 className="font-semibold">Мои задачи</h2>
                            <p className="num mt-0.5 text-sm text-muted-foreground">
                                {loading
                                    ? 'Загружаем…'
                                    : totalTasks
                                        ? `Выполнено ${completedTasks} из ${totalTasks}`
                                        : 'На сегодня ничего не запланировано'}
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setNewTaskOpen(true)}>
                            <Plus /> Задача
                        </Button>
                    </div>
                    <div className="mx-4 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-success transition-[width] duration-500 ease-[var(--ease-out)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="mt-3 overflow-x-auto border-b px-4 pb-3 scrollbar-none">
                        <Segmented
                            size="sm"
                            aria-label="Показать задачи"
                            value={view}
                            onChange={setView}
                            options={[
                                { value: 'active', label: 'Активные', count: loading ? undefined : activeTasks.length },
                                { value: 'done', label: 'Завершённые', count: loading ? undefined : doneTasks.length },
                                { value: 'all', label: 'Все', count: loading ? undefined : tasks.length },
                            ]}
                        />
                    </div>

                    {loading ? (
                        <div className="divide-y">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                                    <Skeleton className="size-6 rounded-full" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-2/3" />
                                        <Skeleton className="h-3 w-1/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : sorted.length === 0 ? (
                        view === 'active' && totalTasks > 0 ? (
                            <EmptyState icon={CheckCheck} title="Все задачи выполнены" description="Отличная работа. Новые задачи появятся здесь." />
                        ) : (
                            <EmptyState
                                icon={ListTodo}
                                title={view === 'done' ? 'Пока ничего не завершено' : 'Задач нет'}
                                description={view === 'done' ? 'Отмечайте задачи кружком слева, когда закончите' : 'Добавьте звонок или дело на сегодня'}
                                action={view !== 'done' && <Button size="sm" variant="outline" onClick={() => setNewTaskOpen(true)}><Plus /> Задача</Button>}
                            />
                        )
                    ) : (
                        <ul className="divide-y">
                            {sorted.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    busy={busyId === task.id}
                                    onToggle={() => toggleDone(task)}
                                    onOpen={() => openTask(task)}
                                />
                            ))}
                        </ul>
                    )}
                </Panel>

                {/* Leave requests */}
                <Panel className="lg:col-start-2 lg:row-start-2">
                    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                        <h2 className="font-semibold">Отгулы и отпуска</h2>
                        <Button size="sm" variant="outline" onClick={() => setLeaveOpen(true)}>
                            <Plus /> Заявка
                        </Button>
                    </div>
                    {leavesLoading ? (
                        <div className="space-y-2 p-4">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    ) : leaves.length === 0 ? (
                        <EmptyState
                            className="py-8"
                            icon={CalendarOff}
                            title="Заявок пока нет"
                            description="Нужен отгул или отпуск? Отправьте заявку руководителю."
                        />
                    ) : (
                        <ul className="divide-y">
                            {leaves.map(l => (
                                <li key={l.id} className="px-4 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium">{leaveTypeLabel(l.type)}</span>
                                        <LeaveStatusBadge status={l.status} />
                                    </div>
                                    <p className="num mt-0.5 text-xs text-muted-foreground">{leaveRange(l)}</p>
                                    {l.reason && <p className="mt-1 line-clamp-2 text-sm text-foreground/80">{l.reason}</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            <NewTaskSheet
                open={newTaskOpen}
                onOpenChange={setNewTaskOpen}
                participants={participants}
                description="Задача появится в вашем списке на сегодня"
                onCreate={handleCreateTask}
            />
            <TaskSheet
                task={selectedTask}
                open={taskOpen}
                onOpenChange={setTaskOpen}
                onSaved={updated => setTasks(ts => ts.map(t => (t.id === updated.id ? updated : t)))}
            />
            <LeaveSheet open={leaveOpen} onOpenChange={setLeaveOpen} employeeId={employeeId} onSaved={fetchLeaves} />
        </PageContainer>
    )
}

function TaskRow({ task, busy, onToggle, onOpen }: { task: Task; busy: boolean; onToggle: () => void; onOpen: () => void }) {
    const done = task.status === 'completed'
    const cancelled = task.status === 'cancelled'
    const type = taskType(task.task_type)
    const TypeIcon = type.icon
    const phone = task.target?.phone

    return (
        <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
            <button
                type="button"
                onClick={onToggle}
                disabled={busy || cancelled}
                aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
                aria-pressed={done}
                className={cn(
                    // 44px hit area on phones, 24px circle
                    'relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors outline-none before:absolute before:-inset-2.5 focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50',
                    done
                        ? 'border-success bg-success text-background'
                        : 'border-muted-foreground/40 text-transparent hover:border-success hover:text-success'
                )}
            >
                <Check className="size-3.5" strokeWidth={3} />
            </button>

            <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
                <p className={cn('text-[15px] leading-snug font-medium sm:text-sm', (done || cancelled) && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                    {task.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <TypeIcon className="size-3.5" /> {type.label}
                    </span>
                    {task.target && <span className="truncate">· {task.target.name}</span>}
                    <DueLabel task={task} />
                </p>
                {task.result_comment && <p className="mt-1 line-clamp-1 text-xs text-foreground/70">{task.result_comment}</p>}
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
                {task.status !== 'todo' && !done && <TaskStatusBadge status={task.status} />}
                {phone && !done && !cancelled && (
                    <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
                        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Позвонить: ${phone}`}>
                            <Phone />
                        </a>
                    </Button>
                )}
            </div>
        </li>
    )
}
