'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit2, Archive, ChevronDown, Search, X, AlertCircle } from 'lucide-react'

interface Program {
  id: string
  name: string
  price_per_month: number
  duration_months: number
}

interface Participant {
  id: string
  name: string
  email?: string
  phone?: string
  program_id: string
  start_date: string
  status: 'active' | 'completed' | 'archived'
  tariff?: number
  program?: Program
}

interface MonthlyPayment {
  id: string
  month_number: number
  year: number
  amount: number
  fact_amount: number
  status: string
  participant_id: string
  payment_month?: string
}

// Helper to check if participant has overdue payments (past months unpaid)
const checkOverdue = (participant: any, payments: any[]) => {
  if (!participant.start_date) return false

  const start = new Date(participant.start_date)
  const now = new Date()
  const pPayments = payments.filter((p: any) => p.participant_id === participant.id)

  // Normalize dates to start of month
  let currentDate = new Date(start.getFullYear(), start.getMonth(), 1)
  const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Iterate through past months up to (but not including) current month
  while (currentDate < firstDayCurrentMonth) {
    const month = currentDate.getMonth() + 1
    const year = currentDate.getFullYear()

    const payment = pPayments.find((p: any) => p.month_number === month && p.year === year)
    const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
    const fact = payment?.fact_amount || 0

    // Condition 1: No payment record for past month
    // Condition 2: Payment exists but not fully paid (fact < plan)
    if (!payment || (fact < plan)) {
      return true
    }

    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  return false
}

// Helper to check partial payment in ANY month
const checkPartial = (participant: any, payments: any[]) => {
  const pPayments = payments.filter((p: any) => p.participant_id === participant.id)

  return pPayments.some((p: any) => {
    const plan = p.amount || participant.tariff || participant.program?.price_per_month || 0
    const fact = p.fact_amount || 0

    // Check if partial: paid something but less than plan
    return fact > 0 && fact < plan
  })
}

export function ParticipantsPage() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [payments, setPayments] = useState<MonthlyPayment[]>([]) // Store payments
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed' | 'archived'>('all')
  const [filterProgram, setFilterProgram] = useState<string>('all')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    program_id: '',
    tariff: '',
    start_date: ''
  })
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/participants').then(res => res.json()),
      fetch('/api/programs').then(res => res.json()),
      fetch('/api/monthly-payments').then(res => res.json()) // Fetch payments
    ])
      .then(([participantsRes, programsRes, paymentsRes]) => {
        if (participantsRes.error) throw new Error(participantsRes.error)
        if (programsRes.error) throw new Error(programsRes.error)
        if (paymentsRes.error) throw new Error(paymentsRes.error)

        setParticipants(participantsRes.data || [])
        setPrograms(programsRes.data || [])
        setPayments(paymentsRes.data || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])



  // ... (inside the component)

  const handleAddParticipant = async () => {
    try {
      const payload = {
        ...formData,
        tariff: formData.tariff ? Number(formData.tariff) : null
      }

      const response = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      if (result.error) throw new Error(result.error)

      setParticipants([...participants, result.data[0]])
      setIsOpen(false)
      setFormData({ name: '', email: '', phone: '', program_id: '', tariff: '', start_date: '' })
    } catch (err: any) {
      alert('Ошибка при добавлении участника: ' + err.message)
    }
  }

  const handleEditClick = (participant: Participant) => {
    setFormData({
      name: participant.name,
      email: participant.email || '',
      phone: participant.phone || '',
      program_id: participant.program_id,
      tariff: participant.tariff ? String(participant.tariff) : '',
      start_date: participant.start_date.split('T')[0]
    })
    setEditingId(participant.id)
    setIsEditMode(true)
    setIsOpen(true)
  }

  const handleSaveParticipant = async () => {
    if (isEditMode && editingId) {
      await handleUpdateParticipant()
    } else {
      await handleAddParticipant()
    }
  }

  const handleUpdateParticipant = async () => {
    try {
      const payload = {
        id: editingId,
        ...formData,
        tariff: formData.tariff ? Number(formData.tariff) : null
      }

      const response = await fetch('/api/participants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      if (result.error) throw new Error(result.error)

      // Update local state
      setParticipants(participants.map(p => p.id === editingId ? { ...p, ...payload, tariff: payload.tariff } : p))
      setIsOpen(false)
      setIsEditMode(false)
      setEditingId(null)
      setFormData({ name: '', email: '', phone: '', program_id: '', tariff: '', start_date: '' })
    } catch (err: any) {
      alert('Ошибка при обновлении: ' + err.message)
    }
  }

  // ... (Update the Dialog trigger and content to handle both modes) ...
  // In the JSX where the Dialog is defined:
  // <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) { setIsEditMode(false); setEditingId(null); setFormData(...) } }}>
  //   <DialogTitle>{isEditMode ? 'Редактировать участника' : 'Добавить нового участника'}</DialogTitle>
  //   <DialogDescription>{isEditMode ? 'Измените данные участника' : 'Заполните информацию о новом участнике'}</DialogDescription>
  //   ...
  //   <Button onClick={handleSaveParticipant}>{isEditMode ? 'Сохранить изменения' : 'Создать участника'}</Button>

  // ... (Update the Edit button in the list) ...
  // <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEditClick(participant); }}>
  //   <Edit2 ... /> Редактировать
  // </Button>

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка данных...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6 bg-destructive/5 border-destructive">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Ошибка загрузки данных</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const filteredParticipants = participants.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus
    const matchesProgram = filterProgram === 'all' || p.program_id === filterProgram
    return matchesSearch && matchesStatus && matchesProgram
  })

  const activeCount = filteredParticipants.filter(p => p.status === 'active').length
  const totalMonthlyPlanned = filteredParticipants
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.tariff || p.program?.price_per_month || 0), 0)

  const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
    active: 'default',
    completed: 'secondary',
    archived: 'destructive',
  }

  const statusLabels: Record<string, string> = {
    active: 'Активный',
    completed: 'Завершено',
    archived: 'Архив',
  }

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Участники</h2>
          <p className="text-sm text-muted-foreground mt-1">Управление участниками программ обучения</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open)
          if (!open) {
            setIsEditMode(false)
            setEditingId(null)
            setFormData({ name: '', email: '', phone: '', program_id: '', tariff: '', start_date: '' })
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить участника
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Редактировать участника' : 'Добавить нового участника'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? 'Измените данные участника' : 'Заполните информацию о новом участнике программы обучения'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">ФИО</Label>
                <Input
                  id="name"
                  placeholder="Введите ФИО"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  placeholder="+7 (999) 123-45-67"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="program">Программа</Label>
                <select
                  id="program"
                  value={formData.program_id}
                  onChange={(e) => setFormData({ ...formData, program_id: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
                >
                  <option value="">Выберите программу</option>
                  {programs.map(prog => (
                    <option key={prog.id} value={prog.id}>{prog.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="tariff">Индивидуальный тариф ($)</Label>
                <Input
                  id="tariff"
                  type="number"
                  placeholder="Оставьте пустым для цены программы"
                  value={formData.tariff}
                  onChange={(e) => setFormData({ ...formData, tariff: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="startDate">Дата начала</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <Button onClick={handleSaveParticipant} className="w-full">
                {isEditMode ? 'Сохранить изменения' : 'Создать участника'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-1">Активных участников</p>
          <p className="text-2xl font-bold text-foreground mb-1">{activeCount}</p>
          <p className="text-[10px] text-muted-foreground">на программах</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-1">Ежемесячный доход</p>
          <p className="text-2xl font-bold text-foreground mb-1">${totalMonthlyPlanned.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">плановая сумма</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-1">Просроченные платежи</p>
          <p className="text-2xl font-bold text-red-600 mb-1">
            {participants.filter(p => checkOverdue(p, payments)).length}
          </p>
          <p className="text-[10px] text-muted-foreground">участников</p>
        </Card>

        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-1">Неполные платежи</p>
          <p className="text-2xl font-bold text-orange-600 mb-1">
            {participants.filter(p => checkPartial(p, payments)).length}
          </p>
          <p className="text-[10px] text-muted-foreground">участников</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-64">
            <label className="text-sm font-medium text-foreground block mb-2">Поиск по имени</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Начните вводить имя..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="w-48">
            <label className="text-sm font-medium text-foreground block mb-2">Статус</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm"
            >
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="completed">Завершено</option>
              <option value="archived">Архив</option>
            </select>
          </div>

          <div className="w-48">
            <label className="text-sm font-medium text-foreground block mb-2">Программа</label>
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm"
            >
              <option value="all">Все программы</option>
              {programs.map(prog => (
                <option key={prog.id} value={prog.id}>{prog.name}</option>
              ))}
            </select>
          </div>

          {(searchQuery || filterStatus !== 'all' || filterProgram !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('')
                setFilterStatus('all')
                setFilterProgram('all')
              }}
            >
              Сбросить фильтры
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Найдено: <span className="font-semibold text-foreground">{filteredParticipants.length}</span> из {participants.length} участников
        </div>
      </div>



      {/* Participants List */}
      <div className="space-y-3">
        {filteredParticipants.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-muted-foreground">Участники не найдены</p>
          </Card>
        ) : (
          filteredParticipants.map((participant) => {
            const isExpanded = expandedId === participant.id

            return (
              <Card key={participant.id} className="bg-card border-border overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/20 transition-colors flex justify-between items-center"
                  onClick={() => setExpandedId(isExpanded ? null : participant.id)}
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{participant.name}</p>
                        {(() => {
                          const badges = []

                          if (checkOverdue(participant, payments)) {
                            badges.push(
                              <Badge key="overdue" variant="destructive" className="text-[10px] h-5 px-2">
                                Просрочено
                              </Badge>
                            )
                          }

                          if (checkPartial(participant, payments)) {
                            badges.push(
                              <Badge key="partial" variant="secondary" className="text-[10px] h-5 px-2 bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200">
                                Частично
                              </Badge>
                            )
                          }

                          const now = new Date()
                          const currentMonth = now.getMonth() + 1
                          const currentYear = now.getFullYear()
                          const payment = payments.find(p => p.participant_id === participant.id && p.month_number === currentMonth && p.year === currentYear)

                          if (payment && payment.status === 'paid') {
                            badges.push(
                              <Badge key="paid" className="text-[10px] h-5 px-2 bg-teal-600 hover:bg-teal-700">
                                Оплачено
                              </Badge>
                            )
                          }

                          if (badges.length === 0) return null

                          return <div className="flex gap-1">{badges}</div>
                        })()}

                      </div>
                      <p className="text-sm text-muted-foreground">{participant.program?.name || 'Программа не указана'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Платежи</p>
                      <p className="font-semibold text-foreground">
                        {(() => {
                          const pPayments = payments.filter(p => p.participant_id === participant.id)
                          const paidCount = pPayments.filter(p => p.status === 'paid' || (p.fact_amount || 0) >= (p.amount || 0)).length
                          return `${paidCount}/${pPayments.length}`
                        })()}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Собрано</p>
                      <p className="font-semibold text-foreground">
                        {(() => {
                          const pPayments = payments.filter(p => p.participant_id === participant.id)
                          const totalPaid = pPayments.reduce((acc, curr) => acc + (curr.fact_amount || 0), 0)
                          return `$${totalPaid.toLocaleString()}`
                        })()}
                      </p>
                    </div>

                    <div className="text-right min-w-[100px]">
                      <p className="text-xs text-muted-foreground mb-1">Статус</p>
                      <Badge variant={participant.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-6 px-3">
                        {statusLabels[participant.status]}
                      </Badge>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-6 bg-muted/10">
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Информация об участнике</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm text-foreground">{participant.email || 'Не указан'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Телефон</p>
                          <p className="text-sm text-foreground">{participant.phone || 'Не указан'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Дата начала</p>
                          <p className="text-sm text-foreground">{new Date(participant.start_date).toLocaleDateString('ru-RU')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Длительность</p>
                          <p className="text-sm text-foreground">{participant.program?.duration_months || 0} месяцев</p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Месячные платежи</h4>
                      <div className="bg-background rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="h-8 bg-muted/50 hover:bg-muted/50">
                              <TableHead className="text-xs">Месяц</TableHead>
                              <TableHead className="text-xs">План</TableHead>
                              <TableHead className="text-xs">Факт</TableHead>
                              <TableHead className="text-xs">Отклонение</TableHead>
                              <TableHead className="text-xs">Статус</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              const pPayments = payments
                                .filter(p => p.participant_id === participant.id)
                                .sort((a, b) => {
                                  if (a.year !== b.year) return b.year - a.year
                                  return b.month_number - a.month_number
                                })

                              if (pPayments.length === 0) {
                                return <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Нет платежей</TableCell></TableRow>
                              }

                              return pPayments.map(payment => {
                                const plan = payment.amount || participant.tariff || participant.program?.price_per_month || 0
                                const fact = payment.fact_amount || 0
                                const deviation = fact - plan

                                return (
                                  <TableRow key={payment.id} className="h-9 hover:bg-muted/20">
                                    <TableCell className="text-sm">{payment.payment_month || `${payment.month_number}.${payment.year}`}</TableCell>
                                    <TableCell className="text-sm">${plan.toLocaleString()}</TableCell>
                                    <TableCell className="text-sm">${fact.toLocaleString()}</TableCell>
                                    <TableCell className={`text-sm ${deviation < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                      {deviation === 0 ? '$0' : (deviation > 0 ? '+' : '') + deviation.toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                      {(() => {
                                        const plan = payment.amount || participant.tariff || participant.program?.price_per_month || 0
                                        const fact = payment.fact_amount || 0

                                        let statusText = 'Ожидается'
                                        let statusVariant: 'default' | 'secondary' | 'destructive' = 'secondary'

                                        if (payment.status === 'overdue') {
                                          statusText = 'Просрочено'
                                          statusVariant = 'destructive'
                                        } else if (fact >= plan && fact > 0) {
                                          statusText = 'Оплачено'
                                          statusVariant = 'default'
                                        } else if (fact > 0 && fact < plan) {
                                          statusText = 'Частично'
                                          statusVariant = 'secondary'
                                        }

                                        return (
                                          <Badge variant={statusVariant} className="text-[10px] px-2 py-0 h-5">
                                            {statusText}
                                          </Badge>
                                        )
                                      })()}
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(participant);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Редактировать
                      </Button>
                      {participant.status !== 'archived' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleArchive(participant.id)
                          }}
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          В архив
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          }))}
      </div>
    </div >
  )
}
