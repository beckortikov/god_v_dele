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
import { Plus, Trash2, Edit2, Shield, User } from 'lucide-react'

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
    const [isDialogOpen, setIsDialogOpen] = useState(false)
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
                setIsDialogOpen(false)
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
        setIsDialogOpen(true)
    }

    const resetForm = () => {
        setEditingUser(null)
        setFormData({ username: '', password: '', role: 'finance', full_name: '', employee_id: 'none', participant_id: 'none' })
        setParticipantSearchQuery('')
        setParticipantFilterProgramId('all')
        setIsParticipantSelectOpen(false)
        setEmployeeSearchQuery('')
        setIsEmployeeSelectOpen(false)
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
        <div className="space-y-6 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">Управление пользователями</h1>
                <Button onClick={() => { resetForm(); setIsDialogOpen(true) }}>
                    <Plus className="w-4 h-4 mr-2" /> Добавить пользователя
                </Button>
            </div>

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
                                    <TableRow key={user.id}>
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

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open)
                if (!open) resetForm()
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingUser ? 'Редактировать пользователя' : 'Создать пользователя'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Имя Фамилия (Описание)</Label>
                            <Input
                                value={formData.full_name}
                                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="Например: Иван Иванов"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Логин</Label>
                            <Input
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                placeholder="login"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Пароль {editingUser && '(оставьте пустым чтобы не менять)'}</Label>
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                placeholder="******"
                                required={!editingUser}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Роль</Label>
                            <Select
                                value={formData.role}
                                onValueChange={val => setFormData({ ...formData, role: val })}
                            >
                                <SelectTrigger>
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

                        {(formData.role === 'employee' || formData.role === 'finance' || formData.role === 'manager') && (
                            <div className="space-y-2">
                                <Label>Привязка к сотруднику (Необязательно)</Label>
                                <div className="relative">
                                    {/* Trigger button */}
                                    <div 
                                        onClick={() => setIsEmployeeSelectOpen(!isEmployeeSelectOpen)}
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                    >
                                        <span className="truncate">
                                            {formData.employee_id === 'none' || !formData.employee_id
                                                ? 'Без привязки'
                                                : (() => {
                                                    const emp = employees.find(x => x.id === formData.employee_id);
                                                    return emp ? `${emp.first_name} ${emp.last_name} (${emp.position})` : 'Без привязки';
                                                  })()
                                            }
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">Изменить</span>
                                    </div>

                                    {/* Dropdown panel */}
                                    {isEmployeeSelectOpen && (
                                        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md animate-in fade-in duration-100 space-y-2">
                                            <Input
                                                type="text"
                                                placeholder="Поиск сотрудника..."
                                                value={employeeSearchQuery}
                                                onChange={e => setEmployeeSearchQuery(e.target.value)}
                                                className="h-8 text-xs"
                                            />

                                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                <div
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            employee_id: 'none',
                                                            full_name: editingUser ? editingUser.full_name : ''
                                                        })
                                                        setIsEmployeeSelectOpen(false)
                                                    }}
                                                    className="flex items-center justify-between p-2 text-xs rounded hover:bg-muted cursor-pointer transition-colors"
                                                >
                                                    <span>Без привязки</span>
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
                                                            className={`flex items-center justify-between p-2 text-xs rounded hover:bg-muted cursor-pointer transition-colors ${
                                                                isSelected ? 'bg-primary/10 text-primary font-medium' : ''
                                                            }`}
                                                        >
                                                            <span>{name}</span>
                                                            {emp.position && (
                                                                <Badge variant="outline" className="text-[9px] py-0 px-1 truncate max-w-[120px]">
                                                                    {emp.position}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                                {filteredEmployees.length === 0 && (
                                                    <div className="text-center py-4 text-xs text-muted-foreground">
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
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <Label>Привязка к Участнику</Label>
                                <div className="relative">
                                    {/* Trigger button */}
                                    <div 
                                        onClick={() => setIsParticipantSelectOpen(!isParticipantSelectOpen)}
                                        className="flex h-10 w-full items-center justify-between rounded-md border border-primary/50 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                    >
                                        <span className="truncate">
                                            {formData.participant_id === 'none' || !formData.participant_id
                                                ? 'Без привязки'
                                                : `🎯 ${participants.find(p => p.id === formData.participant_id)?.name || 'Без привязки'}`
                                            }
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">Изменить</span>
                                    </div>

                                    {/* Dropdown panel */}
                                    {isParticipantSelectOpen && (
                                        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md animate-in fade-in duration-100 space-y-2">
                                            {/* Filters */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <Input
                                                    type="text"
                                                    placeholder="Поиск..."
                                                    value={participantSearchQuery}
                                                    onChange={e => setParticipantSearchQuery(e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                                <select
                                                    value={participantFilterProgramId}
                                                    onChange={e => setParticipantFilterProgramId(e.target.value)}
                                                    className="h-8 px-2 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                                                >
                                                    <option value="all">Все группы</option>
                                                    {Array.from(new Set(participants.map(p => p.program?.id).filter(Boolean))).map(id => {
                                                        const name = participants.find(p => p.program?.id === id)?.program?.name;
                                                        return <option key={id} value={id}>{name}</option>;
                                                    })}
                                                </select>
                                            </div>

                                            {/* List */}
                                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                                <div
                                                    onClick={() => {
                                                        setFormData({
                                                            ...formData,
                                                            participant_id: 'none',
                                                            full_name: editingUser ? editingUser.full_name : ''
                                                        })
                                                        setIsParticipantSelectOpen(false)
                                                    }}
                                                    className="flex items-center justify-between p-2 text-xs rounded hover:bg-muted cursor-pointer transition-colors"
                                                >
                                                    <span>Без привязки</span>
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
                                                            className={`flex items-center justify-between p-2 text-xs rounded hover:bg-muted cursor-pointer transition-colors ${
                                                                isSelected ? 'bg-primary/10 text-primary font-medium' : ''
                                                            }`}
                                                        >
                                                            <div className="flex flex-col min-w-0 mr-2">
                                                                <span className="truncate">{p.name}</span>
                                                                {p.phone && <span className="text-[10px] text-muted-foreground">{p.phone}</span>}
                                                            </div>
                                                            {p.program?.name && (
                                                                <Badge variant="outline" className="text-[9px] py-0 px-1 truncate max-w-[120px] shrink-0">
                                                                    {p.program.name}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                                {filteredParticipants.length === 0 && (
                                                    <div className="text-center py-4 text-xs text-muted-foreground">
                                                        Ничего не найдено
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Отмена</Button>
                            <Button type="submit">{editingUser ? 'Обновить' : 'Создать'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
