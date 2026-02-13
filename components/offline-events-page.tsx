'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Edit2, Trash2, AlertCircle, Eye } from 'lucide-react'
import { EventDetailPage } from '@/components/offline-event-detail-page'

interface OfflineEvent {
  id: string
  name: string
  description?: string
  event_date: string
  location?: string
  status: 'planned' | 'completed' | 'cancelled'
  total_income: number
  total_expenses: number
  balance: number
  attendees_registered: number
  attendees_attended: number
  program_id?: string
}

export function OfflineEventsPage() {
  const [events, setEvents] = useState<OfflineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Add Event Form State
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    event_date: '',
    location: '',
  })

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/offline-events')
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setEvents(result.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEvent = async () => {
    try {
      const response = await fetch('/api/offline-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          status: 'planned'
        })
      })

      const result = await response.json()
      if (result.error) throw new Error(result.error)

      fetchEvents() // Reload list
      setIsOpen(false)
      setFormData({ name: '', description: '', event_date: '', location: '' })
    } catch (err: any) {
      alert('Ошибка при создании события: ' + err.message)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить это событие?')) return
    try {
      const res = await fetch(`/api/offline-events/${id}`, { method: 'DELETE' })
      if (res.ok) fetchEvents()
    } catch (err) {
      console.error(err)
    }
  }

  // If detail view is active
  if (selectedEventId) {
    return (
      <EventDetailPage
        eventId={selectedEventId}
        onBack={() => {
          setSelectedEventId(null)
          fetchEvents() // Refresh data on back
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка событий...</p>
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
              <p className="font-medium text-foreground">Ошибка загрузки</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const filteredEvents = events.filter(event => {
    const matchesStatus = filterStatus === 'all' || event.status === filterStatus
    const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (event.location && event.location.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesStatus && matchesSearch
  })

  const totalIncome = filteredEvents.reduce((sum, e) => sum + (e.total_income || 0), 0)
  const totalExpenses = filteredEvents.reduce((sum, e) => sum + (e.total_expenses || 0), 0)
  const totalBalance = totalIncome - totalExpenses
  const totalAttendees = filteredEvents.reduce((sum, e) => sum + (e.attendees_attended || 0), 0)

  const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
    planned: 'secondary',
    completed: 'default',
    cancelled: 'destructive',
  }

  const statusLabels: Record<string, string> = {
    planned: 'Запланировано',
    completed: 'Завершено',
    cancelled: 'Отменено',
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Оффлайн События</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Управление мероприятиями и участниками</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Поиск..."
              className="w-[200px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="planned">Запланировано</SelectItem>
                <SelectItem value="completed">Завершено</SelectItem>
                <SelectItem value="cancelled">Отменено</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Добавить событие</span>
                  <span className="sm:hidden">Добавить</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новое Событие</DialogTitle>
                  <DialogDescription>Создайте новое оффлайн мероприятие</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Название</Label>
                    <Input
                      id="name"
                      placeholder="Название события"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Описание</Label>
                    <Input
                      id="description"
                      placeholder="Краткое описание"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="event_date">Дата</Label>
                    <Input
                      id="event_date"
                      type="date"
                      value={formData.event_date}
                      onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="location">Локация</Label>
                    <Input
                      id="location"
                      placeholder="Город или адрес"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddEvent} className="w-full">
                    Создать Событие
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Общий Доход</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600 mt-1 sm:mt-2">${totalIncome.toLocaleString()}</p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Общие Расходы</p>
          <p className="text-lg sm:text-2xl font-bold text-red-600 mt-1 sm:mt-2">${totalExpenses.toLocaleString()}</p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Баланс</p>
          <p className={`text-lg sm:text-2xl font-bold mt-1 sm:mt-2 ${totalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${totalBalance.toLocaleString()}
          </p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Посетители</p>
          <p className="text-lg sm:text-2xl font-bold text-foreground mt-1 sm:mt-2">{totalAttendees}</p>
        </Card>
      </div>

      {/* Events Table */}
      <Card className="bg-card border-border">
        <div className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Список Событий</h3>
          {filteredEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">События не найдены</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Название</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Дата</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Баланс</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">ROI</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Участники (Рег.)</TableHead>
                    <TableHead className="text-xs sm:text-sm">Статус</TableHead>
                    <TableHead className="text-xs sm:text-sm">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => {
                    const roi = event.total_expenses > 0 ? ((event.balance / event.total_expenses) * 100).toFixed(1) : 0
                    return (
                      <TableRow key={event.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEventId(event.id)}>
                        <TableCell className="font-medium text-xs sm:text-sm">{event.name}</TableCell>
                        <TableCell className="text-xs sm:text-sm hidden sm:table-cell">{new Date(event.event_date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell className={`text-xs sm:text-sm hidden md:table-cell ${event.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${Number(event.balance || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm hidden lg:table-cell text-blue-600">{roi}%</TableCell>
                        <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                          {event.attendees_registered}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[event.status]} className="text-[10px] sm:text-xs">
                            {statusLabels[event.status] || event.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 sm:gap-2" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedEventId(event.id)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteEvent(event.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
