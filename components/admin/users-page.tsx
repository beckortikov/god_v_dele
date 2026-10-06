'use client'

import { TelegramSettings } from '@/components/telegram/telegram-settings'
import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Briefcase, GraduationCap, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, plural } from '@/lib/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TablePagination } from '@/components/erp/pagination'
import { TableSkeleton, rowActionsCls, dangerIconCls } from '@/components/erp/table-parts'
import { Field, FieldGroup } from '@/components/erp/field'
import { Combobox, type ComboOption } from '@/components/erp/combobox'
import { useConfirm } from '@/components/erp/confirm'

type Role = 'admin' | 'finance' | 'participant' | 'employee' | 'manager' | 'wheels_manager'

type AppUser = {
    id: string
    username: string
    role: Role
    full_name: string
    employee_id?: string
    employee?: {
        first_name: string
        last_name: string
        position: string
    }
    participant_id?: string
    participant?: {
        id?: string
        name: string
    }
    last_login_at?: string
    created_at: string
}

const ROLES: Record<Role, { label: string; description: string; variant: 'default' | 'secondary' | 'outline' | 'info' }> = {
    admin: { label: 'Администратор', description: 'Полный доступ: финансы, участники, персонал и пользователи', variant: 'default' },
    manager: { label: 'Руководитель', description: 'Свой кабинет, задачи сотрудников, заявки на отгул, колёса баланса', variant: 'info' },
    finance: { label: 'Финансист', description: 'Участники, финансы, отчёты и колёса баланса. Без раздела «Персонал»', variant: 'secondary' },
    wheels_manager: { label: 'Менеджер колёс', description: 'Колёса баланса и список участников', variant: 'secondary' },
    employee: { label: 'Сотрудник', description: 'Свой кабинет: задачи, учёт времени, заявки на отгул; колёса баланса', variant: 'secondary' },
    participant: { label: 'Участник', description: 'Только свои колёса баланса', variant: 'outline' },
}

const ROLE_ORDER: Role[] = ['admin', 'manager', 'finance', 'wheels_manager', 'employee', 'participant']
const EMPLOYEE_ROLES: Role[] = ['employee', 'finance', 'manager']
const PAGE_SIZE = 50

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase())
        .join('')
}

