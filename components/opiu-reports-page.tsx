'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Download, FileText, AlertCircle, TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import * as XLSX from 'xlsx'

// Configure pdfMake with fonts
if (typeof window !== 'undefined') {
    (pdfMake as any).vfs = pdfFonts
}

interface Program {
    id: string
    name: string
}

export default function OPiUReportsPage() {
    const [loading, setLoading] = useState(true)
    const [reportData, setReportData] = useState<any>(null)
    const [programs, setPrograms] = useState<Program[]>([])

    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1))
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
    const [selectedProgram, setSelectedProgram] = useState('all')

    const months = [
        { value: '1', label: 'Январь' },
        { value: '2', label: 'Февраль' },
        { value: '3', label: 'Март' },
        { value: '4', label: 'Апрель' },
        { value: '5', label: 'Май' },
        { value: '6', label: 'Июнь' },
        { value: '7', label: 'Июль' },
        { value: '8', label: 'Август' },
        { value: '9', label: 'Сентябрь' },
        { value: '10', label: 'Октябрь' },
        { value: '11', label: 'Ноябрь' },
        { value: '12', label: 'Декабрь' }
    ]

    const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

    useEffect(() => {
        fetchPrograms()
    }, [])

    useEffect(() => {
        fetchReportData()
    }, [selectedMonth, selectedYear, selectedProgram])

    const fetchPrograms = async () => {
        try {
            const res = await fetch('/api/programs')
            const result = await res.json()
            setPrograms(result.data || [])
        } catch (error) {
            console.error('Error fetching programs:', error)
        }
    }

    const fetchReportData = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                month: selectedMonth,
                year: selectedYear,
                program_id: selectedProgram
            })
            const res = await fetch(`/api/opiu-reports?${params}`)
            const result = await res.json()
            setReportData(result.data)
        } catch (error) {
            console.error('Error fetching report data:', error)
        } finally {
            setLoading(false)
        }
    }

    const exportToPDF = () => {
        if (!reportData) return

        const docDefinition: any = {
            content: [
                // Title
                { text: 'Отчет ОПиУ', style: 'header', margin: [0, 0, 0, 10] },
                { text: `${reportData.period.month_name} ${reportData.period.year}`, style: 'subheader', margin: [0, 0, 0, 20] },

                // Summary section
                { text: 'Общая статистика', style: 'sectionHeader', margin: [0, 10, 0, 10] },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Показатель', 'Значение'],
                            ['Всего участников', reportData.summary.total_participants.toString()],
                            ['Активных участников', reportData.summary.active_participants.toString()],
                            ['Завершивших программу', reportData.summary.completed_participants.toString()],
                            ['План по доходам', `$${reportData.summary.plan_income.toLocaleString()}`],
                            ['Факт по доходам', `$${reportData.summary.fact_income.toLocaleString()}`],
                            ['Всего расходов', `$${reportData.summary.total_expenses.toLocaleString()}`],
                            ['Чистая прибыль', `$${reportData.summary.net_profit.toLocaleString()}`],
                            ['Процент выполнения', `${reportData.summary.completion_rate.toFixed(1)}%`],
                            ['Оплачено полностью', reportData.summary.paid_count.toString()],
                            ['Частичная оплата', reportData.summary.partial_count.toString()],
                            ['Просрочено', reportData.summary.overdue_count.toString()]
                        ]
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 0, 0, 20]
                },

                // IFRS Metrics - Revenue
                { text: 'Финансовые показатели (МСФО)', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 10] },
                { text: 'Выручка и задолженность', style: 'subsectionHeader', margin: [0, 0, 0, 5] },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Показатель', 'Значение'],
                            ['Признанная выручка', `$${reportData.ifrs_metrics.revenue_recognized.toLocaleString()}`],
                            ['Отложенная выручка', `$${reportData.ifrs_metrics.deferred_revenue.toLocaleString()}`],
                            ['Дебиторская задолженность', `$${reportData.ifrs_metrics.accounts_receivable.toLocaleString()}`],
                            ['Просроченная задолженность', `$${reportData.ifrs_metrics.overdue_receivables.toLocaleString()}`]
                        ]
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 0, 0, 15]
                },

                // Expenses
                { text: 'Расходы по категориям', style: 'subsectionHeader', margin: [0, 0, 0, 5] },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Категория', 'Сумма'],
                            ['Зарплаты', `$${reportData.ifrs_metrics.expenses_by_category.salaries.toLocaleString()}`],
                            ['Маркетинг', `$${reportData.ifrs_metrics.expenses_by_category.marketing.toLocaleString()}`],
                            ['Офис', `$${reportData.ifrs_metrics.expenses_by_category.office.toLocaleString()}`],
                            ['Мероприятия', `$${reportData.ifrs_metrics.expenses_by_category.events.toLocaleString()}`],
                            ['Бонусы', `$${reportData.ifrs_metrics.expenses_by_category.bonuses.toLocaleString()}`],
                            ['Организационные', `$${reportData.ifrs_metrics.expenses_by_category.organizational.toLocaleString()}`],
                            ['Прочее', `$${reportData.ifrs_metrics.expenses_by_category.other.toLocaleString()}`],
                            ['ВСЕГО РАСХОДОВ', `$${reportData.ifrs_metrics.total_expenses.toLocaleString()}`]
                        ]
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 0, 0, 15]
                },

                // Profitability
                { text: 'Прибыльность', style: 'subsectionHeader', margin: [0, 0, 0, 5] },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Показатель', 'Значение'],
                            ['Валовая прибыль', `$${reportData.ifrs_metrics.gross_profit.toLocaleString()}`],
                            ['Операционная прибыль', `$${reportData.ifrs_metrics.operating_profit.toLocaleString()}`],
                            ['Чистая прибыль', `$${reportData.ifrs_metrics.net_profit.toLocaleString()}`],
                            ['Рентабельность', `${reportData.ifrs_metrics.profit_margin.toFixed(1)}%`]
                        ]
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 0, 0, 15]
                },

                // YTD Metrics
                { text: 'Показатели с начала года (YTD)', style: 'subsectionHeader', margin: [0, 0, 0, 5] },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Показатель', 'Значение'],
                            ['YTD Выручка', `$${reportData.ifrs_metrics.ytd_revenue.toLocaleString()}`],
                            ['YTD Расходы', `$${reportData.ifrs_metrics.ytd_expenses.toLocaleString()}`],
                            ['YTD Чистая прибыль', `$${reportData.ifrs_metrics.ytd_net_profit.toLocaleString()}`],
                            ['YTD Выполнение плана', `${reportData.ifrs_metrics.ytd_completion_rate.toFixed(1)}%`],
                            ['YTD Рентабельность', `${reportData.ifrs_metrics.ytd_profit_margin.toFixed(1)}%`]
                        ]
                    },
                    layout: 'lightHorizontalLines',
                    margin: [0, 0, 0, 20]
                }
            ],
            styles: {
                header: {
                    fontSize: 18,
                    bold: true
                },
                subheader: {
                    fontSize: 12,
                    color: '#666'
                },
                sectionHeader: {
                    fontSize: 14,
                    bold: true
                },
                subsectionHeader: {
                    fontSize: 12,
                    bold: true,
                    color: '#444'
                }
            },
            defaultStyle: {
                font: 'Roboto'
            }
        }

        // Add problem participants if any
        if (reportData.problem_participants.overdue.length > 0) {
            docDefinition.content.push(
                { text: 'Участники с просроченными платежами', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 10] },
                {
                    table: {
                        widths: ['*', '*', 'auto', 'auto'],
                        body: [
                            ['Участник', 'Программа', 'План', 'Факт'],
                            ...reportData.problem_participants.overdue.map((p: any) => [
                                p.participant_name,
                                p.program_name,
                                `$${p.plan.toLocaleString()}`,
                                `$${p.fact.toLocaleString()}`
                            ])
                        ]
                    },
                    layout: 'lightHorizontalLines'
                }
            )
        }

        pdfMake.createPdf(docDefinition).download(`opiu-report-${reportData.period.month}-${reportData.period.year}.pdf`)
    }

    const exportToExcel = () => {
        if (!reportData) return

        const wb = XLSX.utils.book_new()

        // Summary sheet
        const summaryData = [
            ['Отчет ОПиУ'],
            [`${reportData.period.month_name} ${reportData.period.year}`],
            [],
            ['Общая статистика'],
            ['Показатель', 'Значение'],
            ['Всего участников', reportData.summary.total_participants],
            ['Активных участников', reportData.summary.active_participants],
            ['Завершивших программу', reportData.summary.completed_participants],
            ['План по доходам', reportData.summary.plan_income],
            ['Факт по доходам', reportData.summary.fact_income],
            ['Процент выполнения', `${reportData.summary.completion_rate.toFixed(1)}%`],
            ['Оплачено полностью', reportData.summary.paid_count],
            ['Частичная оплата', reportData.summary.partial_count],
            ['Просрочено', reportData.summary.overdue_count]
        ]

        const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
        XLSX.utils.book_append_sheet(wb, ws1, 'Общая статистика')

        // IFRS Metrics sheet
        const ifrsData = [
            ['Финансовые показатели (МСФО)'],
            [],
            ['Показатель', 'Значение'],
            ['Признанная выручка', reportData.ifrs_metrics.revenue_recognized],
            ['Отложенная выручка', reportData.ifrs_metrics.deferred_revenue],
            ['Дебиторская задолженность', reportData.ifrs_metrics.accounts_receivable],
            ['Просроченная задолженность', reportData.ifrs_metrics.overdue_receivables],
            ['Коэффициент инкассации', `${reportData.ifrs_metrics.collection_rate.toFixed(1)}%`],
            ['YTD Выручка', reportData.ifrs_metrics.ytd_revenue],
            ['YTD План', reportData.ifrs_metrics.ytd_plan],
            ['YTD Выполнение', `${reportData.ifrs_metrics.ytd_completion_rate.toFixed(1)}%`]
        ]

        const ws2 = XLSX.utils.aoa_to_sheet(ifrsData)
        XLSX.utils.book_append_sheet(wb, ws2, 'МСФО')

        // Participant payments sheet
        const paymentsData = [
            ['Платежи участников'],
            [],
            ['Участник', 'Программа', 'План', 'Факт', 'Отклонение', 'Статус']
        ]

        reportData.participant_payments.forEach((p: any) => {
            paymentsData.push([
                p.participant_name,
                p.program_name,
                p.plan,
                p.fact,
                p.deviation,
                p.status === 'paid' ? 'Оплачено' : p.status === 'partial' ? 'Частично' : 'Просрочено'
            ])
        })

        const ws3 = XLSX.utils.aoa_to_sheet(paymentsData)
        XLSX.utils.book_append_sheet(wb, ws3, 'Платежи')

        XLSX.writeFile(wb, `opiu-report-${reportData.period.month}-${reportData.period.year}.xlsx`)
    }

    if (loading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Загрузка отчета...</p>
                </div>
            </div>
        )
    }

    if (!reportData) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Нет данных для отображения</p>
                </div>
            </div>
        )
    }

    const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

    const programChartData = reportData.program_analytics.map((p: any, index: number) => ({
        name: p.program_name,
        participants: p.active_participants,
        fill: chartColors[index % chartColors.length]
    }))

    const paymentStatusData = [
        { name: 'Оплачено', value: reportData.summary.paid_count, fill: '#10b981' },
        { name: 'Частично', value: reportData.summary.partial_count, fill: '#f59e0b' },
        { name: 'Просрочено', value: reportData.summary.overdue_count, fill: '#ef4444' }
    ]

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Ежемесячный отчет ОПиУ</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Отчет по работе с участниками за {reportData.period.month_name} {reportData.period.year}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={exportToPDF} variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        PDF
                    </Button>
                    <Button onClick={exportToExcel} variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Excel
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">Месяц</label>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {months.map(m => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">Год</label>
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(y => (
                                    <SelectItem key={y} value={y}>{y}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">Программа</label>
                        <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Все программы</SelectItem>
                                {programs.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Активных участников</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{reportData.summary.active_participants}</p>
                        </div>
                        <Users className="h-8 w-8 text-blue-600" />
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Доходы (факт)</p>
                            <p className="text-2xl font-bold text-green-600 mt-1">${reportData.summary.fact_income.toLocaleString()}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-green-600" />
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Расходы</p>
                            <p className="text-2xl font-bold text-red-600 mt-1">${reportData.summary.total_expenses.toLocaleString()}</p>
                        </div>
                        <TrendingDown className="h-8 w-8 text-red-600" />
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Чистая прибыль</p>
                            <p className={`text-2xl font-bold mt-1 ${reportData.summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${reportData.summary.net_profit.toLocaleString()}
                            </p>
                        </div>
                        <DollarSign className={`h-8 w-8 ${reportData.summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Выполнение плана</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{reportData.summary.completion_rate.toFixed(1)}%</p>
                        </div>
                        <div className={`h-8 w-8 rounded-full flex items-center justify-between ${reportData.summary.completion_rate >= 100 ? 'bg-green-100' : 'bg-orange-100'}`}>
                            <span className={`text-lg font-bold ${reportData.summary.completion_rate >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                                {reportData.summary.completion_rate >= 100 ? '✓' : '!'}
                            </span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* IFRS Metrics */}
            <Card className="p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Финансовые показатели (МСФО)</h2>

                {/* Revenue & Receivables */}
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Выручка и задолженность</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-muted-foreground">Признанная выручка</p>
                        <p className="text-xl font-bold text-foreground mt-1">${reportData.ifrs_metrics.revenue_recognized.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-muted-foreground">Отложенная выручка</p>
                        <p className="text-xl font-bold text-foreground mt-1">${reportData.ifrs_metrics.deferred_revenue.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                        <p className="text-xs text-muted-foreground">Дебиторская задолженность</p>
                        <p className="text-xl font-bold text-foreground mt-1">${reportData.ifrs_metrics.accounts_receivable.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-xs text-muted-foreground">Просроченная задолженность</p>
                        <p className="text-xl font-bold text-foreground mt-1">${reportData.ifrs_metrics.overdue_receivables.toLocaleString()}</p>
                    </div>
                </div>

                {/* Expenses Breakdown */}
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Расходы по категориям</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-xs text-muted-foreground">Зарплаты</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.salaries.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-pink-50 dark:bg-pink-950/20 rounded-lg border border-pink-200 dark:border-pink-800">
                        <p className="text-xs text-muted-foreground">Маркетинг</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.marketing.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground">Офис</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.office.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-violet-50 dark:bg-violet-950/20 rounded-lg border border-violet-200 dark:border-violet-800">
                        <p className="text-xs text-muted-foreground">Мероприятия</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.events.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <p className="text-xs text-muted-foreground">Бонусы</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.bonuses.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-sky-50 dark:bg-sky-950/20 rounded-lg border border-sky-200 dark:border-sky-800">
                        <p className="text-xs text-muted-foreground">Организационные</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.organizational.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-muted-foreground">Прочее</p>
                        <p className="text-lg font-bold text-foreground mt-1">${reportData.ifrs_metrics.expenses_by_category.other.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border-2 border-red-300 dark:border-red-700">
                        <p className="text-xs text-muted-foreground font-semibold">Всего расходов</p>
                        <p className="text-lg font-bold text-red-600 mt-1">${reportData.ifrs_metrics.total_expenses.toLocaleString()}</p>
                    </div>
                </div>

                {/* Profitability */}
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Прибыльность</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-xs text-muted-foreground">Валовая прибыль</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${reportData.ifrs_metrics.gross_profit.toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <p className="text-xs text-muted-foreground">Операционная прибыль</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.operating_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${reportData.ifrs_metrics.operating_profit.toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-teal-50 dark:bg-teal-950/20 rounded-lg border border-teal-200 dark:border-teal-800">
                        <p className="text-xs text-muted-foreground">Чистая прибыль</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${reportData.ifrs_metrics.net_profit.toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                        <p className="text-xs text-muted-foreground">Рентабельность</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.profit_margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {reportData.ifrs_metrics.profit_margin.toFixed(1)}%
                        </p>
                    </div>
                </div>

                {/* YTD Metrics */}
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Показатели с начала года (YTD)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        <p className="text-xs text-muted-foreground">YTD Выручка</p>
                        <p className="text-xl font-bold text-foreground mt-1">${reportData.ifrs_metrics.ytd_revenue.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                        <p className="text-xs text-muted-foreground">YTD Расходы</p>
                        <p className="text-xl font-bold text-red-600 mt-1">${reportData.ifrs_metrics.ytd_expenses.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-xs text-muted-foreground">YTD Чистая прибыль</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.ytd_net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${reportData.ifrs_metrics.ytd_net_profit.toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-teal-50 dark:bg-teal-950/20 rounded-lg border border-teal-200 dark:border-teal-800">
                        <p className="text-xs text-muted-foreground">YTD Выполнение плана</p>
                        <p className="text-xl font-bold text-foreground mt-1">{reportData.ifrs_metrics.ytd_completion_rate.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                        <p className="text-xs text-muted-foreground">YTD Рентабельность</p>
                        <p className={`text-xl font-bold mt-1 ${reportData.ifrs_metrics.ytd_profit_margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {reportData.ifrs_metrics.ytd_profit_margin.toFixed(1)}%
                        </p>
                    </div>
                </div>
            </Card>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-4 sm:p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Участники по программам</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={programChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="participants" />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                <Card className="p-4 sm:p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Статус платежей</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={paymentStatusData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={(entry) => `${entry.name}: ${entry.value}`}
                                outerRadius={80}
                                dataKey="value"
                            >
                                {paymentStatusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Problem Participants */}
            {reportData.problem_participants.overdue.length > 0 && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <h3 className="text-lg font-semibold text-foreground">Участники с просроченными платежами</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Участник</TableHead>
                                    <TableHead>Программа</TableHead>
                                    <TableHead className="text-right">План</TableHead>
                                    <TableHead className="text-right">Факт</TableHead>
                                    <TableHead className="text-right">Задолженность</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.problem_participants.overdue.map((p: any) => (
                                    <TableRow key={p.participant_id}>
                                        <TableCell className="font-medium">{p.participant_name}</TableCell>
                                        <TableCell>{p.program_name}</TableCell>
                                        <TableCell className="text-right">${p.plan.toLocaleString()}</TableCell>
                                        <TableCell className="text-right">${p.fact.toLocaleString()}</TableCell>
                                        <TableCell className="text-right text-red-600 font-medium">
                                            ${(p.plan - p.fact).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}

            {/* Program Analytics Table */}
            <Card className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Аналитика по программам</h3>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Программа</TableHead>
                                <TableHead className="text-right">Всего участников</TableHead>
                                <TableHead className="text-right">Активных</TableHead>
                                <TableHead className="text-right">План</TableHead>
                                <TableHead className="text-right">Факт</TableHead>
                                <TableHead className="text-right">Выполнение</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reportData.program_analytics.map((p: any) => (
                                <TableRow key={p.program_id}>
                                    <TableCell className="font-medium">{p.program_name}</TableCell>
                                    <TableCell className="text-right">{p.total_participants}</TableCell>
                                    <TableCell className="text-right">{p.active_participants}</TableCell>
                                    <TableCell className="text-right">${p.plan_income.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">${p.fact_income.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={p.plan_income > 0 && (p.fact_income / p.plan_income) >= 1 ? 'default' : 'secondary'}>
                                            {p.plan_income > 0 ? ((p.fact_income / p.plan_income) * 100).toFixed(1) : 0}%
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    )
}
