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
    }

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

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                                <Select
                                    value={formData.employee_id}
                                    onValueChange={val => {
                                        const emp = employees.find((x: any) => x.id === val)
                                        setFormData({ 
                                            ...formData, 
                                            employee_id: val,
                                            full_name: emp ? `${emp.first_name} ${emp.last_name}` : formData.full_name
                                        })
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Без привязки" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без привязки</SelectItem>
                                        {employees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>
                                                {emp.first_name} {emp.last_name} ({emp.position})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {formData.role === 'participant' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <Label>Привязка к Участнику</Label>
                                <Select
                                    value={formData.participant_id}
                                    onValueChange={val => {
                                        const p = participants.find((x: any) => x.id === val)
                                        setFormData({ 
                                            ...formData, 
                                            participant_id: val,
                                            full_name: p ? p.name : formData.full_name
                                        })
                                    }}
                                >
                                    <SelectTrigger className="border-primary/50 focus:ring-primary">
                                        <SelectValue placeholder="Выберите участника" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без привязки</SelectItem>
                                        {participants.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                🎯 {p.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
