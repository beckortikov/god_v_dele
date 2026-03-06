'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeTracker } from './time-tracker'
import { PhoneCall, Calendar, Tag, User, Plus } from 'lucide-react'

export function EmployeeDashboard() {
    const [employeeId, setEmployeeId] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [position, setPosition] = useState<string | null>(null)
    const [employeeName, setEmployeeName] = useState<string | null>(null)
    const [appFullName, setAppFullName] = useState<string | null>(null)
    const [tasks, setTasks] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

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
    }, [])

    const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        task_type: 'call',
        target_type: 'participant', // 'participant' or 'guest'
        target_participant_id: 'none',
        guest_name: ''
    })
    const [participants, setParticipants] = useState<any[]>([])

    // Состояния для просмотра и обновления задачи
    const [selectedTask, setSelectedTask] = useState<any | null>(null)
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
    const [taskStatus, setTaskStatus] = useState<string>('todo')
    const [taskComment, setTaskComment] = useState<string>('')

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

    useEffect(() => {
        fetchTasksAndParticipants()
    }, [employeeId])

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault()
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
                setIsTaskDialogOpen(false)
                setNewTask({ title: '', description: '', task_type: 'call', target_type: 'participant', target_participant_id: 'none', guest_name: '' })
                fetchTasksAndParticipants()
            }
        } catch (error) {
            console.error('Failed to create task', error)
        }
    }

    const handleUpdateTask = async () => {
        if (!selectedTask) return
        try {
            const res = await fetch('/api/employee/tasks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedTask.id,
                    status: taskStatus,
                    result_comment: taskComment
                })
            })

            if (res.ok) {
                setIsViewDialogOpen(false)
                fetchTasksAndParticipants()
            }
        } catch (error) {
            console.error('Failed to update task', error)
        }
    }

    if (!employeeId) {
        return (
            <div className="p-6">
                <Card className="p-6 bg-destructive/5 text-destructive border-destructive">
                    <p>Ваш аккаунт не привязан к профилю сотрудника. Обратитесь к администратору.</p>
                </Card>
            </div>
        )
    }

    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const totalTasks = tasks.length
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background">
            <div className="flex flex-col gap-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    {employeeName || appFullName || 'Мой кабинет'}
                </h2>
                <p className="text-sm text-muted-foreground">{position || 'Не указана'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Time Tracker Widget */}
                <div className="md:col-span-1">
                    <TimeTracker employeeId={employeeId} />
                </div>

                {/* Task Progress Widget */}
                <div className="md:col-span-2">
                    <Card className="p-6 border-border bg-card h-full flex flex-col justify-center space-y-4">
                        <h3 className="font-medium text-foreground">План на сегодня</h3>

                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-3xl font-bold text-foreground">{completedTasks} <span className="text-base text-muted-foreground font-normal">/ {totalTasks}</span></p>
                                <p className="text-sm text-muted-foreground mt-1">задач выполнено</p>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-primary">{Math.round(progress)}%</span>
                            </div>
                        </div>

                        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-primary h-3 rounded-full transition-all duration-500 ease-in-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </Card>
                </div>
            </div>

            {/* Task List Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Задачи на обзвон / Рабочий процесс
                </h3>

                <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="w-full sm:w-auto">
                            <Plus className="w-4 h-4 mr-2" />
                            Добавить задачу
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Новая задача на сегодня</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateTask} className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Тема задачи</Label>
                                <Input required value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Позвонить клиенту..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Тип задачи</Label>
                                <Select value={newTask.task_type} onValueChange={v => setNewTask({ ...newTask, task_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="call">Телефонный звонок</SelectItem>
                                        <SelectItem value="task">Обычная задача</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Описание</Label>
                                <Textarea value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} placeholder="Подробности задачи..." />
                            </div>

                            <div className="space-y-2">
                                <Label>Кому звоним / Кого касается</Label>
                                <Select value={newTask.target_type} onValueChange={v => setNewTask({ ...newTask, target_type: v, target_participant_id: 'none', guest_name: '' })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="participant">Участник системы</SelectItem>
                                        <SelectItem value="guest">Гость (Просто имя)</SelectItem>
                                        <SelectItem value="none">Без привязки к клиенту</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {newTask.target_type === 'participant' && (
                                <div className="space-y-2">
                                    <Label>Выберите участника</Label>
                                    <Select value={newTask.target_participant_id} onValueChange={v => setNewTask({ ...newTask, target_participant_id: v })}>
                                        <SelectTrigger><SelectValue placeholder="Поиск участника..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Конкретный участник не выбран</SelectItem>
                                            {participants.map(p => (
                                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {newTask.target_type === 'guest' && (
                                <div className="space-y-2">
                                    <Label>Имя и фамилия гостя (или телефон)</Label>
                                    <Input required={newTask.target_type === 'guest'} value={newTask.guest_name} onChange={e => setNewTask({ ...newTask, guest_name: e.target.value })} placeholder="Например: Алишер 93000..." />
                                </div>
                            )}

                            <div className="flex justify-end pt-4">
                                <Button type="submit">Создать задачу</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['todo', 'in_progress', 'completed'].map((statusKey) => {
                    const columnTasks = tasks.filter(t => t.status === statusKey);

                    let title = 'К выполнению';
                    if (statusKey === 'in_progress') title = 'В работе';
                    if (statusKey === 'completed') title = 'Завершено';

                    return (
                        <div key={statusKey} className="flex flex-col gap-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-foreground flex items-center gap-2">
                                    {title}
                                </h4>
                                <Badge variant="secondary">{columnTasks.length}</Badge>
                            </div>

                            <div className="flex flex-col gap-4 min-h-[200px]">
                                {loading ? (
                                    <p className="text-muted-foreground text-sm">Загрузка...</p>
                                ) : columnTasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg text-muted-foreground bg-muted/10 h-full">
                                        <p className="text-sm text-center">Нет задач</p>
                                    </div>
                                ) : (
                                    columnTasks.map(task => (
                                        <Card
                                            key={task.id}
                                            className="p-2 border-border bg-card hover:bg-muted/20 transition-colors flex flex-col shadow-sm cursor-pointer active:scale-[0.98]"
                                            onClick={() => {
                                                setSelectedTask(task)
                                                setTaskStatus(task.status)
                                                setTaskComment(task.result_comment || '')
                                                setIsViewDialogOpen(true)
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-0.5">
                                                <Badge variant={task.status === 'completed' ? 'secondary' : 'default'} className="text-[9px] px-1 py-0 h-4 leading-none">
                                                    {title}
                                                </Badge>
                                                {task.task_type === 'call' && <PhoneCall className="w-3 h-3 text-primary" />}
                                                {task.task_type !== 'call' && <Tag className="w-3 h-3 text-primary" />}
                                            </div>

                                            <h4 className="font-semibold text-foreground text-xs leading-tight mb-0.5">{task.title}</h4>

                                            {task.description && (
                                                <p className="text-[10px] text-muted-foreground line-clamp-2 mb-1 leading-tight">
                                                    {task.description}
                                                </p>
                                            )}

                                            {task.target && (
                                                <div className="flex items-center gap-1 text-[9px] leading-none text-muted-foreground bg-muted/40 p-1 rounded mt-auto border border-border">
                                                    <User className="w-2.5 h-2.5 shrink-0" />
                                                    <span className="truncate">{task.target.name}</span>
                                                </div>
                                            )}
                                        </Card>
                                    ))
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* View/Update Task Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Карточка задачи</DialogTitle>
                    </DialogHeader>
                    {selectedTask && (
                        <div className="space-y-4 py-4">
                            <div>
                                <h4 className="font-semibold text-foreground mb-1">{selectedTask.title}</h4>
                                <p className="text-sm text-muted-foreground">{selectedTask.description || 'Нет описания'}</p>
                            </div>

                            {selectedTask.target && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 p-2 rounded-md border border-border">
                                    <User className="w-4 h-4" />
                                    <span>Участник: {selectedTask.target.name} ({selectedTask.target.phone})</span>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Статус задачи</Label>
                                <Select value={taskStatus} onValueChange={setTaskStatus}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todo">К выполнению</SelectItem>
                                        <SelectItem value="in_progress">В работе</SelectItem>
                                        <SelectItem value="completed">Завершено</SelectItem>
                                        <SelectItem value="cancelled">Отменено</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Комментарий / Результат</Label>
                                <Textarea
                                    value={taskComment}
                                    onChange={e => setTaskComment(e.target.value)}
                                    placeholder="Укажите результат звонка или выполнения задачи..."
                                />
                            </div>

                            <Button className="w-full" onClick={handleUpdateTask}>
                                Сохранить изменения
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
