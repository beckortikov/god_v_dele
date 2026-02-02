'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, ComposedChart } from 'recharts'
import { AlertCircle, TrendingUp, TrendingDown, DollarSign, Calendar, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ForecastItem {
  id: string
  month_number: number
  year: number
  planned_income: number
  planned_expenses: number
  optimistic_income?: number
  pessimistic_income?: number
  confidence_level?: number
  notes?: string
}

export function BalanceForecastPage() {
  const [data, setData] = useState<ForecastItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    month_number: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    planned_income: '',
    planned_expenses: '',
    optimistic_income: '',
    pessimistic_income: ''
  })

  useEffect(() => {
    fetchForecasts()
  }, [])

  const fetchForecasts = () => {
    fetch('/api/forecasts')
      .then(res => res.json())
      .then(result => {
        if (result.error) throw new Error(result.error)
        setData(result.data || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)

    try {
      const plannedInc = Number(formData.planned_income)
      const plannedExp = Number(formData.planned_expenses)
      // Default optimistic/pessimistic if not provided
      const opt = formData.optimistic_income ? Number(formData.optimistic_income) : plannedInc * 1.1
      const pes = formData.pessimistic_income ? Number(formData.pessimistic_income) : plannedInc * 0.9

      const payload = {
        month_number: Number(formData.month_number),
        year: Number(formData.year),
        planned_income: plannedInc,
        planned_expenses: plannedExp,
        optimistic_income: opt,
        pessimistic_income: pes
      }

      const res = await fetch('/api/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await res.json()
      if (result.error) throw new Error(result.error)

      fetchForecasts()
      setIsAddOpen(false)
      setFormData({
        month_number: String(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2),
        year: String(new Date().getMonth() + 2 > 12 ? new Date().getFullYear() + 1 : new Date().getFullYear()),
        planned_income: '',
        planned_expenses: '',
        optimistic_income: '',
        pessimistic_income: ''
      })

    } catch (err: any) {
      alert('Error saving scenario: ' + err.message)
    } finally {
      setSubmitLoading(false)
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

  const chartData = data.map(item => {
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
    return {
      month: monthNames[item.month_number - 1] || item.month_number,
      forecast: item.planned_income,
      min: item.pessimistic_income || item.planned_income * 0.8,
      max: item.optimistic_income || item.planned_income * 1.2,
      balance: item.planned_income - item.planned_expenses // Simple calculation
    }
  })

  return (
    <div className="p-6 space-y-6 bg-background">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Прогноз баланса</h2>
          <p className="text-sm text-muted-foreground mt-1">Прогнозирование денежных потоков и кассовых разрывов</p>
        </div>
        <div className="flex gap-2">
          {/* <Button variant="outline" className="gap-2">
            <Calendar className="w-4 h-4" />
            Период: 6 мес.
          </Button> */}
          <Button className="gap-2" onClick={() => setIsAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Добавить сценарий
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {error ? (
          <Card className="p-6 bg-destructive/5 border-destructive col-span-2">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p className="text-destructive">{error}</p>
            </div>
          </Card>
        ) : chartData.length > 0 ? (
          <>
            <Card className="p-6 bg-card border-border col-span-2">
              <h3 className="text-lg font-semibold text-foreground mb-4">Прогноз поступлений</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="min" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name="Пессимистичный" />
                  <Area type="monotone" dataKey="forecast" stackId="2" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Базовый" />
                  <Area type="monotone" dataKey="max" stackId="3" stroke="#10b981" fill="#10b981" fillOpacity={0.1} name="Оптимистичный" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </>
        ) : (
          <Card className="p-12 text-center bg-card border-border col-span-2">
            <p className="text-muted-foreground">Нет данных для прогноза. Добавьте прогнозы в систему.</p>
          </Card>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить прогноз</DialogTitle>
            <DialogDescription>Задайте параметры финансового плана на месяц</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Месяц (номер)</Label>
                <Input type="number" min="1" max="12" value={formData.month_number} onChange={e => setFormData({ ...formData, month_number: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Год</Label>
                <Input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>План. Доход ($)</Label>
                <Input type="number" value={formData.planned_income} onChange={e => setFormData({ ...formData, planned_income: e.target.value })} required placeholder="5000" />
              </div>
              <div className="space-y-2">
                <Label>План. Расход ($)</Label>
                <Input type="number" value={formData.planned_expenses} onChange={e => setFormData({ ...formData, planned_expenses: e.target.value })} required placeholder="2000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Оптимист. Доход ($)</Label>
                <Input type="number" value={formData.optimistic_income} onChange={e => setFormData({ ...formData, optimistic_income: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Пессимист. Доход ($)</Label>
                <Input type="number" value={formData.pessimistic_income} onChange={e => setFormData({ ...formData, pessimistic_income: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitLoading}>{submitLoading ? 'Сохранение...' : 'Сохранить прогноз'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
