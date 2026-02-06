'use client'

import { useState, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface Employee {
    id: string
    first_name: string
    last_name: string
    position: string
}

interface ScheduleItem {
    id?: string
    employee_id: string
    work_date: string
    shift_type: 'work' | 'day_off' | 'sick_leave' | 'vacation' | 'unpaid_leave'
    start_time?: string
    end_time?: string
    employees?: Employee
}

export function SchedulePage() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [employees, setEmployees] = useState<Employee[]>([])
    const [schedules, setSchedules] = useState<ScheduleItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAssignOpen, setIsAssignOpen] = useState(false)
    const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null)

    // Form state for assigning schedule
    const [formData, setFormData] = useState<{
        employee_id: string;
        shift_type: ScheduleItem['shift_type'];
        start_time: string;
        end_time: string;
    }>({
        employee_id: '',
        shift_type: 'work',
        start_time: '09:00',
        end_time: '18:00',
    })

    useEffect(() => {
        fetchData()
    }, [currentDate])

    const fetchData = async () => {
        setIsLoading(true)
        try {
            const dateStr = currentDate.toISOString().split('T')[0]

            const [empRes, scheduleRes] = await Promise.all([
                fetch('/api/hr/employees'),
                fetch(`/api/hr/schedule?start_date=${dateStr}&end_date=${dateStr}`)
            ])

            if (empRes.ok) setEmployees(await empRes.json())
            if (scheduleRes.ok) setSchedules(await scheduleRes.json())
        } catch (error) {
            console.error('Error fetching schedule data:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handlePrevDay = () => {
        const newDate = new Date(currentDate)
        newDate.setDate(currentDate.getDate() - 1)
        setCurrentDate(newDate)
    }

    const handleNextDay = () => {
        const newDate = new Date(currentDate)
        newDate.setDate(currentDate.getDate() + 1)
        setCurrentDate(newDate)
    }

    const handleAddNew = () => {
        setEditingSchedule(null)
        setFormData({
            employee_id: '',
            shift_type: 'work',
            start_time: '09:00',
            end_time: '18:00',
        })
        setIsAssignOpen(true)
    }

    const handleEdit = (schedule: ScheduleItem) => {
        setEditingSchedule(schedule)
        setFormData({
            employee_id: schedule.employee_id,
            shift_type: schedule.shift_type,
            start_time: schedule.start_time || '09:00',
            end_time: schedule.end_time || '18:00',
        })
        setIsAssignOpen(true)
    }

    const handleDelete = async (schedule: ScheduleItem) => {
        if (!confirm('Вы уверены, что хотите удалить эту смену?')) return;

        // Assuming we need a DELETE endpoint or handle delete via POST/PUT with special flag? 
        // Or if we don't have a DELETE endpoint, we might need to create one or use the supabase ID logic.
        // Let's assume for now we use the same UPSERT logic but maybe there's a way.
        // Actually, the previous implementation plan didn't specify DELETE.
        // Let's add a proper DELETE by ID support in the API if not present.
        // Checking the API file (viewed previously) - it only had GET and POST (upsert).
        // I should probably add a DELETE route or handle it.
        // Wait, I see the file contents for api/hr/schedule/route.ts in previous turn.
        // It has GET and POST. It does NOT have DELETE.
        // I will need to update the API route to support DELETE. 
        // Or I can send a "shift_type: null" or "deleted: true" if the DB supported it, but DELETE is cleaner.
        // I'll try to use a DELETE method. I need to update the API route first? 
        // Let's optimistic UI update for now, but I really should check the API.

        // For now let's assume I will add DELETE support to `app/api/hr/schedule/route.ts` or make a new one.
        // But wait, the SCHEDULE table has an ID.
        // Let's try to call DELETE with ID.

        if (!schedule.id) {
            alert('Cannot delete schedule without ID');
            return;
        }

        try {
            // Upserting with same composite key but maybe a "delete" flag? No.
            // Best to add a DELETE method to the route or a specific route for ID.
            // I'll assume I'll add `app/api/hr/schedule/[id]/route.ts` or handle DELETE in main route with query param?
            // Main route with query param is messy.
            // I'll use a new dynamic route `app/api/hr/schedule/[id]/route.ts` which I will Create.
            const res = await fetch(`/api/hr/schedule/${schedule.id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Error deleting schedule:', error);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const dateStr = currentDate.toISOString().split('T')[0]
            const payload = {
                id: editingSchedule?.id, // include ID for update if exists
                employee_id: formData.employee_id,
                work_date: dateStr,
                shift_type: formData.shift_type,
                start_time: formData.shift_type === 'work' ? formData.start_time : null,
                end_time: formData.shift_type === 'work' ? formData.end_time : null,
            }

            const res = await fetch('/api/hr/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                setIsAssignOpen(false)
                fetchData()
                setFormData({ ...formData, employee_id: '' })
                setEditingSchedule(null)
            }
        } catch (error) {
            console.error('Error saving schedule:', error)
        }
    }

    const getShiftTypeLabel = (type: string) => {
        switch (type) {
            case 'work': return 'Рабочий день';
            case 'day_off': return 'Выходной';
            case 'sick_leave': return 'Больничный';
            case 'vacation': return 'Отпуск';
            case 'unpaid_leave': return 'Отгул (б/с)';
            default: return type;
        }
    }

    const getShiftColor = (type: string) => {
        switch (type) {
            case 'work': return 'bg-blue-100 text-blue-700';
            case 'day_off': return 'bg-gray-100 text-gray-700';
            case 'sick_leave': return 'bg-orange-100 text-orange-700';
            case 'vacation': return 'bg-green-100 text-green-700';
            case 'unpaid_leave': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100';
        }
    }

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">График работы</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrevDay}>
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="font-medium min-w-[150px] text-center">
                        {currentDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextDay}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Расписание на сегодня</h2>
                        <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" onClick={handleAddNew}>
                                    <Plus className="w-4 h-4 mr-2" /> Назначить смену
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{editingSchedule ? 'Редактировать смену' : 'Назначение смены'}</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Сотрудник</Label>
                                        <Select
                                            value={formData.employee_id}
                                            onValueChange={(val) => setFormData({ ...formData, employee_id: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Выберите сотрудника" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.first_name} {emp.last_name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Тип смены</Label>
                                        <Select
                                            value={formData.shift_type}
                                            onValueChange={(val: any) => setFormData({ ...formData, shift_type: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="work">Рабочий день</SelectItem>
                                                <SelectItem value="day_off">Выходной</SelectItem>
                                                <SelectItem value="vacation">Отпуск</SelectItem>
                                                <SelectItem value="sick_leave">Больничный</SelectItem>
                                                <SelectItem value="unpaid_leave">Отгул (б/с)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {formData.shift_type === 'work' && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Начало</Label>
                                                <input
                                                    type="time"
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={formData.start_time}
                                                    onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Конец</Label>
                                                <input
                                                    type="time"
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={formData.end_time}
                                                    onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <Button type="submit" className="w-full">Сохранить</Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="p-4 text-center text-muted-foreground">Загрузка...</div>
                            ) : schedules.length > 0 ? (
                                <div className="divide-y">
                                    {schedules.map(schedule => (
                                        <div
                                            key={schedule.id || schedule.employee_id}
                                            className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer group"
                                            onClick={() => handleEdit(schedule)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getShiftColor(schedule.shift_type)}`}>
                                                    {schedule.employees?.first_name[0]}{schedule.employees?.last_name[0]}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{schedule.employees?.first_name} {schedule.employees?.last_name}</p>
                                                    <p className="text-xs text-muted-foreground">{schedule.employees?.position}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getShiftColor(schedule.shift_type)}`}>
                                                        {getShiftTypeLabel(schedule.shift_type)}
                                                    </div>
                                                    {schedule.shift_type === 'work' && schedule.start_time && (
                                                        <div className="flex items-center justify-end text-xs text-muted-foreground mt-1">
                                                            <Clock className="w-3 h-3 mr-1" />
                                                            {schedule.start_time.slice(0, 5)} - {schedule.end_time?.slice(0, 5)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(schedule);
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                    На эту дату смен не назначено
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle>Сводка</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Всего сотрудников:</span>
                                    <span className="font-medium">{employees.length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">В смене:</span>
                                    <span className="font-medium">{schedules.filter(s => s.shift_type === 'work').length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">В отпуске:</span>
                                    <span className="font-medium">{schedules.filter(s => s.shift_type === 'vacation').length}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Болеют:</span>
                                    <span className="font-medium">{schedules.filter(s => s.shift_type === 'sick_leave').length}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