/** "только что", "12 мин назад", "сегодня в 09:31", "вчера в 18:02", "3 дня назад", "14.07.2026" */
function lastSeen(iso?: string) {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000)
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    if (mins < 1) return 'только что'
    if (mins < 60) return `${mins} мин назад`
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (d.getTime() >= startOfToday) return `сегодня в ${time}`
    if (d.getTime() >= startOfToday - 86400000) return `вчера в ${time}`
    const days = Math.floor((startOfToday - d.getTime()) / 86400000) + 1
    if (days < 7) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`
    return formatDate(d)
}

export function UsersPage() {
    const confirm = useConfirm()

    const [users, setUsers] = useState<AppUser[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<AppUser | null>(null)
    const [employees, setEmployees] = useState<any[]>([])
    const [participants, setParticipants] = useState<any[]>([])
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // List view state
    const [query, setQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
    const [page, setPage] = useState(1)

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
            toast.error('Не удалось загрузить пользователей', { description: 'Обновите страницу' })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchUsersAndEmployees()
    }, [])

    useEffect(() => setPage(1), [query, roleFilter])

    const handleSubmit = async () => {
        const errs: Record<string, string> = {}
        if (!formData.username.trim()) errs.username = 'Придумайте логин'
        if (!editingUser && !formData.password) errs.password = 'Задайте пароль для входа'
        setErrors(errs)
        if (Object.keys(errs).length) return

        setSaving(true)
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
                toast.success(editingUser ? 'Изменения сохранены' : 'Пользователь создан', {
                    description: `${formData.full_name || formData.username} · ${ROLES[formData.role as Role]?.label ?? formData.role}`,
                })
                setIsFormOpen(false)
                fetchUsersAndEmployees()
            } else {
                const err = await res.json().catch(() => ({}))
                toast.error('Не удалось сохранить', { description: err.error || 'Проверьте, что логин не занят' })
            }
        } catch (error) {
            console.error('Error saving user:', error)
            toast.error('Не удалось сохранить', { description: 'Сервер не ответил, попробуйте ещё раз' })
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (user: AppUser) => {
        const ok = await confirm({
            title: `Удалить пользователя ${user.full_name || user.username}?`,
            description: 'Он больше не сможет войти в систему. Карточки сотрудника и участника останутся.',
            confirmText: 'Удалить',
            destructive: true,
        })
        if (!ok) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
            if (res.ok) {
                toast.success('Пользователь удалён', { description: user.username })
                setIsFormOpen(false)
                fetchUsersAndEmployees()
            } else {
                const err = await res.json().catch(() => ({}))
                toast.error('Не удалось удалить', { description: err.error })
            }
        } catch (error) {
            console.error('Error deleting user:', error)
            toast.error('Не удалось удалить', { description: 'Сервер не ответил, попробуйте ещё раз' })
        }
    }

    const handleEdit = (user: AppUser) => {
        setEditingUser(user)
        setErrors({})
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
        setErrors({})
        setFormData({ username: '', password: '', role: 'finance', full_name: '', employee_id: 'none', participant_id: 'none' })
    }

    const openNew = () => {
        resetForm()
        setIsFormOpen(true)
    }

    // ----- Linking options -------------------------------------------------

    const employeeOptions: ComboOption[] = useMemo(
        () => [
            { value: 'none', label: 'Без привязки' },
            ...employees.map(emp => ({
                value: emp.id,
                label: `${emp.first_name} ${emp.last_name}`,
                hint: emp.position || undefined,
            })),
        ],
        [employees]
    )

    const participantOptions: ComboOption[] = useMemo(() => {
        const opts: ComboOption[] = participants.map(p => ({
            value: p.id,
            label: p.name,
            hint: p.phone || undefined,
            group: p.program?.name || 'Без программы',
            keywords: [p.email, p.program?.name].filter(Boolean).join(' '),
        }))
        opts.sort((x, y) => (x.group ?? '').localeCompare(y.group ?? '', 'ru') || x.label.localeCompare(y.label, 'ru'))
        // Keep the current link visible even if that participant is no longer active
        const current = editingUser?.participant_id
        if (current && !opts.some(o => o.value === current)) {
            opts.unshift({ value: current, label: editingUser?.participant?.name || 'Текущий участник', group: 'Сейчас привязан' })
        }
        return [{ value: 'none', label: 'Без привязки' }, ...opts]
    }, [participants, editingUser])

    const setEmployeeLink = (id: string) => {
        if (id === 'none') {
            setFormData({ ...formData, employee_id: 'none', full_name: editingUser ? editingUser.full_name : '' })
            return
        }
        const emp = employees.find(x => x.id === id)
        if (emp) setFormData({ ...formData, employee_id: emp.id, full_name: `${emp.first_name} ${emp.last_name}` })
    }

    const setParticipantLink = (id: string) => {
        if (id === 'none') {
            setFormData({ ...formData, participant_id: 'none', full_name: editingUser ? editingUser.full_name : '' })
            return
        }
        const p = participants.find(x => x.id === id)
        if (p) setFormData({ ...formData, participant_id: p.id, full_name: p.name })
    }

    // ----- List ------------------------------------------------------------

    const roleCounts = useMemo(() => {
        const c: Partial<Record<Role, number>> = {}
        for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1
        return c
    }, [users])

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        return users
            .filter(u => roleFilter === 'all' || u.role === roleFilter)
            .filter(u => {
                if (!q) return true
                const linked = u.employee ? `${u.employee.first_name} ${u.employee.last_name} ${u.employee.position ?? ''}` : u.participant?.name ?? ''
                return [u.full_name, u.username, linked].some(s => s?.toLowerCase().includes(q))
            })
            .sort((a, b) => {
                const r = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
                return r !== 0 ? r : (a.full_name || a.username).localeCompare(b.full_name || b.username, 'ru')
            })
    }, [users, query, roleFilter])

    const staffCount = users.filter(u => u.role !== 'participant').length

    const role = formData.role as Role
    const showEmployeeLink = EMPLOYEE_ROLES.includes(role)
    const showParticipantLink = role === 'participant'
    const err = (k: string) => errors[k] && <span className="text-destructive">{errors[k]}</span>

    return (
        <PageContainer>
            <PageHeader
                title="Пользователи"
                description={
                    isLoading
                        ? 'Учётные записи, роли и доступы'
                        : `${formatNumber(users.length)} ${plural(users.length, ['учётная запись', 'учётные записи', 'учётных записей'])}: ${staffCount} в команде, ${users.length - staffCount} ${plural(users.length - staffCount, ['участник', 'участника', 'участников'])}`
                }
                actions={
                    <Button size="sm" onClick={openNew}>
                        <Plus /> Новый пользователь
                    </Button>
                }
            />

            {isLoading ? (
                <TableSkeleton rows={10} />
            ) : (
                <Panel>
                    <PanelToolbar>
                        <SearchInput value={query} onChange={setQuery} placeholder="Имя, логин или привязка" className="sm:w-72" />
                        <Select value={roleFilter} onValueChange={v => setRoleFilter(v as 'all' | Role)}>
                            <SelectTrigger size="sm" className="min-w-40 max-sm:flex-1" aria-label="Роль">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    Все роли <span className="num text-muted-foreground">{users.length}</span>
                                </SelectItem>
                                {ROLE_ORDER.filter(r => roleCounts[r]).map(r => (
                                    <SelectItem key={r} value={r}>
                                        {ROLES[r].label} <span className="num text-muted-foreground">{roleCounts[r]}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </PanelToolbar>

                    {visible.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={users.length ? 'Никого не нашли' : 'Пользователей пока нет'}
                            description={users.length ? 'Измените поиск или фильтр по роли' : 'Создайте первую учётную запись'}
                            action={!users.length && <Button size="sm" onClick={openNew}><Plus /> Новый пользователь</Button>}
                        />
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Пользователь</TableHead>
                                        <TableHead className="max-sm:hidden">Роль</TableHead>
                                        <TableHead className="max-md:hidden">Привязка</TableHead>
                                        <TableHead className="max-lg:hidden">Последний вход</TableHead>
                                        <TableHead className="w-20" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(user => {
                                        const name = user.full_name || user.username
                                        const seen = lastSeen(user.last_login_at)
                                        const r = ROLES[user.role] ?? { label: user.role, variant: 'secondary' as const }
                                        return (
                                            <TableRow key={user.id} className="group cursor-pointer" onClick={() => handleEdit(user)}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2.5">
                                                        <span
                                                            aria-hidden
                                                            className={cn(
                                                                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                                                user.role === 'admin' ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-muted-foreground'
                                                            )}
                                                        >
                                                            {initials(name) || '?'}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium">{name}</div>
                                                            <div className="truncate text-xs text-muted-foreground">
                                                                <span className="font-mono">{user.username}</span>
                                                                <span className="sm:hidden"> · {r.label}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-sm:hidden">
                                                    <Badge variant={r.variant}>
                                                        {user.role === 'admin' && <ShieldCheck />}
                                                        {r.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-md:hidden">
                                                    {user.employee ? (
                                                        <div className="flex items-center gap-1.5 text-sm">
                                                            <Briefcase className="size-3.5 shrink-0 text-muted-foreground" />
                                                            <span className="truncate">
                                                                {user.employee.first_name} {user.employee.last_name}
                                                            </span>
                                                            {user.employee.position && (
                                                                <span className="truncate text-xs text-muted-foreground max-xl:hidden">· {user.employee.position}</span>
                                                            )}
                                                        </div>
                                                    ) : user.participant ? (
                                                        <div className="flex items-center gap-1.5 text-sm">
                                                            <GraduationCap className="size-3.5 shrink-0 text-muted-foreground" />
                                                            <span className="truncate">{user.participant.name}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="max-lg:hidden">
                                                    {seen ? (
                                                        <span className="num text-muted-foreground" title={new Date(user.last_login_at!).toLocaleString('ru-RU')}>
                                                            {seen}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/80">Не входил</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                                    <div className={rowActionsCls}>
                                                        <Button variant="ghost" size="icon-sm" aria-label="Изменить" className="text-muted-foreground" onClick={() => handleEdit(user)}>
                                                            <Pencil />
                                                        </Button>
                                                        <Button variant="ghost" size="icon-sm" aria-label="Удалить" className={dangerIconCls} onClick={() => handleDelete(user)}>
                                                            <Trash2 />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                            <TablePagination page={page} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} />
                        </>
                    )}
                </Panel>
            )}

            <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
                <SheetContent>
                    <form
                        className="flex h-full flex-col"
                        onSubmit={e => {
                            e.preventDefault()
                            handleSubmit()
                        }}
                        onKeyDown={e => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault()
                                handleSubmit()
                            }
                        }}
                    >
                        <SheetHeader>
                            <SheetTitle>{editingUser ? 'Пользователь' : 'Новый пользователь'}</SheetTitle>
                            <SheetDescription>
                                {editingUser ? 'Доступ, роль и привязка к сотруднику или участнику' : 'Выберите роль, и мы подскажем, что заполнить'}
                            </SheetDescription>
                        </SheetHeader>
                        <SheetBody>
                            <FieldGroup>
                                <Field label="Роль" hint={ROLES[role]?.description}>
                                    <Select value={formData.role} onValueChange={val => setFormData({ ...formData, role: val })}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue>{ROLES[role]?.label ?? formData.role}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ROLE_ORDER.map(r => (
                                                <SelectItem key={r} value={r} className="py-2">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-medium">{ROLES[r].label}</span>
                                                        <span className="text-xs whitespace-normal text-muted-foreground">{ROLES[r].description}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>

                                {showEmployeeLink && (
                                    <Field label="Сотрудник" hint="Необязательно. Имя заполнится из карточки сотрудника">
                                        <Combobox
                                            value={formData.employee_id || 'none'}
                                            onChange={setEmployeeLink}
                                            options={employeeOptions}
                                            placeholder="Без привязки"
                                            searchPlaceholder="Имя или должность…"
                                        />
                                    </Field>
                                )}

                                {showParticipantLink && (
                                    <Field label="Участник" hint="Поиск по имени, телефону, почте или группе. Имя заполнится автоматически">
                                        <Combobox
                                            value={formData.participant_id || 'none'}
                                            onChange={setParticipantLink}
                                            options={participantOptions}
                                            placeholder="Без привязки"
                                            searchPlaceholder="Имя, телефон или группа…"
                                        />
                                    </Field>
                                )}

                                <Field label="Имя" htmlFor="user-name">
                                    <Input
                                        id="user-name"
                                        value={formData.full_name}
                                        onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                        placeholder="Например: Иван Иванов"
                                    />
                                </Field>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label="Логин" htmlFor="user-login" required hint={err('username')}>
                                        <Input
                                            id="user-login"
                                            value={formData.username}
                                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                                            placeholder="login"
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            aria-invalid={!!errors.username || undefined}
                                        />
                                    </Field>
                                    <Field
                                        label="Пароль"
                                        htmlFor="user-password"
                                        required={!editingUser}
                                        hint={err('password') || (editingUser && 'Оставьте пустым, чтобы не менять')}
                                    >
                                        <Input
                                            id="user-password"
                                            type="password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="******"
                                            autoComplete="new-password"
                                            aria-invalid={!!errors.password || undefined}
                                        />
                                    </Field>
                                </div>
                            </FieldGroup>
                        </SheetBody>
                        <SheetFooter>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Сохранение…' : editingUser ? 'Сохранить' : 'Создать'}
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                                Отмена
                            </Button>
                            {editingUser ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="ml-auto text-destructive hover:bg-destructive-soft hover:text-destructive"
                                    onClick={() => handleDelete(editingUser)}
                                >
                                    Удалить
                                </Button>
                            ) : (
                                <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
                            )}
                        </SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>
            <section className="mt-8">
                <h2 className="mb-3 text-base font-semibold">Интеграции</h2>
                <TelegramSettings />
            </section>
        </PageContainer>
    )
}
