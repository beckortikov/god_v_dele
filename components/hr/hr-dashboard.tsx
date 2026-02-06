'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Calendar, TrendingUp } from 'lucide-react'

export function HRDashboard() {
    const [stats, setStats] = useState({
        totalEmployees: 0,
        activeEmployees: 0,
        shiftsToday: 0,
        payrollTotal: 0
    })
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const today = new Date().toISOString().split('T')[0]
                const currentYear = new Date().getFullYear()
                const currentMonth = new Date().getMonth() + 1

                const [empRes, scheduleRes, payrollRes] = await Promise.all([
                    fetch('/api/hr/employees'),
                    fetch(`/api/hr/schedule?start_date=${today}&end_date=${today}`),
                    fetch(`/api/hr/payroll?month=${currentMonth}&year=${currentYear}`)
                ])

                const employees = await empRes.json()
                const schedule = await scheduleRes.json()
                const payroll = await payrollRes.json()

                setStats({
                    totalEmployees: Array.isArray(employees) ? employees.length : 0,
                    activeEmployees: Array.isArray(employees) ? employees.filter((e: any) => e.status === 'active').length : 0,
                    shiftsToday: Array.isArray(schedule) ? schedule.filter((s: any) => s.shift_type === 'work').length : 0,
                    payrollTotal: Array.isArray(payroll) ? payroll.reduce((sum: number, p: any) => sum + (Number(p.total_amount) || 0), 0) : 0
                })
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Ближайшие дни рождения</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Нет данных</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Отсутствующие</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Нет данных</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
