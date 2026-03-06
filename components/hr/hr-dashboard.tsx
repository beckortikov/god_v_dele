'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, Calendar, TrendingUp, CheckCircle2, ListTodo, Activity } from 'lucide-react'
// Removed Progress import because it doesn't exist yet
import { Badge } from '@/components/ui/badge'

export function HRDashboard() {
    const [stats, setStats] = useState({
        totalEmployees: 0,
        activeEmployees: 0,
        shiftsToday: 0,
        payrollTotal: 0
    })
    const [employeeTasks, setEmployeeTasks] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const today = new Date().toISOString().split('T')[0]
                const currentYear = new Date().getFullYear()
                const currentMonth = new Date().getMonth() + 1

                const [empRes, scheduleRes, payrollRes, tasksRes] = await Promise.all([
                    fetch('/api/hr/employees'),
                    fetch(`/api/hr/schedule?start_date=${today}&end_date=${today}`),
                    fetch(`/api/hr/payroll?month=${currentMonth}&year=${currentYear}`),
                    fetch(`/api/employee/tasks`) // fetch all tasks without filters
                ])

                const employees = await empRes.json()
                const schedule = await scheduleRes.json()
                const payroll = await payrollRes.json()
                const tasks = await tasksRes.json()

                const employeesArray = Array.isArray(employees) ? employees : []
                const tasksArray = Array.isArray(tasks) ? tasks : []

                setStats({
                    totalEmployees: employeesArray.length,
                    activeEmployees: employeesArray.filter((e: any) => e.status === 'active').length,
                    shiftsToday: Array.isArray(schedule) ? schedule.filter((s: any) => s.shift_type === 'work').length : 0,
                    payrollTotal: Array.isArray(payroll) ? payroll.reduce((sum: number, p: any) => sum + (Number(p.total_amount) || 0), 0) : 0
                })

                // Group tasks by employee
                const taskStatsMap: Record<string, any> = {}

                tasksArray.forEach(task => {
                    const empId = task.assignee_id
                    if (!empId) return

                    if (!taskStatsMap[empId]) {
                        // find employee info
                        const empRecord = employeesArray.find(e => e.id === empId)
                        taskStatsMap[empId] = {
                            id: empId,
                            name: empRecord ? `${empRecord.first_name} ${empRecord.last_name}` : 'Неизвестный сотрудник',
                            position: empRecord ? empRecord.position : 'Неизвестная должность',
                            total: 0,
                            todo: 0,
                            inProgress: 0,
                            completed: 0
                        }
                    }

                    taskStatsMap[empId].total++
                    if (task.status === 'completed') taskStatsMap[empId].completed++
                    else if (task.status === 'in_progress') taskStatsMap[empId].inProgress++
                    else taskStatsMap[empId].todo++
                })

                // Add employees who have NO tasks (to show 0)
                employeesArray.forEach((emp: any) => {
                    if (!taskStatsMap[emp.id]) {
                        taskStatsMap[emp.id] = {
                            id: emp.id,
                            name: `${emp.first_name} ${emp.last_name}`,
                            position: emp.position,
                            total: 0,
                            todo: 0,
                            inProgress: 0,
                            completed: 0
                        }
                    }
                })

                const sortedEmployeeTasks = Object.values(taskStatsMap).sort((a: any, b: any) => b.total - a.total)
                setEmployeeTasks(sortedEmployeeTasks)
            } catch (error) {
                console.error('Error fetching dashboard stats:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchStats()
    }, [])

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl font-bold">HR Обзор</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Всего сотрудников</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.totalEmployees}</div>
                        <p className="text-xs text-muted-foreground">{stats.activeEmployees} Активных сотрудников</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Сегодня в смене</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.shiftsToday}</div>
                        <p className="text-xs text-muted-foreground">По графику</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Фонд оплаты труда</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats.payrollTotal.toLocaleString()} TJS</div>
                        <p className="text-xs text-muted-foreground">За текущий месяц</p>
                    </CardContent>
                </Card>
            </div>

            {/* Task Efficiency Section */}
            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            Эффективность сотрудников
                        </CardTitle>
                        <CardDescription>
                            Анализ выполнения поставленных задач по каждому сотруднику и руководителю
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <p className="text-sm text-muted-foreground">Загрузка данных...</p>
                        ) : employeeTasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Нет сотрудников или задач для анализа.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-muted/50 border-y border-border">
                                        <tr>
                                            <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Сотрудник</th>
                                            <th className="p-3 font-medium text-muted-foreground sm:hidden">Сотр.</th>
                                            <th className="p-3 font-medium text-muted-foreground text-center">Всего</th>
                                            <th className="p-3 font-medium text-muted-foreground text-center">К выполнению</th>
                                            <th className="p-3 font-medium text-muted-foreground text-center">В работе</th>
                                            <th className="p-3 font-medium text-muted-foreground text-center">Завершено</th>
                                            <th className="p-3 font-medium text-muted-foreground w-1/4 min-w-[120px]">КПД (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {employeeTasks.map((emp) => {
                                            const efficiency = emp.total > 0 ? (emp.completed / emp.total) * 100 : 0

                                            // Determine progress bar color based on performance
                                            let progressColor = "bg-primary"
                                            if (efficiency === 100) progressColor = "bg-emerald-500"
                                            else if (efficiency < 50 && emp.total > 0) progressColor = "bg-amber-500"
                                            else if (emp.total === 0) progressColor = "bg-muted"

                                            return (
                                                <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                                                    <td className="p-3">
                                                        <div className="font-semibold text-foreground">{emp.name}</div>
                                                        <div className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]">{emp.position}</div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <Badge variant="outline" className="font-bold">{emp.total}</Badge>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className="text-blue-600 dark:text-blue-400 font-medium">{emp.todo}</span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className="text-amber-600 dark:text-amber-400 font-medium">{emp.inProgress}</span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{emp.completed}</span>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-xs font-medium">{Math.round(efficiency)}%</span>
                                                            <span className="text-xs text-muted-foreground">{emp.completed}/{emp.total}</span>
                                                        </div>
                                                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className={`h-2 rounded-full transition-all duration-500 ${progressColor}`}
                                                                style={{ width: `${emp.total > 0 ? Math.round(efficiency) : 0}%` }}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
