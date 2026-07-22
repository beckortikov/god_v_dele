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
import { Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Filter, AlertCircle, MessageSquare, Landmark, ChevronLeft, ChevronRight } from 'lucide-react'

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
  account_id?: string
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
  program_id?: string
  program_name?: string
  account_id?: string
  exchange_rate?: number
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
  const [accounts, setAccounts] = useState<any[]>([])
  const [filterProgram, setFilterProgram] = useState<string>('all')
  
  // Pagination states
  const [incomePage, setIncomePage] = useState(1)
  const [expensePage, setExpensePage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    setIncomePage(1)
    setExpensePage(1)
  }, [filterProgram])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isIncomeOpen, setIsIncomeOpen] = useState(false)
  const [isExpenseOpen, setIsExpenseOpen] = useState(false)
  const [isCustomCategory, setIsCustomCategory] = useState(false)
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
    program_id?: string;
    account_id?: string;
  }>({
    name: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    program_id: '',
    account_id: ''
  })

  const [employees, setEmployees] = useState<any[]>([])

  // Accounts state
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [accountForm, setAccountForm] = useState({
    id: '',
    name: '',
    currency: 'USD',
    program_id: 'none',
    is_default: false,
    initial_balance: '0'
  })

  // Currency states
  const [currency, setCurrency] = useState<'USD' | 'TJS'>('USD')
  const [exchangeRate, setExchangeRate] = useState<string>('10.5')

  const [incomeForm, setIncomeForm] = useState({
    participant_id: '',
    amount: '',
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    notes: '',
    account_id: '',
    paid_date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!isExpenseOpen) {
      setIsCustomCategory(false)
    }
  }, [isExpenseOpen])

  const fetchData = async () => {
    try {
      const [paymentsRes, expensesRes, participantsRes, programsRes, employeesRes, accountsRes] = await Promise.all([
        fetch(`/api/monthly-payments${filterProgram !== 'all' ? `?program_id=${filterProgram}` : ''}`).then(res => res.json()),
        fetch(`/api/expenses${filterProgram !== 'all' ? `?program_id=${filterProgram}` : ''}`).then(res => res.json()),
        fetch('/api/participants').then(res => res.json()),
        fetch('/api/programs').then(res => res.json()),
        fetch('/api/employees').then(res => res.json()).catch(() => []),
        fetch(`/api/accounts${filterProgram !== 'all' ? `?program_id=${filterProgram}` : ''}`).then(res => res.json()).catch(() => [])
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
        notes: p.notes,
        account_id: p.account_id
      })).filter((i: any) => i.amount > 0)

      // Transform general expense data (no event_id)
      const expenses = expensesRes.data.map((e: any) => ({
        id: e.id,
        date: e.expense_date,
        category: e.category,
        amount: e.amount,
        type: 'переменные',
        description: e.description,
        name: e.name,
        currency: e.currency,
        original_amount: e.original_amount,
        program_id: e.program_id,
        account_id: e.account_id,
        exchange_rate: e.exchange_rate,
        program_name: e.program_id
          ? (programsRes.data || []).find((p: any) => p.id === e.program_id)?.name || '—'
          : '—'
      }))

      setIncomeData(income)
      setExpenseData(expenses)
      setParticipants(participantsRes.data || [])
      setPrograms(programsRes.data || [])
      setEmployees(employeesRes || [])
      setAccounts(Array.isArray(accountsRes) ? accountsRes : [])
      setLoading(false)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleStartEditExpense = (item: ExpenseItem) => {
    // Restore currency and exchange rate states from the record
    setCurrency((item.currency as 'USD' | 'TJS') || 'USD')
    setExchangeRate(String(item.exchange_rate || '10.5'))

    setExpenseForm({
      id: item.id,
      name: item.name,
      amount: String(item.original_amount || item.amount),
      category: item.category,
      date: item.date,
      description: item.description || '',
      employee_id: undefined,
      program_id: item.program_id || '',
      account_id: item.account_id || ''
    })
    setIsExpenseOpen(true)
  }

  const handleStartAddExpense = () => {
    setCurrency('USD')
    setExchangeRate('10.5')
    setExpenseForm({
      name: '',
      amount: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      program_id: '',
      account_id: ''
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

    if (!expenseForm.account_id || expenseForm.account_id === 'none') {
        alert('Пожалуйста, выберите счет списания');
        setSubmitLoading(false);
        return;
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
        employee_id: expenseForm.employee_id,
        program_id: expenseForm.program_id || null,
        account_id: expenseForm.account_id || null
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
      setExpenseForm({ name: '', amount: '', category: '', date: new Date().toISOString().split('T')[0], description: '', program_id: '', account_id: '' })
      setCurrency('USD')
      setExchangeRate('10.5')
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

      if (!incomeForm.account_id || incomeForm.account_id === 'none') {
          alert('Пожалуйста, выберите счет зачисления');
          setSubmitLoading(false);
          return;
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
          paid_date: incomeForm.paid_date || new Date().toISOString().split('T')[0],
          notes: incomeForm.notes || null,
          account_id: incomeForm.account_id || null
        })
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      setIsIncomeOpen(false)
      setIncomeForm({ participant_id: '', amount: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), notes: '', account_id: '', paid_date: new Date().toISOString().split('T')[0] })
      fetchData()
    } catch (err: any) {
      alert('Error adding income: ' + err.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)
    try {
      const isEdit = !!accountForm.id;
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        id: accountForm.id || undefined,
        name: accountForm.name,
        currency: accountForm.currency,
        program_id: accountForm.program_id === 'none' ? null : accountForm.program_id,
        is_default: accountForm.is_default,
        initial_balance: Number(accountForm.initial_balance) || 0
      }
      const res = await fetch('/api/accounts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setIsAccountOpen(false)
      setAccountForm({ id: '', name: '', currency: 'USD', program_id: 'none', is_default: false, initial_balance: '0' })
      fetchData()
    } catch (err: any) {
      alert('Error saving account: ' + err.message)
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Удалить счет? Все связанные транзакции потеряют привязку к счету!')) return;
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      fetchData();
    } catch (err: any) {
      alert('Error deleting account: ' + err.message);
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

  const defaultCategories = ['Зарплаты', 'Маркетинг', 'Офис', 'Мероприятия', 'Бонусы', 'Организационные', 'Прочее']
  const allCategories = Array.from(
    new Set([
      ...defaultCategories,
      ...expenseData.map(e => e.category).filter(Boolean)
    ])
  )

  const totalIncome = filteredIncomeData.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalExpenses = filteredExpenseData.reduce((sum, item) => sum + Number(item.amount), 0)
  const balance = totalIncome - totalExpenses

  // Pagination page slices
  const totalIncomePages = Math.ceil(filteredIncomeData.length / itemsPerPage)
  const paginatedIncomeData = filteredIncomeData.slice(
    (incomePage - 1) * itemsPerPage,
    incomePage * itemsPerPage
  )

  const totalExpensePages = Math.ceil(filteredExpenseData.length / itemsPerPage)
  const paginatedExpenseData = filteredExpenseData.slice(
    (expensePage - 1) * itemsPerPage,
    expensePage * itemsPerPage
  )

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
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Доходы и Расходы</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Управление финансовыми потоками</p>
        </div>
        <div className="w-full sm:w-64">
          <select
            value={filterProgram}
            onChange={(e) => setFilterProgram(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-xs sm:text-sm touch-manipulation"
          >
            <option value="all">Все программы</option>
            {programs.map(prog => (
              <option key={prog.id} value={prog.id}>{prog.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-3.5 sm:p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Общий доход</p>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground mt-1">${totalIncome.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <ArrowUpRight className="w-4 h-4 text-green-600" />
            </div>
          </div>
        </Card>
        <Card className="p-3.5 sm:p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Общие расходы</p>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground mt-1">${totalExpenses.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-red-100 rounded-full">
              <ArrowDownRight className="w-4 h-4 text-red-600" />
            </div>
          </div>
        </Card>
        <Card className="p-3.5 sm:p-4 bg-card border-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">Чистый баланс</p>
              <h3 className={`text-xl sm:text-2xl font-bold mt-1 ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${balance.toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <PieChart className="w-4 h-4 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="income" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto p-1 gap-1">
          <TabsTrigger value="income" className="text-xs py-2">Доходы</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs py-2">Расходы</TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs py-2">Аналитика</TabsTrigger>
          <TabsTrigger value="accounts" className="text-xs py-2">Счета</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-foreground">Последние поступления</h3>
              <Button size="sm" variant="ghost" onClick={() => setIsIncomeOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Добавить
              </Button>
            </div>
            <div className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Участник</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Счет зачисления</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedIncomeData.map((item) => (
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
                        <Badge variant="outline" className="bg-green-50/50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          {accounts.find(acc => acc.id === item.account_id)?.name || '—'}
                        </Badge>
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
                  {filteredIncomeData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Нет данных
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Income Pagination Control */}
            {totalIncomePages > 1 && (
              <div className="flex justify-between items-center p-4 border-t border-border bg-card">
                <div className="text-xs text-muted-foreground">
                  Показано {(incomePage - 1) * itemsPerPage + 1} - {Math.min(incomePage * itemsPerPage, filteredIncomeData.length)} из {filteredIncomeData.length} поступлений
                </div>
                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIncomePage(prev => Math.max(prev - 1, 1))}
                    disabled={incomePage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-foreground font-semibold px-2">
                    Страница {incomePage} из {totalIncomePages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIncomePage(prev => Math.min(prev + 1, totalIncomePages))}
                    disabled={incomePage === totalIncomePages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-foreground">Последние расходы</h3>
              <Button size="sm" variant="ghost" onClick={handleStartAddExpense}>
                <Plus className="w-4 h-4 mr-2" /> Добавить
              </Button>
            </div>
            <div className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Программа</TableHead>
                    <TableHead>Счет списания</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedExpenseData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{new Date(item.date).toLocaleDateString('ru-RU')}</TableCell>
                      <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.program_name || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
                          {accounts.find(acc => acc.id === item.account_id)?.name || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-red-600 font-medium">
                        -${Number(item.amount).toLocaleString()}
                        {item.currency === 'TJS' && item.original_amount && (
                          <span className="text-xs text-muted-foreground block">
                            ({Number(item.original_amount).toLocaleString()} TJS)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleStartEditExpense(item)}>
                            <Edit2 className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleDeleteExpense(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredExpenseData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Нет данных
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Expense Pagination Control */}
            {totalExpensePages > 1 && (
              <div className="flex justify-between items-center p-4 border-t border-border bg-card">
                <div className="text-xs text-muted-foreground">
                  Показано {(expensePage - 1) * itemsPerPage + 1} - {Math.min(expensePage * itemsPerPage, filteredExpenseData.length)} из {filteredExpenseData.length} расходов
                </div>
                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpensePage(prev => Math.max(prev - 1, 1))}
                    disabled={expensePage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-foreground font-semibold px-2">
                    Страница {expensePage} из {totalExpensePages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExpensePage(prev => Math.min(prev + 1, totalExpensePages))}
                    disabled={expensePage === totalExpensePages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

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

        <TabsContent value="accounts" className="space-y-6 mt-6">
            <Card className="bg-card border-border">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">Управление счетами</h3>
                <Button size="sm" variant="default" onClick={() => {
                    setAccountForm({ id: '', name: '', currency: 'USD', program_id: 'none', is_default: false, initial_balance: '0' });
                    setIsAccountOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> Добавить счет
                </Button>
              </div>
              <div className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Программа</TableHead>
                      <TableHead>Валюта</TableHead>
                      <TableHead>Остаток</TableHead>
                      <TableHead>По умолчанию</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                                <Landmark className="w-4 h-4 text-slate-400" />
                                {item.name}
                            </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.program?.name || 'Глобальный счет'}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.currency}</TableCell>
                        <TableCell className="font-semibold text-foreground">
                            {item.currency === 'USD' ? '$' : ''}
                            {item.balance?.toLocaleString() || 0}
                            {item.currency === 'TJS' ? ' TJS' : ''}
                        </TableCell>
                        <TableCell>{item.is_default ? 'Да' : 'Нет'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => {
                                setAccountForm({
                                    id: item.id,
                                    name: item.name,
                                    currency: item.currency,
                                    program_id: item.program_id || 'none',
                                    is_default: item.is_default,
                                    initial_balance: String(item.initial_balance || 0)
                                });
                                setIsAccountOpen(true);
                            }}>
                              <Edit2 className="h-4 w-4 mr-1 text-blue-500" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDeleteAccount(item.id)}>
                              <Trash2 className="h-4 w-4 mr-1 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {accounts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет данных</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </Card>
        </TabsContent>
      </Tabs >

      {/* Add Expense Dialog */}
      {/* Add Expense Dialog */}
      <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{expenseForm.id ? 'Редактировать расход' : 'Добавить расход'}</DialogTitle>
            <DialogDescription>Заполните информацию о расходе</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            {/* Program Selection */}
            <div className="space-y-2">
              <Label>Программа (необязательно)</Label>
              <Select value={expenseForm.program_id || 'none'} onValueChange={(v) => setExpenseForm({ ...expenseForm, program_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Выберите программу" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Без программы —</SelectItem>
                  {programs.map(prog => (
                    <SelectItem key={prog.id} value={prog.id}>{prog.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account Selection */}
            <div className="space-y-2">
              <Label>Счет списания *</Label>
              <Select value={expenseForm.account_id || ''} onValueChange={(v) => setExpenseForm({ ...expenseForm, account_id: v })} required>
                <SelectTrigger><SelectValue placeholder="Выберите счет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указан —</SelectItem>
                  {accounts
                    .filter(acc => !expenseForm.program_id || acc.program_id === expenseForm.program_id || acc.program_id === null)
                    .map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <div className="flex items-center justify-between">
                <Label>Категория</Label>
                <Button 
                  type="button" 
                  variant="link" 
                  className="h-auto p-0 text-xs text-primary" 
                  onClick={() => {
                    setIsCustomCategory(!isCustomCategory);
                    setExpenseForm({ ...expenseForm, category: '' });
                  }}
                >
                  {isCustomCategory ? "Выбрать из списка" : "+ Ввести новую категорию"}
                </Button>
              </div>
              
              {isCustomCategory ? (
                <Input 
                  placeholder="Введите название новой категории" 
                  value={expenseForm.category} 
                  onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  required
                />
              ) : (
                <Select 
                  value={expenseForm.category} 
                  onValueChange={(v) => {
                    if (v === 'ADD_NEW') {
                      setIsCustomCategory(true);
                      setExpenseForm({ ...expenseForm, category: '' });
                    } else {
                      setExpenseForm({ ...expenseForm, category: v });
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="ADD_NEW" className="text-primary font-medium cursor-pointer">+ Добавить новую...</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Дата</Label>
              <Input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitLoading}>{submitLoading ? 'Сохранение...' : expenseForm.id ? 'Сохранить' : 'Добавить'}</Button>
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
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.program?.name || 'Нет программы'})</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account Selection */}
            <div className="space-y-2">
              <Label>Счет зачисления *</Label>
              <Select value={incomeForm.account_id || ''} onValueChange={(v) => setIncomeForm({ ...incomeForm, account_id: v })} required>
                <SelectTrigger><SelectValue placeholder="Выберите счет" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Не указан —</SelectItem>
                  {accounts
                    .filter(acc => {
                        const participant = participants.find(p => p.id === incomeForm.participant_id);
                        const programId = participant?.program_id;
                        return !programId || acc.program_id === programId || acc.program_id === null;
                    })
                    .map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
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

              <div className="space-y-2 col-span-2">
                <Label htmlFor="income-paid-date">Дата прихода (фактическая) *</Label>
                <Input
                  id="income-paid-date"
                  type="date"
                  value={incomeForm.paid_date}
                  onChange={(e) => setIncomeForm({ ...incomeForm, paid_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Месяц (целевой период)</Label>
                <Input type="number" min="1" max="12" value={incomeForm.month} onChange={e => setIncomeForm({ ...incomeForm, month: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Год (целевой период)</Label>
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

      {/* Account Dialog */}
      <Dialog open={isAccountOpen} onOpenChange={setIsAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accountForm.id ? 'Редактировать счет' : 'Создать счет'}</DialogTitle>
            <DialogDescription>Заполните информацию о счете</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div className="space-y-2">
              <Label>Название счета</Label>
              <Input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Например: Касса (Сомони)" required />
            </div>
            
            <div className="space-y-2">
              <Label>Валюта</Label>
              <Select value={accountForm.currency} onValueChange={(v) => setAccountForm({ ...accountForm, currency: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите валюту" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Доллар США (USD)</SelectItem>
                  <SelectItem value="TJS">Таджикский сомони (TJS)</SelectItem>
                  <SelectItem value="RUB">Российский рубль (RUB)</SelectItem>
                  <SelectItem value="EUR">Евро (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Программа (необязательно)</Label>
              <Select value={accountForm.program_id} onValueChange={(v) => setAccountForm({ ...accountForm, program_id: v })}>
                <SelectTrigger><SelectValue placeholder="Без программы (Глобальный счет)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без программы (Глобальный счет)</SelectItem>
                  {programs.map(prog => (
                    <SelectItem key={prog.id} value={prog.id}>{prog.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Начальный остаток</Label>
              <Input type="number" value={accountForm.initial_balance} onChange={e => setAccountForm({ ...accountForm, initial_balance: e.target.value })} placeholder="0.00" />
            </div>

            <div className="flex items-center space-x-2 mt-4">
                <input 
                    type="checkbox" 
                    id="is_default_acc" 
                    checked={accountForm.is_default}
                    onChange={(e) => setAccountForm({ ...accountForm, is_default: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="is_default_acc">Счет по умолчанию</Label>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={submitLoading}>{submitLoading ? 'Сохранение...' : accountForm.id ? 'Сохранить' : 'Создать'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div >
  )
}
