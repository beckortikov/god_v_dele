'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Filter, AlertCircle, MessageSquare } from 'lucide-react'

interface IncomeItem {
  id: string
  date: string
  participant: string
  amount: number
  status: string
  method: string
  currency?: string
  original_amount?: number
  notes?: string
}

interface ExpenseItem {
  id: string
  date: string
  category: string
  amount: number
  type: string
  description?: string
  name: string
  currency?: string
  original_amount?: number
}

interface Participant {
  id: string
  name: string
  program_id: string
  tariff?: number
  status?: string
  program?: {
    name: string
    price_per_month: number
  }
}

export function IncomeExpensesPage() {
  const [incomeData, setIncomeData] = useState<IncomeItem[]>([])
  const [expenseData, setExpenseData] = useState<ExpenseItem[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  const [filterProgram, setFilterProgram] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isIncomeOpen, setIsIncomeOpen] = useState(false)
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [incomeDialogProgramFilter, setIncomeDialogProgramFilter] = useState<string>('all')

  // Form states
  const [expenseForm, setExpenseForm] = useState<{
    id?: string;
    name: string;
    amount: string;
    category: string;
    date: string;
    description: string;
    employee_id?: string;
  }>({
    name: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  })

  const [employees, setEmployees] = useState<any[]>([])

  // Currency states
  const [currency, setCurrency] = useState<'USD' | 'TJS'>('USD')
  const [exchangeRate, setExchangeRate] = useState<string>('10.5')

  const [incomeForm, setIncomeForm] = useState({
    participant_id: '',
    amount: '',
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    notes: ''
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [paymentsRes, expensesRes, participantsRes, programsRes, employeesRes] = await Promise.all([
        fetch('/api/monthly-payments').then(res => res.json()),
        fetch('/api/expenses').then(res => res.json()),
        fetch('/api/participants').then(res => res.json()),
        fetch('/api/programs').then(res => res.json()),
        fetch('/api/hr/employees').then(res => res.json())
      ])

      if (paymentsRes.error) throw new Error(paymentsRes.error)
      if (expensesRes.error) throw new Error(expensesRes.error)
      if (participantsRes.error) throw new Error(participantsRes.error)
      if (programsRes.error) throw new Error(programsRes.error)

      // Transform payment data to income structure
      const income = paymentsRes.data.map((p: any) => ({
        id: p.id,
        date: p.paid_date || `${p.year}-${p.month_number}-01`,
        participant: p.participant?.name || 'Unknown',
        amount: p.fact_amount,
        status: p.status === 'paid' ? 'получен' : p.status === 'overdue' ? 'просрочен' : 'ожидается',
        method: 'Перевод',
        currency: p.currency,
        original_amount: p.original_amount,
        notes: p.notes
      })).filter((i: any) => i.amount > 0)

      // Transform expense data
      const expenses = expensesRes.data.map((e: any) => ({
        id: e.id,
        date: e.expense_date,
        category: e.category,
        amount: e.amount,
        type: 'переменные',
        description: e.description,
        name: e.name,
        currency: e.currency,
        original_amount: e.original_amount
      }))

      setIncomeData(income)
      setExpenseData(expenses)
      setParticipants(participantsRes.data || [])
      setPrograms(programsRes.data || [])
      setEmployees(employeesRes || [])
      setLoading(false)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleStartEditExpense = (item: ExpenseItem) => {
    setExpenseForm({
      id: item.id,
      name: item.name,
      amount: String(item.amount),
      category: item.category,
      date: item.date,
      description: item.description || '',
      employee_id: undefined
    })
    setIsExpenseOpen(true)
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Удалить этот расход?')) return;
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      fetchData();
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)

    let finalAmountUSD = Number(expenseForm.amount)
    let originalAmount = Number(expenseForm.amount)
    let rate = 1

    if (currency === 'TJS') {
      rate = Number(exchangeRate)
      if (!rate || rate <= 0) {
        alert('Введите корректный курс обмена')
        setSubmitLoading(false)
        return
      }
      finalAmountUSD = originalAmount / rate
    }

    try {
      const isEdit = !!expenseForm.id;
      const url = isEdit ? '/api/expenses' : '/api/expenses';
      const method = isEdit ? 'PUT' : 'POST';

      const body: any = {
        name: expenseForm.name,
        amount: finalAmountUSD, // Converted
        original_amount: originalAmount,
        currency: currency,
        exchange_rate: rate,
        category: expenseForm.category || 'Прочее',
        expense_date: expenseForm.date,
        description: expenseForm.description,
        status: 'approved',
        employee_id: expenseForm.employee_id
      };

      if (isEdit) body.id = expenseForm.id;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setIsExpenseOpen(false)
      setExpenseForm({ name: '', amount: '', category: '', date: new Date().toISOString().split('T')[0], description: '' })
      fetchData() // Refresh data
    } catch (err: any) {
      alert('Error saving expense: ' + err.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)
    try {
      const participant = participants.find(p => p.id === incomeForm.participant_id)
      if (!participant) throw new Error('Participant not found')

      const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
      const monthNum = Number(incomeForm.month)
      const monthName = monthNames[monthNum - 1] || 'Unknown'

      let finalAmountUSD = Number(incomeForm.amount)
      let originalAmount = Number(incomeForm.amount)
      let rate = 1

      if (currency === 'TJS') {
        rate = Number(exchangeRate)
        if (!rate || rate <= 0) {
          alert('Введите корректный курс обмена')
          return
        }
        finalAmountUSD = originalAmount / rate
      }

      // We need to send correct fields: plan_amount, payment_month, program_id
      const res = await fetch('/api/monthly-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: incomeForm.participant_id,
          program_id: participant.program_id,
          plan_amount: participant.tariff || participant.program?.price_per_month || 0, // Prefer tariff, then program price
          fact_amount: finalAmountUSD, // Converted to USD
          original_amount: originalAmount, // TJS or USD
          currency: currency,
          exchange_rate: rate,
          month_number: monthNum,
          payment_month: monthName,
          year: Number(incomeForm.year),
          status: 'paid',
          paid_date: new Date().toISOString(),
          notes: incomeForm.notes || null
        })
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setIsIncomeOpen(false)
      setIncomeForm({ participant_id: '', amount: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), notes: '' })
      fetchData()
    } catch (err: any) {
      alert('Error adding income: ' + err.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  // Filter data by program
  const filteredIncomeData = (filterProgram === 'all'
    ? incomeData
    : incomeData.filter(item => {
      const participant = participants.find(p => p.name === item.participant)
      return participant?.program_id === filterProgram
    })
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort by date descending

  const filteredExpenseData = expenseData
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort by date descending

  const totalIncome = filteredIncomeData.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalExpenses = filteredExpenseData.reduce((sum, item) => sum + Number(item.amount), 0)
  const balance = totalIncome - totalExpenses

  const expenseCategories = filteredExpenseData.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount)
    return acc
  }, {} as Record<string, number>)

  const expensesPieData = Object.entries(expenseCategories).map(([name, value]) => ({
    name, value
  }))

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

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
    return <div className="p-6">Error: {error}</div>
  }

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Доходы и Расходы</h2>
          <p className="text-sm text-muted-foreground mt-1">Управление финансовыми потоками</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Общий доход</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">${totalIncome.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <ArrowUpRight className="w-4 h-4 text-green-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Общие расходы</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">${totalExpenses.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-red-100 rounded-full">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Чистый баланс</p>
              <h3 className={`text-2xl font-bold mt-1 ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${balance.toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <PieChart className="w-4 h-4 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="transactions">Транзакции</TabsTrigger>
          <TabsTrigger value="analysis">Аналитика</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income Section */}
            <Card className="bg-card border-border">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">Последние поступления</h3>
                <Button size="sm" variant="ghost" onClick={() => setIsIncomeOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Добавить
                </Button>
              </div>
              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Участник</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncomeData.slice(0, 5).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell>{item.participant}</TableCell>
                        <TableCell className="text-green-600 font-medium">
                          +${Number(item.amount).toLocaleString()}
                          {item.currency === 'TJS' && item.original_amount && (
                            <span className="text-xs text-muted-foreground block">
                              ({Number(item.original_amount).toLocaleString()} TJS)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.status === 'получен' ? 'default' : 'secondary'}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 items-center">
                            {item.notes && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MessageSquare className="h-4 w-4 text-gray-400" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Комментарий к платежу</DialogTitle>
                                    <DialogDescription>
                                      {item.participant} • {new Date(item.date).toLocaleDateString('ru-RU')}
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm text-foreground whitespace-pre-wrap">{item.notes}</p>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                              onClick={async () => {
                                if (!confirm('Удалить этот платеж?')) return;
                                await fetch(`/api/monthly-payments?id=${item.id}`, { method: 'DELETE' });
                                fetchData();
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {incomeData.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет данных</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Expenses Section */}
            <Card className="bg-card border-border">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">Последние расходы</h3>
                <Button size="sm" variant="ghost" onClick={() => setIsExpenseOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Добавить
                </Button>
              </div>
              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenseData.slice(0, 5).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.date).toLocaleDateString('ru-RU')}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-red-600 font-medium">
                          -${Number(item.amount).toLocaleString()}
                          {item.currency === 'TJS' && item.original_amount && (
                            <span className="text-xs text-muted-foreground block">
                              ({Number(item.original_amount).toLocaleString()} TJS)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleStartEditExpense(item)}>
                              <Edit2 className="h-4 w-4 mr-1 text-blue-500" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDeleteExpense(item.id)}>
                              <Trash2 className="h-4 w-4 mr-1 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>

                      </TableRow>
                    ))}
                    {expenseData.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет данных</TableCell></TableRow>}

                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent >

        <TabsContent value="analysis" className="space-y-6 mt-6">
          {/* Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 bg-card border-border">
              <h3 className="text-lg font-semibold text-foreground mb-4">Структура расходов</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expensesPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => entry.name}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expensesPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </TabsContent>
      </Tabs >

      {/* Add Expense Dialog */}
      {/* Add Expense Dialog */}
      <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить расход</DialogTitle>
            <DialogDescription>Заполните информацию о новом расходе</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            {/* Employee Selection Logic */}
            {(expenseForm.category === 'Зарплаты' || expenseForm.category === 'Personnel') && (
              <div className="space-y-2">
                <Label>Сотрудник</Label>
                <Select onValueChange={(v) => {
                  const emp = employees.find(e => e.id === v);
                  if (emp) {
                    setExpenseForm(prev => ({
                      ...prev,
                      name: `Зарплата: ${emp.first_name} ${emp.last_name}`,
                      employee_id: emp.id
                    }));
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.status === 'active').map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.position})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Название</Label>
              <Input value={expenseForm.name} onChange={e => setExpenseForm({ ...expenseForm, name: e.target.value })} placeholder="Например: Аренда офиса" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="expense-amount">Сумма</Label>
                  <div className="relative">
                    <Input
                      id="expense-amount"
                      type="number"
                      placeholder="0.00"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    />
                    <div className="absolute right-1 top-1">
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'TJS')}
                        className="h-8 border-none bg-transparent focus:ring-0 text-xs font-semibold text-muted-foreground cursor-pointer"
                        style={{ outline: 'none' }}
                      >
                        <option value="USD">USD</option>
                        <option value="TJS">TJS</option>
                      </select>
                    </div>
                  </div>
                </div>
                {currency === 'TJS' && (
                  <div className="w-24">
                    <Label htmlFor="expense-rate">Курс</Label>
                    <Input
                      id="expense-rate"
                      type="number"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {currency === 'TJS' && expenseForm.amount && (
                <div className="col-span-2 text-right">
                  <p className="text-xs text-muted-foreground">
                    ≈ ${(Number(expenseForm.amount) / Number(exchangeRate || 1)).toFixed(2)} USD
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Маркетинг">Маркетинг</SelectItem>
                  <SelectItem value="Зарплаты">Зарплаты</SelectItem>
                  <SelectItem value="Офис">Офис</SelectItem>
                  <SelectItem value="Мероприятия">Мероприятия</SelectItem>
                  <SelectItem value="Прочее">Прочее</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitLoading}>{submitLoading ? 'Сохранение...' : 'Добавить'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Income Dialog */}
      {/* Add Income Dialog */}
      <Dialog open={isIncomeOpen} onOpenChange={setIsIncomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Зарегистрировать платёж</DialogTitle>
            <DialogDescription>Добавьте новое поступление от участника</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddIncome} className="space-y-4">
            <div className="space-y-2">
              <Label>Фильтр по программе</Label>
              <Select value={incomeDialogProgramFilter} onValueChange={setIncomeDialogProgramFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Все программы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все программы</SelectItem>
                  {programs.map(prog => (
                    <SelectItem key={prog.id} value={prog.id}>{prog.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Участник</Label>
              <Select value={incomeForm.participant_id} onValueChange={(v) => setIncomeForm({ ...incomeForm, participant_id: v })} required>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите участника" />
                </SelectTrigger>
                <SelectContent>
                  {participants
                    .filter(p => p.status === 'active')
                    .filter(p => incomeDialogProgramFilter === 'all' || p.program_id === incomeDialogProgramFilter)
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.program?.name || 'Без программы'})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="income-amount">Сумма</Label>
                  <div className="relative">
                    <Input
                      id="income-amount"
                      type="number"
                      placeholder="0.00"
                      value={incomeForm.amount}
                      onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                    />
                    <div className="absolute right-1 top-1">
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'TJS')}
                        className="h-8 border-none bg-transparent focus:ring-0 text-xs font-semibold text-muted-foreground cursor-pointer"
                        style={{ outline: 'none' }}
                      >
                        <option value="USD">USD</option>
                        <option value="TJS">TJS</option>
                      </select>
                    </div>
                  </div>
                </div>
                {currency === 'TJS' && (
                  <div className="w-24">
                    <Label htmlFor="income-rate">Курс</Label>
                    <Input
                      id="income-rate"
                      type="number"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {currency === 'TJS' && incomeForm.amount && (
                <div className="col-span-2 text-right">
                  <p className="text-xs text-muted-foreground">
                    ≈ ${(Number(incomeForm.amount) / Number(exchangeRate || 1)).toFixed(2)} USD
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Месяц (номер)</Label>
                <Input type="number" min="1" max="12" value={incomeForm.month} onChange={e => setIncomeForm({ ...incomeForm, month: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Год</Label>
                <Input type="number" value={incomeForm.year} onChange={e => setIncomeForm({ ...incomeForm, year: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="income-notes">Комментарий (необязательно)</Label>
                <span className="text-xs text-muted-foreground">{incomeForm.notes.length}/500</span>
              </div>
              <Textarea
                id="income-notes"
                placeholder="Добавьте комментарий к платежу, например: способ оплаты, номер транзакции..."
                value={incomeForm.notes}
                onChange={e => {
                  if (e.target.value.length <= 500) {
                    setIncomeForm({ ...incomeForm, notes: e.target.value })
                  }
                }}
                className="min-h-[80px] resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitLoading}>{submitLoading ? 'Сохранение...' : 'Зарегистрировать'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div >
  )
}
