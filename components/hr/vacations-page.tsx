'use client'

import { useState, useEffect } from 'react'
import { Calendar, Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Employee {
    id: string
    first_name: string
    last_name: string
}

interface LeaveRecord {
    id: string
    employee_id: string
    work_date: string
    shift_type: 'vacation' | 'sick_leave' | 'unpaid_leave'
    employees?: Employee
}

export function VacationsPage() {
    const [leaves, setLeaves] = useState<LeaveRecord[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        employee_id: '',
        start_date: '',
        end_date: '',
        leave_type: 'vacation' as LeaveRecord['shift_type']
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setIsLoading(true)
        try {
            // Fetch employees
            const empRes = await fetch('/api/hr/employees')
            if (empRes.ok) setEmployees(await empRes.json())

            // Fetch future leaves (starting from today)
            const today = new Date().toISOString().split('T')[0]
            // We need a better API query to fetch ALL future leaves, but for now reuse schedule API with a wide range? 
            // Better: update backend or just fetch a month range. Let's fetch next 3 months for now.

            const endDate = new Date()
            endDate.setMonth(endDate.getMonth() + 3)
            const endStr = endDate.toISOString().split('T')[0]

            const scheduleRes = await fetch(`/api/hr/schedule?start_date=${today}&end_date=${endStr}`)
            if (scheduleRes.ok) {
                const allSchedules = await scheduleRes.json();
                // Filter only leaves
                const leaveTypes = ['vacation', 'sick_leave', 'unpaid_leave']
                const leaveRecords = allSchedules.filter((s: any) => leaveTypes.includes(s.shift_type))
                setLeaves(leaveRecords)
            }
        } catch (error) {
            console.error('Error fetching data:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (editingId) {
                // Update single record
                const res = await fetch(`/api/hr/schedule/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        employee_id: formData.employee_id,
                        work_date: formData.start_date, // Use start date as work date for single edit
                        shift_type: formData.leave_type
                    })
                });

                if (!res.ok) throw new Error('Failed to update');
            } else {
                // Create range
                const start = new Date(formData.start_date)
                const end = new Date(formData.end_date)
                const records = []

                for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
                    records.push({
                        employee_id: formData.employee_id,
                        work_date: d.toISOString().split('T')[0],
                        shift_type: formData.leave_type,
                        hours_worked: 0 // Absence usually means 0 hours
                    })
                }

                const res = await fetch('/api/hr/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(records)
                })

                if (!res.ok) throw new Error('Failed to create records')
            }

            setIsAddOpen(false)
            setEditingId(null)
            setFormData({
                employee_id: '',
                start_date: '',
                end_date: '',
                leave_type: 'vacation'
            })
            fetchData()
        } catch (error) {
            console.error('Error saving leave:', error)
            alert('Ошибка при сохранении')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить эту запись?')) return;
        try {
            const res = await fetch(`/api/hr/schedule/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchData();
            } else {
                alert('Ошибка при удалении');
            }
        } catch (error) {
            console.error('Error deleting:', error);
        }
    }

    const handleEdit = (record: LeaveRecord) => {
        setEditingId(record.id);
        setFormData({
            employee_id: record.employee_id,
            start_date: record.work_date,
            end_date: record.work_date, // Edit mode only supports single day for simplicty of UI
            leave_type: record.shift_type
        });
        setIsAddOpen(true);
    }

    const getLeaveLabel = (type: string) => {
        switch (type) {
            case 'vacation': return 'Отпуск';
            case 'sick_leave': return 'Больничный';
            case 'unpaid_leave': return 'Отгул';
            default: return type;
        }
    }

    const getLeaveColor = (type: string) => {
        switch (type) {
            case 'vacation': return 'bg-green-100 text-green-700 hover:bg-green-200';
            case 'sick_leave': return 'bg-orange-100 text-orange-700 hover:bg-orange-200';
            case 'unpaid_leave': return 'bg-red-100 text-red-700 hover:bg-red-200';
            default: return 'bg-gray-100 text-gray-700';
        }
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Отпуска и Отгулы</h1>
                <Dialog open={isAddOpen} onOpenChange={(open) => {
                    setIsAddOpen(open);
                    if (!open) {
                        setEditingId(null);
                        setFormData({
                            employee_id: '',
                            start_date: '',
                            end_date: '',
                            leave_type: 'vacation'
                        });
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button><Plus className="w-4 h-4 mr-2" /> Добавить</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Редактирование записи' : 'Регистрация отсутствия'}</DialogTitle>
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
                                <Label>Тип отсутствия</Label>
                                <Select
                                    value={formData.leave_type}
                                    onValueChange={(val: any) => setFormData({ ...formData, leave_type: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="vacation">Отпуск</SelectItem>
                                        <SelectItem value="sick_leave">Больничный</SelectItem>
                                        <SelectItem value="unpaid_leave">Отгул (б/с)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{editingId ? 'Дата' : 'С даты'}</Label>
                                    <Input
                                        type="date"
                                        value={formData.start_date}
                                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        required
                                    />
                                </div>
                                {!editingId && (
                                    <div className="space-y-2">
                                        <Label>По дату</Label>
                                        <Input
                                            type="date"
                                            value={formData.end_date}
                                            onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                            required
                                        />
                                    </div>
                                )}
                            </div>
                            <Button type="submit" className="w-full">{editingId ? 'Обновить' : 'Сохранить'}</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Предстоящие отсутствия (ближайшие 3 месяца)</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-muted-foreground">Загрузка...</p>
                    ) : leaves.length > 0 ? (
                        <div className="space-y-2">
                            {leaves.map((leave, idx) => (
                                <div key={leave.id || idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${leave.shift_type === 'vacation' ? 'bg-green-100 text-green-700' :
                                            leave.shift_type === 'sick_leave' ? 'bg-orange-100 text-orange-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                            {leave.employees?.first_name?.[0]}{leave.employees?.last_name?.[0]}
                                        </div>
                                        <div>
                                            <p className="font-medium">{leave.employees?.first_name} {leave.employees?.last_name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(leave.work_date).toLocaleDateString('ru-RU')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className={getLeaveColor(leave.shift_type)}>
                                            {getLeaveLabel(leave.shift_type)}
                                        </Badge>
                                        <Button size="sm" variant="ghost" onClick={() => handleEdit(leave)}>
                                            <Pencil className="w-4 h-4 text-blue-500" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(leave.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">Нет запланированных отсутствий</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
