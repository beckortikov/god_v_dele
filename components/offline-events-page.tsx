'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Edit2, Trash2, AlertCircle } from 'lucide-react'

interface OfflineEvent {
  id: string
  name: string
  description?: string
  event_date: string
  location?: string
  budget: number
  actual_cost: number
  participants_count?: number
  revenue: number
  status: 'planned' | 'completed' | 'cancelled'
  program_id?: string
}

export function OfflineEventsPage() {
  const [events, setEvents] = useState<OfflineEvent[]>([])
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    event_date: '',
    location: '',
    budget: '',
    participants_count: ''
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/offline-events').then(res => res.json()),
      fetch('/api/programs').then(res => res.json())
    ])
      .then(([eventsResult, programsResult]) => {
        if (eventsResult.error) throw new Error(eventsResult.error)
        setEvents(eventsResult.data || [])
        setPrograms(programsResult.data || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const handleAddEvent = async () => {
    try {
      const response = await fetch('/api/offline-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          budget: parseFloat(formData.budget),
          participants_count: parseInt(formData.participants_count) || 0,
          actual_cost: 0,
          revenue: 0,
          status: 'planned'
        })
      })

      const result = await response.json()
      if (result.error) throw new Error(result.error)

      setEvents([...events, result.data[0]])
      setIsOpen(false)
      setFormData({ name: '', description: '', event_date: '', location: '', budget: '', participants_count: '' })
    } catch (err: any) {
      alert('Ошибка при добавлении мероприятия: ' + err.message)
    }
  }

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

  const filteredEvents = filterProgram === 'all'
    ? events
    : events.filter(e => e.program_id === filterProgram)

  const totalBudget = filteredEvents.reduce((sum, e) => sum + e.budget, 0)
  const totalSpent = filteredEvents.reduce((sum, e) => sum + e.actual_cost, 0)
  const totalRevenue = filteredEvents.reduce((sum, e) => sum + e.revenue, 0)
  const totalROI = totalSpent > 0 ? ((totalRevenue - totalSpent) / totalSpent * 100).toFixed(1) : '0'

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

  const chartData = filteredEvents.map(e => ({
    name: e.name.length > 15 ? e.name.substring(0, 15) + '...' : e.name,
    budget: e.budget,
    spent: e.actual_cost
  }))

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Оффлайн мероприятия</h2>
          <p className="text-sm text-muted-foreground mt-1">Управление мероприятиями и их бюджетами</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="w-64">
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
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Добавить мероприятие
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новое мероприятие</DialogTitle>
                <DialogDescription>Создайте новое оффлайн мероприятие</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Название</Label>
                  <Input
                    id="name"
                    placeholder="Название мероприятия"
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
                  <Label htmlFor="location">Место</Label>
                  <Input
                    id="location"
                    placeholder="Город или адрес"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="budget">Бюджет ($)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="0"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="participants">Участников</Label>
                  <Input
                    id="participants"
                    type="number"
                    placeholder="0"
                    value={formData.participants_count}
                    onChange={(e) => setFormData({ ...formData, participants_count: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddEvent} className="w-full">
                  Создать мероприятие
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Общий бюджет</p>
          <p className="text-2xl font-bold text-foreground mt-2">${totalBudget.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Потрачено</p>
          <p className="text-2xl font-bold text-foreground mt-2">${totalSpent.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Доход</p>
          <p className="text-2xl font-bold text-foreground mt-2">${totalRevenue.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">ROI</p>
          <p className="text-2xl font-bold text-green-600 mt-2">{totalROI}%</p>
        </Card>
      </div>

      {/* Charts */}
      {filteredEvents.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Бюджет vs Расходы</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                <Legend />
                <Bar dataKey="budget" fill="#3b82f6" name="Бюджет" />
                <Bar dataKey="spent" fill="#ef4444" name="Потрачено" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 bg-card border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Распределение бюджета</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="budget"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* Events Table */}
      <Card className="bg-card border-border">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Список мероприятий</h3>
          {filteredEvents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Нет мероприятий</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Место</TableHead>
                  <TableHead>Бюджет</TableHead>
                  <TableHead>Потрачено</TableHead>
                  <TableHead>Участников</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell>{new Date(event.event_date).toLocaleDateString('ru-RU')}</TableCell>
                    <TableCell>{event.location || '-'}</TableCell>
                    <TableCell>${Number(event.budget || 0).toLocaleString()}</TableCell>
                    <TableCell>${Number(event.actual_cost || 0).toLocaleString()}</TableCell>
                    <TableCell>{event.participants_count || 0}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[event.status]}>
                        {statusLabels[event.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  )
}
