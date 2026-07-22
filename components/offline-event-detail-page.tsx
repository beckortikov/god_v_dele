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
import { ArrowLeft, Plus, Trash2, Edit2, Download, Search } from 'lucide-react'

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

interface Participant {
    id: string
    name: string
    email?: string
    phone?: string
    status?: string
    program_id?: string
    program?: {
        id: string
        name: string
    }
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
    const [participantsList, setParticipantsList] = useState<Participant[]>([])

    // Modal states
    const [isAddAttendeeOpen, setIsAddAttendeeOpen] = useState(false)
    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)

    // Filter states for participant dialog
    const [searchQuery, setSearchQuery] = useState('')
    const [filterProgramId, setFilterProgramId] = useState('all')
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])

    const [newAttendee, setNewAttendee] = useState<Partial<Attendee>>({
        attendee_type: 'participant',
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
                attendee_type: 'participant',
                payment_received: 0,
                attendance_status: 'registered',
                payment_notes: ''
            })
        } catch (error: any) {
            alert('Ошибка при добавлении участника: ' + error.message)
        }
    }

    const handleAddAttendeesBatch = async () => {
        if (selectedParticipantIds.length === 0) return

        try {
            let finalAmountUSD = Number(newAttendee.payment_received || 0)
            let originalAmount = Number(newAttendee.payment_received || 0)
            let rate = 1

            if (attendeeCurrency === 'TJS') {
                rate = Number(attendeeExchangeRate)
                if (!rate || rate <= 0) {
                    alert('Введите корректный курс обмена')
                    return
                }
                finalAmountUSD = originalAmount / rate
            }

            const attendeesToInsert = selectedParticipantIds.map(participantId => {
                return {
                    attendee_type: 'participant',
                    participant_id: participantId,
                    payment_received: finalAmountUSD,
                    original_amount: originalAmount,
                    currency: attendeeCurrency,
                    exchange_rate: rate,
                    attendance_status: newAttendee.attendance_status || 'registered',
                    payment_notes: newAttendee.payment_notes || ''
                }
            })

            const res = await fetch(`/api/offline-events/${eventId}/attendees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendees: attendeesToInsert })
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setIsAddAttendeeOpen(false)
            fetchData()
            // Reset states
            setSelectedParticipantIds([])
            setSearchQuery('')
            setFilterProgramId('all')
            setNewAttendee({
                attendee_type: 'participant',
                payment_received: 0,
                attendance_status: 'registered',
                payment_notes: '',
                currency: 'TJS',
                exchange_rate: 10.5
            })
        } catch (error: any) {
            alert('Ошибка при добавлении участников: ' + error.message)
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

    // Filter available participants for event registration (hide already registered)
    const existingParticipantIds = new Set(attendees.map(a => a.participant_id).filter(Boolean))
    const availableParticipants = participantsList.filter(p => !existingParticipantIds.has(p.id))

    const filteredAvailableParticipants = availableParticipants.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (p.phone && p.phone.toLowerCase().includes(searchQuery.toLowerCase()))
        
        const matchesProgram = filterProgramId === 'all' || p.program_id === filterProgramId
        
        return matchesSearch && matchesProgram
    })

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
            <Dialog open={isAddAttendeeOpen} onOpenChange={(open) => {
                setIsAddAttendeeOpen(open)
                if (!open) {
                    setSelectedParticipantIds([])
                    setSearchQuery('')
                    setFilterProgramId('all')
                    setNewAttendee({
                        attendee_type: 'participant',
                        payment_received: 0,
                        attendance_status: 'registered',
                        payment_notes: '',
                        currency: 'TJS',
                        exchange_rate: 10.5
                    })
                }
            }}>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-3.5 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>Добавить Участников на Мероприятие</DialogTitle>
                    </DialogHeader>
                    
                    <Tabs value={newAttendee.attendee_type} onValueChange={(val: any) => setNewAttendee({ ...newAttendee, attendee_type: val })} className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="participant">Участники программ ({availableParticipants.length})</TabsTrigger>
                            <TabsTrigger value="guest">Гости</TabsTrigger>
                        </TabsList>

                        {/* Participant Tab */}
                        <TabsContent value="participant" className="flex-1 flex flex-col overflow-hidden space-y-4 pt-4 min-h-0">
                            {/* Search & Program Filter */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Поиск по имени, email, тел..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8"
                                    />
                                </div>
                                <div>
                                    <select
                                        value={filterProgramId}
                                        onChange={(e) => setFilterProgramId(e.target.value)}
                                        className="w-full h-10 px-3 py-2 bg-background border border-input rounded-md text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="all">Все программы</option>
                                        {Array.from(new Set(participantsList.map(p => p.program?.id).filter(Boolean))).map(id => {
                                            const prog = participantsList.find(p => p.program?.id === id)?.program;
                                            return prog ? <option key={prog.id} value={prog.id}>{prog.name}</option> : null;
                                        })}
                                    </select>
                                </div>
                            </div>

                            {/* Select all & Count */}
                            <div className="flex justify-between items-center px-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="selectAll"
                                        checked={filteredAvailableParticipants.length > 0 && filteredAvailableParticipants.every(p => selectedParticipantIds.includes(p.id))}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                const newSelected = [...selectedParticipantIds];
                                                filteredAvailableParticipants.forEach(p => {
                                                    if (!newSelected.includes(p.id)) newSelected.push(p.id);
                                                });
                                                setSelectedParticipantIds(newSelected);
                                            } else {
                                                const filteredIds = new Set(filteredAvailableParticipants.map(p => p.id));
                                                setSelectedParticipantIds(selectedParticipantIds.filter(id => !filteredIds.has(id)));
                                            }
                                        }}
                                        className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                                    />
                                    <label htmlFor="selectAll" className="cursor-pointer font-medium select-none text-foreground">
                                        Выбрать всех отфильтрованных ({filteredAvailableParticipants.length})
                                    </label>
                                </div>
                                <div>
                                    Выбрано: <span className="font-bold text-foreground">{selectedParticipantIds.length}</span>
                                </div>
                            </div>

                            {/* Scrollable list of participants */}
                            <div className="flex-1 min-h-[150px] overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-muted/10 max-h-[300px]">
                                {filteredAvailableParticipants.length === 0 ? (
                                    <div className="text-center py-8 text-sm text-muted-foreground">
                                        Нет доступных участников
                                    </div>
                                ) : (
                                    filteredAvailableParticipants.map((p) => {
                                        const isSelected = selectedParticipantIds.includes(p.id);
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedParticipantIds(selectedParticipantIds.filter(id => id !== p.id));
                                                    } else {
                                                        setSelectedParticipantIds([...selectedParticipantIds, p.id]);
                                                    }
                                                }}
                                                className={`flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors border ${
                                                    isSelected ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' : 'border-transparent'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}} // handled by row onClick
                                                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring pointer-events-none"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                                                    {p.phone || p.email ? (
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {p.phone} {p.email ? `• ${p.email}` : ''}
                                                        </p>
                                                    ) : null}
                                                </div>
                                                {p.program?.name && (
                                                    <Badge variant="outline" className="text-[10px] py-0 px-2 max-w-[150px] truncate">
                                                        {p.program.name}
                                                    </Badge>
                                                )}
                                                {p.status && (
                                                    <Badge
                                                        variant={p.status === 'active' ? 'default' : 'secondary'}
                                                        className={`text-[9px] py-0 px-1.5 uppercase tracking-wider ${
                                                            p.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-200 border-none' : ''
                                                        }`}
                                                    >
                                                        {p.status === 'active' ? 'актив' : p.status}
                                                    </Badge>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Payment settings (shown only if at least one selected) */}
                            {selectedParticipantIds.length > 0 && (
                                <div className="p-3 border border-border rounded-md bg-card space-y-3">
                                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                        Настройки оплаты для {selectedParticipantIds.length} выбр. участников
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs">Оплата</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        value={newAttendee.payment_received}
                                                        onChange={e => setNewAttendee({ ...newAttendee, payment_received: parseFloat(e.target.value) || 0 })}
                                                        className="h-9"
                                                    />
                                                    <div className="absolute right-1 top-1">
                                                        <select
                                                            value={attendeeCurrency}
                                                            onChange={(e) => setAttendeeCurrency(e.target.value as 'USD' | 'TJS')}
                                                            className="h-7 border-none bg-transparent focus:ring-0 text-xs font-semibold text-muted-foreground cursor-pointer"
                                                            style={{ outline: 'none' }}
                                                        >
                                                            <option value="USD">USD</option>
                                                            <option value="TJS">TJS</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                            {attendeeCurrency === 'TJS' && (
                                                <div className="w-20 space-y-1">
                                                    <Label className="text-xs">Курс</Label>
                                                    <Input
                                                        type="number"
                                                        value={attendeeExchangeRate}
                                                        onChange={(e) => setAttendeeExchangeRate(e.target.value)}
                                                        className="h-9"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <Label className="text-xs">Статус присутствия</Label>
                                            <select
                                                value={newAttendee.attendance_status}
                                                onChange={(e) => setNewAttendee({ ...newAttendee, attendance_status: e.target.value })}
                                                className="w-full h-9 px-3 py-1 bg-background border border-input rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                                            >
                                                <option value="registered">Зарегистрирован</option>
                                                <option value="confirmed">Подтвержден</option>
                                                <option value="attended">Присутствовал</option>
                                                <option value="cancelled">Отменен</option>
                                                <option value="no_show">Не пришел</option>
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {attendeeCurrency === 'TJS' && newAttendee.payment_received ? (
                                        <p className="text-[10px] text-muted-foreground text-right">
                                            ≈ ${(Number(newAttendee.payment_received) / Number(attendeeExchangeRate || 1)).toFixed(2)} USD
                                        </p>
                                    ) : null}

                                    <div className="space-y-1">
                                        <Label className="text-xs">Комментарий к платежу</Label>
                                        <Input
                                            value={newAttendee.payment_notes || ''}
                                            onChange={e => setNewAttendee({ ...newAttendee, payment_notes: e.target.value })}
                                            placeholder="Например: наличные, перевод..."
                                            className="h-9"
                                        />
                                    </div>
                                </div>
                            )}

                            <Button
                                className="w-full mt-2"
                                onClick={handleAddAttendeesBatch}
                                disabled={selectedParticipantIds.length === 0}
                            >
                                Добавить выбранных ({selectedParticipantIds.length})
                            </Button>
                        </TabsContent>

                        {/* Guest Tab */}
                        <TabsContent value="guest" className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Имя Гостя</Label>
                                <Input
                                    value={newAttendee.guest_name || ''}
                                    onChange={e => setNewAttendee({ ...newAttendee, guest_name: e.target.value })}
                                    placeholder="Введите ФИО гостя"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Телефон / Email</Label>
                                <Input
                                    value={newAttendee.guest_phone || ''}
                                    onChange={e => setNewAttendee({ ...newAttendee, guest_phone: e.target.value })}
                                    placeholder="+7 (999) 123-45-67 или guest@example.com"
                                />
                            </div>

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
                                <Label>Комментарий к платежу</Label>
                                <Input
                                    value={newAttendee.payment_notes || ''}
                                    onChange={e => setNewAttendee({ ...newAttendee, payment_notes: e.target.value })}
                                    placeholder="Например: наличные, перевод..."
                                />
                            </div>

                            <Button className="w-full mt-4" onClick={handleAddAttendee}>
                                Сохранить Гостя
                            </Button>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Modal: Add Expense */}
            <Dialog open={isAddExpenseOpen} onOpenChange={setIsAddExpenseOpen}>
                <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
