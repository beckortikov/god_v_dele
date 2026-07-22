'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Edit2, Shield, User, X, ArrowLeft } from 'lucide-react'

type AppUser = {
    id: string
    username: string
    role: 'admin' | 'finance' | 'participant' | 'employee' | 'manager'
    full_name: string
    employee_id?: string
    employee?: {
        first_name: string
        last_name: string
        position: string
    }
    participant_id?: string
    participant?: {
        name: string
    }
    last_login_at?: string
    created_at: string
}

export function UsersPage() {
    const [users, setUsers] = useState<AppUser[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<AppUser | null>(null)
    const [employees, setEmployees] = useState<any[]>([])
    const [participants, setParticipants] = useState<any[]>([])

    // States for searchable selectors
    const [participantSearchQuery, setParticipantSearchQuery] = useState('')
    const [participantFilterProgramId, setParticipantFilterProgramId] = useState('all')
    const [isParticipantSelectOpen, setIsParticipantSelectOpen] = useState(false)

    const [employeeSearchQuery, setEmployeeSearchQuery] = useState('')
    const [isEmployeeSelectOpen, setIsEmployeeSelectOpen] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'finance',
        full_name: '',
        employee_id: 'none',
        participant_id: 'none'
    })

    const fetchUsersAndEmployees = async () => {
        try {
            const [usersRes, empRes, partRes] = await Promise.all([
                fetch('/api/admin/users'),
                fetch('/api/hr/employees'),
                fetch('/api/participants')
            ])
            if (usersRes.ok) setUsers(await usersRes.json())
            if (empRes.ok) setEmployees(await empRes.json())
            if (partRes.ok) {
                const partsData = await partRes.json()
                if (partsData.data && Array.isArray(partsData.data)) {
                    setParticipants(partsData.data.filter((p: any) => p.status === 'active'))
                }
            }
        } catch (error) {
            console.error('Failed to fetch data:', error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchUsersAndEmployees()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users'
            const method = editingUser ? 'PUT' : 'POST'

            const submitData = { ...formData };
            if (submitData.employee_id === 'none') submitData.employee_id = '';
            if (submitData.participant_id === 'none') submitData.participant_id = '';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitData)
            })

            if (res.ok) {
                setIsFormOpen(false)
                fetchUsersAndEmployees()
                resetForm()
            } else {
                alert('Ошибка при сохранении')
            }
        } catch (error) {
            console.error('Error saving user:', error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return

        try {
            const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
            if (res.ok) {
                fetchUsersAndEmployees()
            } else {
                alert('Ошибка удаления')
            }
        } catch (error) {
            console.error('Error deleting user:', error)
        }
    }

    const handleEdit = (user: AppUser) => {
        setEditingUser(user)
        setFormData({
            username: user.username,
            password: '', // Password not shown for security, user can enter new one to change
            role: user.role,
            full_name: user.full_name || '',
            employee_id: user.employee_id || 'none',
            participant_id: user.participant_id || 'none'
        })
        setIsFormOpen(true)
    }

    const resetForm = () => {
        setEditingUser(null)
        setFormData({ username: '', password: '', role: 'finance', full_name: '', employee_id: 'none', participant_id: 'none' })
        setParticipantSearchQuery('')
        setParticipantFilterProgramId('all')
        setIsParticipantSelectOpen(false)
        setEmployeeSearchQuery('')
        setIsEmployeeSelectOpen(false)
        setIsFormOpen(false)
    }

    // Filter participants by search and program/group
    const filteredParticipants = participants.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(participantSearchQuery.toLowerCase()) ||
            (p.email && p.email.toLowerCase().includes(participantSearchQuery.toLowerCase())) ||
            (p.phone && p.phone.toLowerCase().includes(participantSearchQuery.toLowerCase()))
        
        const matchesProgram = participantFilterProgramId === 'all' || p.program_id === participantFilterProgramId
        
        return matchesSearch && matchesProgram
    })

    // Filter employees by search
    const filteredEmployees = employees.filter(emp => {
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase()
        const matchesSearch = fullName.includes(employeeSearchQuery.toLowerCase()) ||
            (emp.position && emp.position.toLowerCase().includes(employeeSearchQuery.toLowerCase()))
        return matchesSearch
    })

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-border pb-3.5">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold">Управление пользователями</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        {isFormOpen 
                            ? (editingUser ? 'Изменение учетной записи и привязок' : 'Создание нового пользователя')
                            : 'Управление учетными записями, ролями и привязками к сотрудникам/участникам'
                        }
                    </p>
                </div>
                {!isFormOpen ? (
                    <Button onClick={() => { resetForm(); setIsFormOpen(true) }} className="w-full sm:w-auto touch-manipulation">
                        <Plus className="w-4 h-4 mr-2" /> Добавить пользователя
                    </Button>
                ) : (
                    <Button variant="outline" onClick={resetForm} className="gap-2 w-full sm:w-auto touch-manipulation">
                        <ArrowLeft className="w-4 h-4" /> Назад к списку
                    </Button>
                )}
            </div>

            {/* Main Content Area */}
            {!isFormOpen ? (
                /* Fullscreen: Users List */
                <div className="w-full animate-in fade-in duration-200">
                    <Card>
                        <CardHeader>
                            <CardTitle>Список пользователей</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Пользователь</TableHead>
                                            <TableHead>Логин</TableHead>
                                            <TableHead>Роль</TableHead>
                                            <TableHead className="text-right">Действия</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center h-24">Загрузка...</TableCell>
                                            </TableRow>
                                        ) : users.map(user => (
                                            <TableRow key={user.id} className={editingUser?.id === user.id ? "bg-muted/50" : ""}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                            <User className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span>{user.full_name || user.username}</span>
                                                            {user.last_login_at ? (
                                                                <span className="text-xs text-muted-foreground font-normal">
                                                                    Был(а) в сети: {new Date(user.last_login_at).toLocaleString('ru-RU')}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground font-normal opacity-50">
                                                                    Никогда не заходил(а)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{user.username}</TableCell>
                                                <TableCell>
                                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                                        {user.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : null}
                                                        {user.role}
                                                    </Badge>
                                                    {user.employee && (
                                                        <Badge variant="outline" className="ml-2">
                                                            HR: {user.employee.first_name} {user.employee.last_name}
                                                        </Badge>
                                                    )}
                                                    {user.participant && (
                                                        <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                                                            🎯 {user.participant.name}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button size="icon" variant="ghost" onClick={() => handleEdit(user)}>
                                                            <Edit2 className="h-4 w-4 text-gray-500" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(user.id)}>
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                /* Fullscreen: Form panel */
                <div className="w-full animate-in slide-in-from-bottom-4 duration-200">
                    <Card className="border-primary/20 shadow-lg max-w-4xl mx-auto">
                        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
                            <div>
                                <CardTitle className="text-xl font-bold text-foreground">
                                    {editingUser ? 'Редактировать пользователя' : 'Создать пользователя'}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Заполните учетные данные и настройте привязку к сотрудникам или участникам
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={resetForm} className="gap-1 text-xs">
                                <ArrowLeft className="w-3.5 h-3.5" /> Вернуться к списку
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Имя Фамилия (Описание)</Label>
                                        <Input
                                            value={formData.full_name}
                                            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                            placeholder="Например: Иван Иванов"
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Логин</Label>
                                        <Input
                                            value={formData.username}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            placeholder="login"
                                            required
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Пароль {editingUser && '(оставьте пустым чтобы не менять)'}</Label>
                                        <Input
                                            type="password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="******"
                                            required={!editingUser}
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Роль</Label>
                                        <Select
                                            value={formData.role}
                                            onValueChange={val => setFormData({ ...formData, role: val })}
                                        >
                                            <SelectTrigger className="h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">Admin</SelectItem>
                                                <SelectItem value="manager">Руководитель (Manager)</SelectItem>
                                                <SelectItem value="finance">Финансист (Finance)</SelectItem>
                                                <SelectItem value="employee">Сотрудник (Employee)</SelectItem>
                                                <SelectItem value="participant">Участник (Participant)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <hr className="border-border my-6" />

                                {/* Linked entities - wider size for maximum comfort on fullscreen */}
                                {(formData.role === 'employee' || formData.role === 'finance' || formData.role === 'manager') && (
                                    <div className="space-y-3 animate-in fade-in duration-200">
                                        <Label className="text-sm font-semibold block">Привязка к сотруднику (Необязательно)</Label>
                                        <div className="relative w-full">
                                            {/* Trigger button */}
                                            <div 
                                                onClick={() => setIsEmployeeSelectOpen(!isEmployeeSelectOpen)}
                                                className="flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/30 transition-colors"
                                            >
                                                <span className="font-medium text-foreground">
                                                    {formData.employee_id === 'none' || !formData.employee_id
                                                        ? 'Без привязки'
                                                        : (() => {
                                                            const emp = employees.find(x => x.id === formData.employee_id);
                                                            return emp ? `${emp.first_name} ${emp.last_name} (${emp.position})` : 'Без привязки';
                                                          })()
                                                    }
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-2 shrink-0">Выбрать другого сотрудника</span>
                                            </div>

                                            {/* Dropdown panel */}
                                            {isEmployeeSelectOpen && (
                                                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in duration-100 space-y-3">
                                                    <Input
                                                        type="text"
                                                        placeholder="Поиск сотрудника по имени или должности..."
                                                        value={employeeSearchQuery}
                                                        onChange={e => setEmployeeSearchQuery(e.target.value)}
                                                        className="h-10 text-sm"
                                                    />

                                                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                                                        <div
                                                            onClick={() => {
                                                                setFormData({
                                                                    ...formData,
                                                                    employee_id: 'none',
                                                                    full_name: editingUser ? editingUser.full_name : ''
                                                                })
                                                                setIsEmployeeSelectOpen(false)
                                                            }}
                                                            className="flex items-center justify-between p-2.5 text-sm rounded-md hover:bg-muted cursor-pointer transition-colors"
                                                        >
                                                            <span className="font-semibold text-muted-foreground">Без привязки</span>
                                                        </div>
                                                        {filteredEmployees.map(emp => {
                                                            const isSelected = formData.employee_id === emp.id;
                                                            const name = `${emp.first_name} ${emp.last_name}`;
                                                            return (
                                                                <div
                                                                    key={emp.id}
                                                                    onClick={() => {
                                                                        setFormData({
                                                                            ...formData,
                                                                            employee_id: emp.id,
                                                                            full_name: name
                                                                        })
                                                                        setIsEmployeeSelectOpen(false)
                                                                    }}
                                                                    className={`flex items-center justify-between p-2.5 text-sm rounded-md hover:bg-muted cursor-pointer transition-colors ${
                                                                        isSelected ? 'bg-primary/10 text-primary font-medium' : ''
                                                                    }`}
                                                                >
                                                                    <span>{name}</span>
                                                                    {emp.position && (
                                                                        <Badge variant="outline" className="text-xs py-0.5 px-2 truncate max-w-[200px]">
                                                                            {emp.position}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                        {filteredEmployees.length === 0 && (
                                                            <div className="text-center py-6 text-sm text-muted-foreground">
                                                                Ничего не найдено
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {formData.role === 'participant' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <Label className="text-sm font-semibold block">Привязка к Участнику</Label>
                                        <div className="relative w-full">
                                            {/* Trigger button */}
                                            <div 
                                                onClick={() => setIsParticipantSelectOpen(!isParticipantSelectOpen)}
                                                className="flex h-12 w-full items-center justify-between rounded-md border border-primary/50 bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:bg-muted/30 transition-colors"
                                            >
                                                <span className="font-semibold text-foreground truncate">
                                                    {formData.participant_id === 'none' || !formData.participant_id
                                                        ? 'Без привязки'
                                                        : `🎯 ${participants.find(p => p.id === formData.participant_id)?.name || 'Без привязки'}`
                                                    }
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-2 shrink-0">Выбрать другого участника</span>
                                            </div>

                                            {/* Dropdown panel */}
                                            {isParticipantSelectOpen && (
                                                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in duration-100 space-y-3">
                                                    {/* Filters */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <Input
                                                            type="text"
                                                            placeholder="Поиск по имени, телефону или почте..."
                                                            value={participantSearchQuery}
                                                            onChange={e => setParticipantSearchQuery(e.target.value)}
                                                            className="h-10 text-sm"
                                                        />
                                                        <select
                                                            value={participantFilterProgramId}
                                                            onChange={e => setParticipantFilterProgramId(e.target.value)}
                                                            className="h-10 px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                                        >
                                                            <option value="all">Все группы</option>
                                                            {Array.from(new Set(participants.map(p => p.program?.id).filter(Boolean))).map(id => {
                                                                const name = participants.find(p => p.program?.id === id)?.program?.name;
                                                                return <option key={id} value={id}>{name}</option>;
                                                            })}
                                                        </select>
                                                    </div>

                                                    {/* List */}
                                                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                                                        <div
                                                            onClick={() => {
                                                                setFormData({
                                                                    ...formData,
                                                                    participant_id: 'none',
                                                                    full_name: editingUser ? editingUser.full_name : ''
                                                                })
                                                                setIsParticipantSelectOpen(false)
                                                            }}
                                                            className="flex items-center justify-between p-2.5 text-sm rounded-md hover:bg-muted cursor-pointer transition-colors"
                                                        >
                                                            <span className="font-semibold text-muted-foreground">Без привязки</span>
                                                        </div>
                                                        {filteredParticipants.map(p => {
                                                            const isSelected = formData.participant_id === p.id;
                                                            return (
                                                                <div
                                                                    key={p.id}
                                                                    onClick={() => {
                                                                        setFormData({
                                                                            ...formData,
                                                                            participant_id: p.id,
                                                                            full_name: p.name
                                                                        })
                                                                        setIsParticipantSelectOpen(false)
                                                                    }}
                                                                    className={`flex items-center justify-between p-2.5 text-sm rounded-md hover:bg-muted cursor-pointer transition-colors ${
                                                                        isSelected ? 'bg-primary/10 text-primary font-medium' : ''
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-col min-w-0 mr-4">
                                                                        <span className="font-medium text-foreground">{p.name}</span>
                                                                        {p.phone && <span className="text-xs text-muted-foreground">{p.phone}</span>}
                                                                    </div>
                                                                    {p.program?.name && (
                                                                        <Badge variant="outline" className="text-xs py-0.5 px-2 truncate max-w-[250px] shrink-0">
                                                                            {p.program.name}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                        {filteredParticipants.length === 0 && (
                                                            <div className="text-center py-6 text-sm text-muted-foreground">
                                                                Ничего не найдено
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                                    <Button type="button" variant="outline" onClick={resetForm} className="h-10 px-6">
                                        Отмена
                                    </Button>
                                    <Button type="submit" className="h-10 px-8">
                                        {editingUser ? 'Обновить данные' : 'Создать пользователя'}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
