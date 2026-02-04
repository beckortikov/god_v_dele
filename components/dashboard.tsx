'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown, AlertCircle, Zap, X } from 'lucide-react'

interface DashboardData {
  metrics: {
    currentBalance: number
    monthlyRevenue: number
    monthlyExpenses: number
    cashRunway: number
  }
  overduePayments: Array<{
    name: string
    amount: number
    days: number
  }>
  recentPayments: Array<{
    name: string
    program: string
    amount: number
    month: number
    year: number
    date: string
  }>
  chartData: Array<{
    month: string
    income: number
    expenses: number
    balance: number
    mrr: number
    participants: number
    paymentRate: number
  }>
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOverdueModal, setShowOverdueModal] = useState(false)
  const [showRecentModal, setShowRecentModal] = useState(false)

  useEffect(() => {
    // Fetch programs first
    fetch('/api/programs')
      .then(res => res.json())
      .then(result => {
        if (!result.error) {
          setPrograms(result.data || [])
        }
      })
      .catch(err => console.error('Error fetching programs:', err))
  }, [])

  useEffect(() => {
    const url = filterProgram === 'all'
      ? '/api/dashboard'
      : `/api/dashboard?program_id=${filterProgram}`

    fetch(url)
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          setError(result.error)
        } else {
          setData(result.data)
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [filterProgram])

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

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="p-6 bg-destructive/5 border-destructive">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Ошибка загрузки данных</p>
              <p className="text-sm text-muted-foreground">{error || 'Неизвестная ошибка'}</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const metrics = [
    {
      title: 'Текущий баланс',
      value: `$${data.metrics.currentBalance.toLocaleString()}`,
      change: '+12%',
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      title: 'Месячный доход',
      value: `$${data.metrics.monthlyRevenue.toLocaleString()}`,
      change: '+15%',
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      title: 'Месячные расходы',
      value: `$${data.metrics.monthlyExpenses.toLocaleString()}`,
      change: '+8%',
      icon: TrendingDown,
      color: 'text-red-600',
    },
    {
      title: 'Cash Runway',
      value: `${data.metrics.cashRunway.toFixed(1)} мес.`,
      change: 'стабильно',
      icon: Zap,
      color: 'text-amber-600',
    },
  ]

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background">
      {/* Header with Program Filter */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Дашборд</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Обзор финансовых показателей</p>
        </div>
        <div className="w-full sm:w-64">
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm touch-manipulation"
          >
            <option value="all">Все программы</option>
            {programs.map(prog => (
              <option key={prog.id} value={prog.id}>{prog.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.title} className="p-6 bg-card border-border">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{metric.title}</p>
                  <h3 className="text-2xl font-bold text-foreground">{metric.value}</h3>
                </div>
                <Icon className={`w-5 h-5 ${metric.color}`} />
              </div>
              <Badge variant="secondary" className="text-xs">{metric.change}</Badge>
            </Card>
          )
        })}
      </div>

      {/* Alerts */}
      {data.overduePayments.length > 0 && (
        <Card className="p-4 bg-destructive/5 border border-destructive/20">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Есть просроченные платежи</p>
              <p className="text-sm text-muted-foreground">{data.overduePayments.length} участника не оплатили в срок. Требуется внимание.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance Chart */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Доходы vs Расходы</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Bar dataKey="income" fill="#3b82f6" name="Доходы" />
              <Bar dataKey="expenses" fill="#ef4444" name="Расходы" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* MRR Trend */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">MRR тренд</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="mrr" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} name="MRR" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Balance Trend */}
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Динамика баланса</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Баланс" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Overdue and Recent Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-card border-border flex flex-col">
            <h3 className="text-lg font-semibold text-foreground mb-4">Просроченные платежи</h3>
            {data.overduePayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет просроченных платежей</p>
            ) : (
              <>
                <div className="space-y-3 flex-1">
                  {data.overduePayments.slice(0, 5).map((payment, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{payment.name}</p>
                        <p className="text-xs text-muted-foreground">Задержка: {payment.days} дней</p>
                      </div>
                      <p className="text-sm font-semibold text-destructive">${payment.amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                {data.overduePayments.length > 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOverdueModal(true)}
                    className="w-full mt-4"
                  >
                    Показать все ({data.overduePayments.length})
                  </Button>
                )}
              </>
            )}
          </Card>

          <Card className="p-6 bg-card border-border flex flex-col">
            <h3 className="text-lg font-semibold text-foreground mb-4">Последние поступления</h3>
            {data.recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет поступлений</p>
            ) : (
              <>
                <div className="space-y-3 flex-1">
                  {data.recentPayments.slice(0, 5).map((payment, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{payment.name}</p>
                        <p className="text-xs text-muted-foreground">{payment.program}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-600">${payment.amount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(payment.date).toLocaleDateString('ru-RU')}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {data.recentPayments.length > 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRecentModal(true)}
                    className="w-full mt-4"
                  >
                    Показать все ({data.recentPayments.length})
                  </Button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Overdue Payments Modal */}
      {showOverdueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-foreground">Все просроченные платежи</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverdueModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {data.overduePayments.map((payment, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">{payment.name}</p>
                      <p className="text-sm text-muted-foreground">Задержка: {payment.days} дней</p>
                    </div>
                    <p className="text-lg font-semibold text-destructive">${payment.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Recent Payments Modal */}
      {showRecentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-foreground">Все последние поступления</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRecentModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {data.recentPayments.map((payment, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4 bg-muted/30 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">{payment.name}</p>
                      <p className="text-sm text-muted-foreground">{payment.program}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-green-600">${payment.amount.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">{new Date(payment.date).toLocaleDateString('ru-RU')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

