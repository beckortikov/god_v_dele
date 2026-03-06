'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { AlertCircle, MessageSquare } from 'lucide-react'

interface MonthlyPayment {
  id: string
  month_number: number
  year: number
  amount: number // Plan amount for this payment
  fact_amount: number // Fact amount paid
  status: string
  notes?: string
  participant: {
    id: string
    name: string
    tariff?: number
  }
  program?: {
    id: string
    name: string
    price_per_month: number
  }
  program_id: string
}

interface Expense {
  id: string
  amount: number
  expense_date: string
  event_id?: string | null
}

interface Forecast {
  month_number: number
  year: number
  planned_income: number
  planned_expenses: number
}

interface AggregatedData {
  month: string
  monthNum: number
  planIncome: number
  factIncome: number
  planExpense: number
  factExpense: number
  planBalance: number
  factBalance: number
}

const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function PlanFactPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payments, setPayments] = useState<MonthlyPayment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [paymentsRes, expensesRes, forecastsRes, programsRes] = await Promise.all([
          fetch('/api/monthly-payments').then(res => res.json()),
          fetch('/api/expenses?exclude_events=true').then(res => res.json()),
          fetch('/api/forecasts').then(res => res.json()),
          fetch('/api/programs').then(res => res.json())
        ])

        if (paymentsRes.error) throw new Error("Error fetching payments: " + paymentsRes.error)
        if (expensesRes.error) throw new Error("Error fetching expenses: " + expensesRes.error)
        if (forecastsRes.error) throw new Error("Error fetching forecasts: " + forecastsRes.error)
        if (programsRes.error) throw new Error("Error fetching programs: " + programsRes.error)

        setPayments(paymentsRes.data || [])
        setExpenses(expensesRes.data || [])
        setForecasts(forecastsRes.data || [])
        setPrograms(programsRes.data || [])

        // If no month is selected yet, choose current month by default
        setSelectedMonth(monthNames[new Date().getMonth()])

        setLoading(false)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const filteredPayments = useMemo(() => {
    return filterProgram === 'all'
      ? payments
      : payments.filter(p => (p.program_id === filterProgram || p.program?.id === filterProgram))
  }, [payments, filterProgram])

  const data = useMemo(() => {
    const relevantMonths = Array.from({ length: 12 }, (_, i) => i + 1)

    return relevantMonths.map(monthNum => {
      const forecast = forecasts.find(f => f.month_number === monthNum)

      const scheduledIncome = filteredPayments
        .filter(p => p.month_number === monthNum)
        .reduce((sum, p) => sum + (p.amount || p.participant?.tariff || p.program?.price_per_month || 0), 0)

      // Only use forecast income if NO program filter is applied, otherwise calculate from filtered payments
      const planIncome = (filterProgram === 'all' && forecast?.planned_income)
        ? forecast.planned_income
        : scheduledIncome

      const factIncome = filteredPayments
        .filter(p => p.month_number === monthNum)
        .reduce((sum, p) => sum + (p.fact_amount || 0), 0)

      const planExpense = forecast?.planned_expenses || 0

      const factExpense = expenses
        .filter(e => !e.event_id && new Date(e.expense_date).getMonth() + 1 === monthNum)
        .reduce((sum, e) => sum + e.amount, 0)

      return {
        month: monthNames[monthNum - 1],
        monthNum,
        planIncome,
        factIncome,
        planExpense,
        factExpense,
        planBalance: planIncome - planExpense,
        factBalance: factIncome - factExpense
      }
    }).filter(d => d.planIncome > 0 || d.factIncome > 0 || d.factExpense > 0)
  }, [filteredPayments, expenses, forecasts, filterProgram])

  // Derived state for the selected month
  const selectedMonthNum = monthNames.indexOf(selectedMonth) + 1
  const currentMonthData = data.find(d => d.month === selectedMonth)
  const currentMonthPayments = filteredPayments.filter(p => p.month_number === selectedMonthNum)

  // Chart data
  const chartDataForComparison = data.map(item => ({
    month: item.month.slice(0, 3),
    income: item.planIncome,
    expense: item.planExpense
  }))

  const chartDataActual = data.map(item => ({
    month: item.month.slice(0, 3),
    income: item.factIncome,
    expense: item.factExpense
  }))

  const deviationAnalysis = data.map(item => ({
    month: item.month,
    incomeDev: item.factIncome - item.planIncome,
    expenseDev: item.factExpense - item.planExpense,
    balanceDev: item.factBalance - item.planBalance,
    rate: item.planIncome > 0 ? Math.round((item.factIncome / item.planIncome) * 100) + '%' : '0%'
  }))

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


  return (
    <div className="p-4 space-y-4 bg-background">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-foreground">План–Факт анализ</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Сравнение плановых и фактических показателей по участникам и месяцам</p>
        </div>
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
      </div>

      {data.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Нет данных для анализа. Добавьте платежи и расходы.</p>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-3 bg-card border-border">
              <p className="text-xs text-muted-foreground">Средн. отклонение доходов</p>
              <p className="text-lg font-bold text-destructive mt-1">
                {data.length > 0
                  ? (data.reduce((acc, curr) => acc + (curr.factIncome - curr.planIncome), 0) / data.length / 1000).toFixed(1) + 'k'
                  : '0'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">от плана</p>
            </Card>
            <Card className="p-3 bg-card border-border">
              <p className="text-xs text-muted-foreground">Точность платежей</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {data.reduce((acc, curr) => acc + curr.planIncome, 0) > 0
                  ? Math.round((data.reduce((acc, curr) => acc + curr.factIncome, 0) / data.reduce((acc, curr) => acc + curr.planIncome, 0)) * 100)
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">исполнение бюджета</p>
            </Card>
            <Card className="p-3 bg-card border-border">
              <p className="text-xs text-muted-foreground">Факт. доход (год)</p>
              <p className="text-lg font-bold text-foreground mt-1">
                ${data.reduce((acc, curr) => acc + curr.factIncome, 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">всего получено</p>
            </Card>
            <Card className="p-3 bg-card border-border">
              <p className="text-xs text-muted-foreground">Факт. расходы (год)</p>
              <p className="text-lg font-bold text-foreground mt-1">
                ${data.reduce((acc, curr) => acc + curr.factExpense, 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">всего потрачено</p>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="participants">
            <TabsList className="bg-muted">
              <TabsTrigger value="participants">По участникам</TabsTrigger>
              <TabsTrigger value="comparison">Сравнение</TabsTrigger>
              <TabsTrigger value="deviation">Отклонения</TabsTrigger>
              <TabsTrigger value="unpaid">Неоплаченные</TabsTrigger>
            </TabsList>

            {/* Participants Tab */}
            <TabsContent value="participants" className="space-y-3">
              <div className="flex gap-3 items-center">
                <label className="text-xs font-medium text-foreground">Месяц:</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.map(m => (
                      <SelectItem key={m.month} value={m.month}>{m.month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-card border-border overflow-hidden">
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Платежи за {selectedMonth}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border bg-muted/30 h-8">
                        <TableHead className="text-xs text-foreground">Участник</TableHead>
                        <TableHead className="text-xs text-foreground">Программа</TableHead>
                        <TableHead className="text-xs text-foreground text-right">План</TableHead>
                        <TableHead className="text-xs text-foreground text-right">Факт</TableHead>
                        <TableHead className="text-xs text-foreground text-right">Откл.</TableHead>
                        <TableHead className="text-xs text-foreground">Статус</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentMonthPayments.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Нет платежей</TableCell></TableRow>
                      ) : (
                        currentMonthPayments.map((payment) => {
                          const planAmount = payment.amount || payment.participant?.tariff || payment.program?.price_per_month || 0
                          const deviation = (payment.fact_amount || 0) - planAmount

                          const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
                            paid: 'default',
                            partial: 'secondary',
                            overdue: 'destructive',
                            pending: 'secondary'
                          }

                          return (
                            <TableRow key={payment.id} className="border-b border-border hover:bg-muted/20 h-7">
                              <TableCell className="text-xs text-foreground font-medium py-1">{payment.participant?.name || 'Unknown'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground py-1">{payment.program?.name}</TableCell>
                              <TableCell className="text-xs text-foreground text-right py-1">${planAmount}</TableCell>
                              <TableCell className="text-xs text-foreground text-right py-1">${payment.fact_amount || 0}</TableCell>
                              <TableCell className={`text-xs text-right py-1 ${deviation < 0 ? 'text-destructive' : 'text-foreground'}`}>
                                {deviation === 0 ? '—' : `${deviation < 0 ? '' : '+'}${deviation}`}
                              </TableCell>
                              <TableCell className="py-1">
                                <Badge variant={statusVariants[payment.status] || 'secondary'} className="text-xs">
                                  {payment.status === 'paid' ? 'Опл.' : payment.status === 'partial' ? 'Част.' : payment.status === 'overdue' ? 'Проср.' : 'Ожид.'}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-1">
                                {payment.notes && (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                        <MessageSquare className="h-3 w-3 text-blue-600" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-md">
                                      <DialogHeader>
                                        <DialogTitle>Комментарий к платежу</DialogTitle>
                                        <DialogDescription>
                                          {payment.participant?.name} • {selectedMonth}
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{payment.notes}</p>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        }))}
                    </TableBody>
                  </Table>
                </div>

                <div className="p-2 bg-muted/30 border-t border-border flex justify-between text-xs">
                  <span className="font-medium text-foreground">Итого:</span>
                  <div className="flex gap-4">
                    <span className="text-foreground">План: ${(currentMonthData?.planIncome || 0).toLocaleString()}</span>
                    <span className="text-foreground">Факт: ${(currentMonthData?.factIncome || 0).toLocaleString()}</span>
                    <span className={`font-medium ${((currentMonthData?.factIncome || 0) - (currentMonthData?.planIncome || 0)) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      Откл: ${((currentMonthData?.factIncome || 0) - (currentMonthData?.planIncome || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Comparison Tab */}
            <TabsContent value="comparison" className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Card className="p-3 bg-card border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Плановые показатели</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartDataForComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                      <Legend />
                      <Bar dataKey="income" fill="#3b82f6" name="Доход (План)" />
                      <Bar dataKey="expense" fill="#ef4444" name="Расходы (План)" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-3 bg-card border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Фактические показатели</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartDataActual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                      <Legend />
                      <Bar dataKey="income" fill="#10b981" name="Доход (Факт)" />
                      <Bar dataKey="expense" fill="#f97316" name="Расходы (Факт)" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              <Card className="p-3 bg-card border-border overflow-hidden">
                <h3 className="text-sm font-semibold text-foreground mb-2">Сводная таблица</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border h-7">
                      <TableHead className="text-xs text-foreground">Месяц</TableHead>
                      <TableHead className="text-xs text-foreground text-right">План доход</TableHead>
                      <TableHead className="text-xs text-foreground text-right">Факт доход</TableHead>
                      <TableHead className="text-xs text-foreground text-right">План расходы</TableHead>
                      <TableHead className="text-foreground">Факт расходы</TableHead>
                      <TableHead className="text-foreground">План баланс</TableHead>
                      <TableHead className="text-foreground">Факт баланс</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((item, idx) => (
                      <TableRow key={idx} className="border-b border-border hover:bg-muted/20">
                        <TableCell className="text-foreground font-medium">{item.month}</TableCell>
                        <TableCell className="text-foreground">${item.planIncome.toLocaleString()}</TableCell>
                        <TableCell className="text-foreground">${item.factIncome.toLocaleString()}</TableCell>
                        <TableCell className="text-foreground">${item.planExpense.toLocaleString()}</TableCell>
                        <TableCell className="text-foreground">${item.factExpense.toLocaleString()}</TableCell>
                        <TableCell className="text-foreground">${item.planBalance.toLocaleString()}</TableCell>
                        <TableCell className="text-foreground">${item.factBalance.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Deviation Tab */}
            <TabsContent value="deviation" className="space-y-6">
              <Card className="p-6 bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Анализ отклонений</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={deviationAnalysis}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                    <Legend />
                    <Line type="monotone" dataKey="incomeDev" stroke="#3b82f6" strokeWidth={2} name="Отклонение дохода" />
                    <Line type="monotone" dataKey="expenseDev" stroke="#ef4444" strokeWidth={2} name="Отклонение расходов" />
                    <Line type="monotone" dataKey="balanceDev" stroke="#f59e0b" strokeWidth={2} name="Отклонение баланса" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </TabsContent>

            {/* Unpaid Tab */}
            <TabsContent value="unpaid" className="space-y-3">
              <Card className="p-4 bg-card border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">Участники с неоплаченными или частичными платежами</h3>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border">
                      <TableHead className="text-foreground">Участник</TableHead>
                      <TableHead className="text-foreground">Программа</TableHead>
                      <TableHead className="text-foreground">Месяц</TableHead>
                      <TableHead className="text-foreground text-right">План</TableHead>
                      <TableHead className="text-foreground text-right">Факт</TableHead>
                      <TableHead className="text-foreground text-right">Долг</TableHead>
                      <TableHead className="text-foreground">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const unpaidPayments = filteredPayments
                        .filter(p => {
                          const plan = p.amount || p.participant?.tariff || p.program?.price_per_month || 0
                          const fact = p.fact_amount || 0
                          return fact < plan // Not fully paid
                        })
                        .sort((a, b) => {
                          // Sort by year and month descending
                          if (a.year !== b.year) return b.year - a.year
                          return b.month_number - a.month_number
                        })

                      if (unpaidPayments.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Все участники оплатили полностью! 🎉
                            </TableCell>
                          </TableRow>
                        )
                      }

                      return unpaidPayments.map((payment) => {
                        const plan = payment.amount || payment.participant?.tariff || payment.program?.price_per_month || 0
                        const fact = payment.fact_amount || 0
                        const debt = plan - fact
                        const monthName = monthNames[payment.month_number - 1]

                        let statusText = 'Не оплачено'
                        let statusVariant: 'destructive' | 'secondary' = 'destructive'

                        if (fact > 0 && fact < plan) {
                          statusText = 'Частично'
                          statusVariant = 'secondary'
                        }

                        return (
                          <TableRow key={payment.id} className="border-b border-border hover:bg-muted/20">
                            <TableCell className="text-foreground font-medium">
                              {payment.participant?.name || 'Неизвестно'}
                            </TableCell>
                            <TableCell className="text-foreground text-sm">
                              {payment.program?.name || 'Не указана'}
                            </TableCell>
                            <TableCell className="text-foreground">
                              {monthName} {payment.year}
                            </TableCell>
                            <TableCell className="text-foreground text-right">
                              ${plan.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-foreground text-right">
                              ${fact.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-destructive text-right font-semibold">
                              ${debt.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant} className="text-[10px] px-2 py-0 h-5">
                                {statusText}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    })()}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
