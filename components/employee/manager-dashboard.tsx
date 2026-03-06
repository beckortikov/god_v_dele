'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Calendar, PhoneCall, Tag, User } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

export function ManagerDashboard() {
    const [employees, setEmployees] = useState<any[]>([])
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
    const [tasks, setTasks] = useState<any[]>([])
    const [participants, setParticipants] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string>('')

    const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        task_type: 'call',
        target_type: 'participant',
        target_participant_id: '',
        guest_name: ''
    })

    useEffect(() => {
        setUserId(localStorage.getItem('userId') || '')
        fetchData()
    }, [])

    useEffect(() => {
        if (selectedEmployeeId) {
            fetchTasks()
        } else {
            setTasks([])
        }
    }, [selectedEmployeeId])

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
            if (partRes.ok) setParticipants(Array.isArray(partData) ? partData : partData.participants || [])
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchTasks = async () => {
        if (!selectedEmployeeId) return
        setLoading(true)
        try {
            const today = new Date().toISOString().split('T')[0]
            const res = await fetch(`/api/employee/tasks?assignee_id=${selectedEmployeeId}&date=${today}`)
            const data = await res.json()
            if (res.ok) {
                setTasks(data)
            }
        } catch (error) {
            console.error('Error fetching tasks:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedEmployeeId) {
            alert('Сначала выберите сотрудника')
            return
        }

        let taskTitle = newTask.title
        let targetId = newTask.target_participant_id === 'none' ? null : newTask.target_participant_id

        if (newTask.target_type === 'guest') {
            taskTitle = `${newTask.title} (Гость: ${newTask.guest_name})`
            targetId = null
        } else if (newTask.target_type === 'none') {
            targetId = null
        }

        const payload = {
            assignee_id: selectedEmployeeId,
            creator_id: userId,
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
                setIsTaskDialogOpen(false)
                setNewTask({ title: '', description: '', task_type: 'call', target_type: 'participant', target_participant_id: '', guest_name: '' })
                fetchTasks()
            } else {
                const err = await res.json()
                alert(err.error || 'Ошибка при создании задачи')
            }
        } catch (error) {
            console.error('Error creating task:', error)
            alert('Ошибка сервера')
        }
    }

    const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Вы уверены, что хотите удалить эту задачу?')) return

        try {
            const res = await fetch(`/api/employee/tasks?id=${id}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                setTasks(tasks.filter(t => t.id !== id))
            } else {
                alert('Ошибка при удалении задачи')
            }
        } catch (error) {
            console.error('Error deleting task', error)
        }
    }

    const taskColumns = [
        { id: 'todo', title: 'К выполнению' },
        { id: 'in_progress', title: 'В работе' },
        { id: 'completed', title: 'Завершено' }
    ]

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background">
            <div className="flex flex-col gap-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">Задачи сотрудников</h2>
                <p className="text-sm text-muted-foreground">Управление поручениями и контроль выполнения</p>
            </div>

            <Card className="p-4 border-border bg-card">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="space-y-2 w-full sm:w-1/3">
                        <Label>Выберите сотрудника</Label>
                        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Сотрудник не выбран" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map(emp => (
                                    <SelectItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.position})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedEmployeeId && (
                        <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="w-full sm:w-auto">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Поставить задачу
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Новая задача для сотрудника</DialogTitle>
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
                                                    <SelectItem value="none">Не выбран</SelectItem>
                                                    {participants.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {newTask.target_type === 'guest' && (
                                        <div className="space-y-2">
                                            <Label>Имя гостя</Label>
                                            <Input required value={newTask.guest_name} onChange={e => setNewTask({ ...newTask, guest_name: e.target.value })} placeholder="Иван Иванов" />
                                        </div>
                                    )}

                                    <Button type="submit" className="w-full">Создать поручение</Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </Card>

            {selectedEmployeeId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mt-4">
                    {taskColumns.map(({ id, title }) => {
                        const columnTasks = tasks.filter(t => t.status === id)
                        return (
                            <div key={id} className="flex flex-col gap-3 bg-muted/10 p-3 sm:p-4 rounded-xl border border-border h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto">
                                <div className="flex items-center justify-between px-1 mb-2 sticky top-0 bg-background/80 backdrop-blur-sm p-2 rounded-lg z-10 border border-border">
                                    <h4 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                        {id === 'todo' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                        {id === 'in_progress' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                        {id === 'completed' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                                        {title}
                                    </h4>
                                    <Badge variant="secondary">{columnTasks.length}</Badge>
                                </div>

                                <div className="flex flex-col gap-3 min-h-[200px]">
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
                                                className="p-3 border-border bg-card flex flex-col shadow-sm relative group"
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute top-1 right-1 w-6 h-6 text-muted-foreground hover:text-destructive opacity-50 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => handleDeleteTask(task.id, e)}
                                                    title="Удалить задачу"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>

                                                <div className="flex justify-between items-start mb-1 pr-6">
                                                    <Badge variant={task.status === 'completed' ? 'secondary' : 'default'} className="text-[10px] px-1.5 py-0 h-4 leading-none">
                                                        {title}
                                                    </Badge>
                                                    {task.task_type === 'call' && <PhoneCall className="w-3 h-3 text-primary" />}
                                                    {task.task_type !== 'call' && <Tag className="w-3 h-3 text-primary" />}
                                                </div>

                                                <h4 className="font-semibold text-foreground text-sm leading-tight mb-1">{task.title}</h4>

                                                {task.description && (
                                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-snug">
                                                        {task.description}
                                                    </p>
                                                )}

                                                {task.target && (
                                                    <div className="flex items-center gap-1.5 text-[10px] leading-none text-muted-foreground bg-muted/30 p-1.5 rounded mt-auto border border-border/50">
                                                        <User className="w-3 h-3 shrink-0" />
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
            )}
            {!selectedEmployeeId && (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-lg text-muted-foreground bg-muted/5 mt-4">
                    <User className="w-12 h-12 mb-4 text-muted-foreground/30" />
                    <p className="text-base text-center">Выберите сотрудника, чтобы просмотреть его задачи</p>
                </div>
            )}
        </div>
    )
}
