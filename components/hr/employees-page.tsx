'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Trash2, Award, Briefcase, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface Employee {
    id: string
    first_name: string
    last_name: string
    position: string
    department?: string
    phone?: string
    email?: string
    birth_date?: string
    base_salary: number
    responsibilities?: string
    valuable_final_product?: string
    status: 'active' | 'inactive' | 'terminated'
}

export function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // Form State
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        position: '',
        department: '',
        phone: '',
        birth_date: '',
        base_salary: '',
        responsibilities: '',
        valuable_final_product: '',
        status: 'active'
    })

    useEffect(() => {
        fetchEmployees()
    }, [])

    const fetchEmployees = async () => {
        try {
            const res = await fetch('/api/hr/employees')
            const data = await res.json()
            if (Array.isArray(data)) {
                setEmployees(data)
            }
        } catch (error) {
            console.error('Failed to fetch employees', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleEdit = (employee: Employee) => {
        setEditingId(employee.id)
        setFormData({
            first_name: employee.first_name,
            last_name: employee.last_name,
            position: employee.position,
            department: employee.department || '',
            phone: employee.phone || '',
            birth_date: employee.birth_date || '',
            base_salary: employee.base_salary.toString(),
            responsibilities: employee.responsibilities || '',
            valuable_final_product: employee.valuable_final_product || '',
            status: employee.status
        })
        setIsDialogOpen(true)
    }

    const handleAddNew = () => {
        setEditingId(null)
        setFormData({
            first_name: '',
            last_name: '',
            position: '',
            department: '',
            phone: '',
            birth_date: '',
            base_salary: '',
            responsibilities: '',
            valuable_final_product: '',
            status: 'active'
        })
        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить сотрудника?')) return;

        try {
            const res = await fetch(`/api/hr/employees/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchEmployees();
            }
        } catch (error) {
            console.error('Error deleting employee:', error);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const url = editingId ? `/api/hr/employees/${editingId}` : '/api/hr/employees'
            const method = editingId ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    base_salary: Number(formData.base_salary) || 0
                })
            })

            if (res.ok) {
                setIsDialogOpen(false)
                fetchEmployees()
                setEditingId(null)
            } else {
                const error = await res.json()
                alert(`Error: ${error.error}`)
            }
        } catch (error) {
            console.error('Error saving employee', error)
        }
    }

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const filteredEmployees = employees.filter(emp => {
        const search = searchTerm.toLowerCase()
        return (
            emp.first_name.toLowerCase().includes(search) ||
            emp.last_name.toLowerCase().includes(search) ||
            emp.position.toLowerCase().includes(search)
        )
    })

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">Сотрудники</h1>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={handleAddNew}>
                            <Plus className="w-4 h-4 mr-2" /> Добавить сотрудника
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingId ? 'Редактировать сотрудника' : 'Новый сотрудник'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Имя</Label>
                                    <Input required name="first_name" value={formData.first_name} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Фамилия</Label>
                                    <Input required name="last_name" value={formData.last_name} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Должность</Label>
                                    <Input required name="position" value={formData.position} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Отдел</Label>
                                    <Input name="department" value={formData.department} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Телефон</Label>
                                    <Input name="phone" value={formData.phone} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Дата рождения</Label>
                                    <Input type="date" name="birth_date" value={formData.birth_date} onChange={handleInputChange} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Оклад (TJS)</Label>
                                <Input type="number" name="base_salary" value={formData.base_salary} onChange={handleInputChange} />
                            </div>

                            <div className="space-y-2">
                                <Label>Должностные обязанности</Label>
                                <Textarea
                                    name="responsibilities"
                                    value={formData.responsibilities}
                                    onChange={handleInputChange}
                                    placeholder="Опишите основные обязанности..."
                                    className="min-h-[100px]"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Ценный Конечный Продукт (ЦКП)</Label>
                                <Input
                                    name="valuable_final_product"
                                    value={formData.valuable_final_product}
                                    onChange={handleInputChange}
                                    placeholder="Результат работы сотрудника..."
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button type="submit">Сохранить</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-2 max-w-sm">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Поиск сотрудника..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Сотрудник</TableHead>
                                <TableHead>Должность</TableHead>
                                <TableHead>Для связи</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead className="text-right">Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredEmployees.map(employee => (
                                <React.Fragment key={employee.id}>
                                    <TableRow key={employee.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(employee.id)}>
                                        <TableCell>
                                            {expandedRows.has(employee.id) ? (
                                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                    {employee.first_name[0]}{employee.last_name[0]}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{employee.first_name} {employee.last_name}</p>
                                                    {employee.birth_date && (
                                                        <p className="text-xs text-muted-foreground">
                                                            ДР: {new Date(employee.birth_date).toLocaleDateString('ru-RU')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <p>{employee.position}</p>
                                            <p className="text-xs text-muted-foreground">{employee.department}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                <p>{employee.phone || '-'}</p>
                                                <p className="text-xs text-muted-foreground">{employee.email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className={
                                                employee.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700'
                                            }>
                                                {employee.status === 'active' ? 'Активен' : 'Неактивен'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(employee)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(employee.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedRows.has(employee.id) && (
                                        <TableRow className="bg-muted/30">
                                            <TableCell colSpan={6} className="p-4 sm:p-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <h4 className="flex items-center gap-2 font-semibold text-primary">
                                                            <Award className="w-4 h-4" />
                                                            Ценный Конечный Продукт (ЦКП)
                                                        </h4>
                                                        <div className="p-3 bg-background rounded-lg border border-primary/20 shadow-sm">
                                                            {employee.valuable_final_product || <span className="text-muted-foreground italic">Не указан</span>}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <h4 className="flex items-center gap-2 font-semibold text-primary">
                                                            <Briefcase className="w-4 h-4" />
                                                            Должностные обязанности
                                                        </h4>
                                                        <div className="p-3 bg-background rounded-lg border whitespace-pre-wrap">
                                                            {employee.responsibilities || <span className="text-muted-foreground italic">Не указаны</span>}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1 text-sm text-muted-foreground">
                                                        <p>Оклад: <span className="font-medium text-foreground">{employee.base_salary.toLocaleString()} TJS</span></p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                    {filteredEmployees.length === 0 && !isLoading && (
                        <div className="py-10 text-center text-muted-foreground">
                            Сотрудники не найдены
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
