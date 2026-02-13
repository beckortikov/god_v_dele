'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Plus, Trash2, Edit2, Download } from 'lucide-react'

// Types
interface OfflineEvent {
    id: string
    name: string
    event_date: string
    location?: string
    status: 'planned' | 'completed' | 'cancelled'
    total_income: number
    total_expenses: number
    balance: number
    attendees_registered: number
    attendees_attended: number
}

interface Attendee {
    id: string
    event_id: string
    attendee_type: 'participant' | 'guest'
    participant_id?: string
    participant_name?: string
    guest_name?: string
    guest_email?: string
    guest_phone?: string
    payment_received: number
    attendance_status: string
    notes?: string
    payment_notes?: string
    currency?: string
    original_amount?: number
    exchange_rate?: number
}

interface Expense {
    id: string
    event_id: string
    name: string
    amount: number
    category: string
    expense_date: string
    status: string
    currency?: string
    description?: string
    original_amount?: number
    exchange_rate?: number
}

interface FinancialSummary {
    total_income: number
    total_expenses: number
    balance: number
    roi: number
    income_breakdown: {
        guest_payments: number
        other_income: number
    }
    expense_breakdown: Record<string, number>
}

interface EventDetailPageProps {
    eventId: string
    onBack: () => void
}

export function EventDetailPage({ eventId, onBack }: EventDetailPageProps) {
    const [event, setEvent] = useState<OfflineEvent | null>(null)
    const [attendees, setAttendees] = useState<Attendee[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [summary, setSummary] = useState<FinancialSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [participantsList, setParticipantsList] = useState<{ id: string, name: string }[]>([])

    // Modal states
    const [isAddAttendeeOpen, setIsAddAttendeeOpen] = useState(false)
    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)

    const [newAttendee, setNewAttendee] = useState<Partial<Attendee>>({
        attendee_type: 'guest',
        payment_received: 0,
        attendance_status: 'registered',
        payment_notes: '',
        currency: 'TJS',
        exchange_rate: 10.5
    })
    const [attendeeCurrency, setAttendeeCurrency] = useState<'USD' | 'TJS'>('TJS')
    const [attendeeExchangeRate, setAttendeeExchangeRate] = useState<string>('10.5')

    const [newExpense, setNewExpense] = useState<Partial<Expense>>({
        name: '',
        amount: 0,
        category: 'Other',
        expense_date: new Date().toISOString().split('T')[0],
        status: 'approved',
        description: '',
        currency: 'TJS',
        exchange_rate: 10.5
    })
    const [expenseCurrency, setExpenseCurrency] = useState<'USD' | 'TJS'>('TJS')
    const [expenseExchangeRate, setExpenseExchangeRate] = useState<string>('10.5')

    // Fetch Data
    const fetchData = useCallback(async () => {
        try {
            setLoading(true)
            const [eventRes, attendeesRes, expensesRes, summaryRes, participantsRes] = await Promise.all([
                fetch(`/api/offline-events/${eventId}`).then(r => r.json()),
                fetch(`/api/offline-events/${eventId}/attendees`).then(r => r.json()),
                fetch(`/api/offline-events/${eventId}/expenses`).then(r => r.json()),
                fetch(`/api/offline-events/${eventId}/financial-summary`).then(r => r.json()),
                fetch(`/api/participants`).then(r => r.json())
            ])

            if (eventRes.data) setEvent(eventRes.data)
            if (attendeesRes.data) setAttendees(attendeesRes.data)
            if (expensesRes.data) setExpenses(expensesRes.data)
            if (summaryRes.data) setSummary(summaryRes.data)
            if (participantsRes.data) setParticipantsList(participantsRes.data)

        } catch (error) {
            console.error('Error loading event details:', error)
        } finally {
            setLoading(false)
        }
    }, [eventId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // --- Attendee Actions ---
    const handleAddAttendee = async () => {
        try {
            let finalAmountUSD = Number(newAttendee.payment_received)
            let originalAmount = Number(newAttendee.payment_received)
            let rate = 1

            if (attendeeCurrency === 'TJS') {
                rate = Number(attendeeExchangeRate)
                if (!rate || rate <= 0) {
                    alert('Введите корректный курс обмена')
                    return
                }
                finalAmountUSD = originalAmount / rate
            }

            const payload = {
                ...newAttendee,
                payment_received: finalAmountUSD,
                original_amount: originalAmount,
                currency: attendeeCurrency,
                exchange_rate: rate
            }

            const res = await fetch(`/api/offline-events/${eventId}/attendees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setIsAddAttendeeOpen(false)
            fetchData()
            setNewAttendee({
                attendee_type: 'guest',
                payment_received: 0,
                attendance_status: 'registered',
                payment_notes: ''
            })
        } catch (error: any) {
            alert('Ошибка при добавлении участника: ' + error.message)
        }
    }

    const handleDeleteAttendee = async (attendeeId: string) => {
        if (!confirm('Вы уверены, что хотите удалить этого участника?')) return
        try {
            const res = await fetch(`/api/offline-events/${eventId}/attendees/${attendeeId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                fetchData()
            }
        } catch (error) {
            console.error('Error deleting:', error)
        }
    }

    // --- Expense Actions ---
    const handleAddExpense = async () => {
        try {
            let finalAmountUSD = Number(newExpense.amount)
            let originalAmount = Number(newExpense.amount)
            let rate = 1

            if (expenseCurrency === 'TJS') {
                rate = Number(expenseExchangeRate)
                if (!rate || rate <= 0) {
                    alert('Введите корректный курс обмена')
                    return
                }
                finalAmountUSD = originalAmount / rate
            }

            const payload = {
                ...newExpense,
                amount: finalAmountUSD,
                original_amount: originalAmount,
                currency: expenseCurrency,
                exchange_rate: rate
            }

            const res = await fetch(`/api/offline-events/${eventId}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setIsAddExpenseOpen(false)
            fetchData()
            setNewExpense({
                name: '',
                amount: 0,
                category: 'Other',
                expense_date: new Date().toISOString().split('T')[0],
                status: 'approved',
                description: ''
            })
        } catch (error: any) {
            alert('Ошибка при добавлении расхода: ' + error.message)
        }
    }

    const handleDeleteExpense = async (expenseId: string) => {
        if (!confirm('Вы уверены, что хотите удалить этот расход?')) return
        try {
            const res = await fetch(`/api/offline-events/${eventId}/expenses/${expenseId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                fetchData()
            }
        } catch (error) {
            console.error('Error deleting expense:', error)
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        try {
            const res = await fetch(`/api/offline-events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setEvent(prev => prev ? { ...prev, status: newStatus as any } : null)
        } catch (error: any) {
            alert('Ошибка при обновлении статуса: ' + error.message)
        }
    }

    if (loading) return <div>Загрузка...</div>
    if (!event) return <div>Событие не найдено</div>

    const statusLabels: Record<string, string> = {
        planned: 'Запланировано',
        completed: 'Завершено',
        cancelled: 'Отменено'
    }

    const attendeeStatusLabels: Record<string, string> = {
        registered: 'Зарегистрирован',
        confirmed: 'Подтвержден',
        attended: 'Посетил',
        cancelled: 'Отменил',
        no_show: 'Не пришел'
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold">{event.name}</h2>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <span>{new Date(event.event_date).toLocaleDateString('ru-RU')}</span>
                            <span>•</span>
                            <span>{event.location || 'Нет локации'}</span>
                            <Badge variant={event.status === 'completed' ? 'default' : 'secondary'}>
                                {statusLabels[event.status] || event.status}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Select
                        value={event.status}
                        onValueChange={handleStatusChange}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Статус" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="planned">Запланировано</SelectItem>
                            <SelectItem value="completed">Завершено</SelectItem>
                            <SelectItem value="cancelled">Отменено</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Download className="w-4 h-4" /> Экспорт
                    </Button>
                </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Общий Доход</p>
                    <p className="text-xl font-bold text-green-600">
                        ${summary?.total_income.toLocaleString()}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Общие Расходы</p>
                    <p className="text-xl font-bold text-red-600">
                        ${summary?.total_expenses.toLocaleString()}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">Баланс</p>
                    <p className={`text-xl font-bold ${summary?.balance && summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${summary?.balance.toLocaleString()}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground">ROI</p>
                    <p className="text-xl font-bold text-blue-600">
                        {summary?.roi ? summary.roi.toFixed(1) : 0}%
                    </p>
                </Card>
            </div>

            {/* Tabs for Attendees and Expenses */}
            <Tabs defaultValue="attendees" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="attendees">Участники ({attendees.length})</TabsTrigger>
                    <TabsTrigger value="expenses">Расходы ({expenses.length})</TabsTrigger>
                </TabsList>

                {/* Attendees Tab */}
                <TabsContent value="attendees">
                    <Card>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Список Участников</h3>
                                <Button size="sm" className="gap-2" onClick={() => setIsAddAttendeeOpen(true)}>
                                    <Plus className="w-4 h-4" /> Добавить
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Имя</TableHead>
                                            <TableHead>Тип</TableHead>
                                            <TableHead>Доход</TableHead>
                                            <TableHead>Статус</TableHead>
                                            <TableHead>Действия</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {attendees.map((attendee) => (
                                            <TableRow key={attendee.id}>
                                                <TableCell className="font-medium">
                                                    {attendee.attendee_type === 'participant'
                                                        ? attendee.participant_name
                                                        : attendee.guest_name}
                                                    {attendee.attendee_type === 'guest' && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {attendee.guest_email || attendee.guest_phone}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={attendee.attendee_type === 'participant' ? 'outline' : 'secondary'}>
                                                        {attendee.attendee_type === 'participant' ? 'Участник' : 'Гость'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-green-600 font-medium">
                                                    +${attendee.payment_received.toLocaleString()}
                                                    {attendee.currency === 'TJS' && attendee.original_amount && (
                                                        <span className="text-xs text-muted-foreground block">
                                                            ({Number(attendee.original_amount).toLocaleString()} TJS)
                                                        </span>
                                                    )}
                                                    {attendee.payment_notes && <div className="text-xs text-muted-foreground">{attendee.payment_notes}</div>}
                                                </TableCell>
                                                <TableCell>{attendeeStatusLabels[attendee.attendance_status] || attendee.attendance_status}</TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteAttendee(attendee.id)}>
                                                        <Trash2 className="w-4 h-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </Card>
                </TabsContent>

                {/* Expenses Tab */}
                <TabsContent value="expenses">
                    <Card>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Список Расходов</h3>
                                <Button size="sm" className="gap-2" onClick={() => setIsAddExpenseOpen(true)}>
                                    <Plus className="w-4 h-4" /> Добавить
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Название</TableHead>
                                            <TableHead>Категория</TableHead>
                                            <TableHead>Дата</TableHead>
                                            <TableHead>Сумма</TableHead>
                                            <TableHead>Действия</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {expenses.map((expense) => (
                                            <TableRow key={expense.id}>
                                                <TableCell className="font-medium">{expense.name}</TableCell>
                                                <TableCell>{expense.category}</TableCell>
                                                <TableCell>{new Date(expense.expense_date).toLocaleDateString('ru-RU')}</TableCell>
                                                <TableCell className="text-red-600 font-bold">
                                                    -${expense.amount.toLocaleString()}
                                                    {expense.currency === 'TJS' && expense.original_amount && (
                                                        <span className="text-xs text-muted-foreground block">
                                                            ({Number(expense.original_amount).toLocaleString()} TJS)
                                                        </span>
                                                    )}
                                                    {expense.description && <div className="text-xs text-muted-foreground">{expense.description}</div>}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteExpense(expense.id)}>
                                                        <Trash2 className="w-4 h-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modal: Add Attendee */}
            <Dialog open={isAddAttendeeOpen} onOpenChange={setIsAddAttendeeOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Добавить Участника</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Тип</Label>
                            <Select
                                value={newAttendee.attendee_type}
                                onValueChange={(v: any) => setNewAttendee({ ...newAttendee, attendee_type: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="participant">Участник программы</SelectItem>
                                    <SelectItem value="guest">Гость</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {newAttendee.attendee_type === 'participant' ? (
                            <div className="space-y-2">
                                <Label>Выберите Участника</Label>
                                <Select
                                    value={newAttendee.participant_id}
                                    onValueChange={(v) => setNewAttendee({ ...newAttendee, participant_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Поиск..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {participantsList.map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label>Имя Гостя</Label>
                                    <Input
                                        value={newAttendee.guest_name || ''}
                                        onChange={e => setNewAttendee({ ...newAttendee, guest_name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Телефон / Email</Label>
                                    <Input
                                        value={newAttendee.guest_phone || ''}
                                        onChange={e => setNewAttendee({ ...newAttendee, guest_phone: e.target.value })}
                                    />
                                </div>
                            </>
                        )}

                        <div className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <Label>Получено Оплаты</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={newAttendee.payment_received}
                                        onChange={e => setNewAttendee({ ...newAttendee, payment_received: parseFloat(e.target.value) || 0 })}
                                    />
                                    <div className="absolute right-1 top-1">
                                        <select
                                            value={attendeeCurrency}
                                            onChange={(e) => setAttendeeCurrency(e.target.value as 'USD' | 'TJS')}
                                            className="h-8 border-none bg-transparent focus:ring-0 text-xs font-semibold text-muted-foreground cursor-pointer"
                                            style={{ outline: 'none' }}
                                        >
                                            <option value="USD">USD</option>
                                            <option value="TJS">TJS</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            {attendeeCurrency === 'TJS' && (
                                <div className="w-24 space-y-2">
                                    <Label>Курс</Label>
                                    <Input
                                        type="number"
                                        value={attendeeExchangeRate}
                                        onChange={(e) => setAttendeeExchangeRate(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                        {attendeeCurrency === 'TJS' && newAttendee.payment_received && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                    ≈ ${(Number(newAttendee.payment_received) / Number(attendeeExchangeRate || 1)).toFixed(2)} USD
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Комментарий</Label>
                            <Input
                                value={newAttendee.payment_notes || ''}
                                onChange={e => setNewAttendee({ ...newAttendee, payment_notes: e.target.value })}
                                placeholder="Например: наличные, перевод..."
                            />
                        </div>

                        <Button className="w-full mt-4" onClick={handleAddAttendee}>Сохранить</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Modal: Add Expense */}
            <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Добавить Расход</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Название</Label>
                            <Input
                                value={newExpense.name}
                                onChange={e => setNewExpense({ ...newExpense, name: e.target.value })}
                                placeholder="Например: Аренда зала"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Категория</Label>
                            <Select
                                value={newExpense.category}
                                onValueChange={(v) => setNewExpense({ ...newExpense, category: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Venue">Аренда (Venue)</SelectItem>
                                    <SelectItem value="Food">Еда (Food)</SelectItem>
                                    <SelectItem value="Marketing">Маркетинг (Marketing)</SelectItem>
                                    <SelectItem value="Transport">Транспорт (Transport)</SelectItem>
                                    <SelectItem value="Other">Другое (Other)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1 space-y-2">
                                <Label>Сумма</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        value={newExpense.amount}
                                        onChange={e => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                                    />
                                    <div className="absolute right-1 top-1">
                                        <select
                                            value={expenseCurrency}
                                            onChange={(e) => setExpenseCurrency(e.target.value as 'USD' | 'TJS')}
                                            className="h-8 border-none bg-transparent focus:ring-0 text-xs font-semibold text-muted-foreground cursor-pointer"
                                            style={{ outline: 'none' }}
                                        >
                                            <option value="USD">USD</option>
                                            <option value="TJS">TJS</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            {expenseCurrency === 'TJS' && (
                                <div className="w-24 space-y-2">
                                    <Label>Курс</Label>
                                    <Input
                                        type="number"
                                        value={expenseExchangeRate}
                                        onChange={(e) => setExpenseExchangeRate(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                        {expenseCurrency === 'TJS' && newExpense.amount && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                    ≈ ${(Number(newExpense.amount) / Number(expenseExchangeRate || 1)).toFixed(2)} USD
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Комментарий</Label>
                            <Input
                                value={newExpense.description || ''}
                                onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                placeholder="Детали расхода..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Дата</Label>
                            <Input
                                type="date"
                                value={newExpense.expense_date}
                                onChange={e => setNewExpense({ ...newExpense, expense_date: e.target.value })}
                            />
                        </div>

                        <Button className="w-full mt-4" onClick={handleAddExpense}>Сохранить Расход</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
