import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch aggregated dashboard metrics
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const programId = searchParams.get('program_id')

        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth() + 1

        // Fetch all monthly payments for current year with participant data
        let paymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select(`
                *,
                participant:participants(id, program_id)
            `)
            .eq('year', currentYear)

        const { data: paymentsData, error: paymentsError } = await paymentsQuery

        if (paymentsError) throw paymentsError

        // Filter by program if specified
        const payments = programId && programId !== 'all'
            ? paymentsData?.filter(p => p.participant?.program_id === programId)
            : paymentsData

        // Fetch all expenses for current year
        const { data: expenses, error: expensesError } = await supabaseAdmin
            .from('expenses')
            .select('*')
            .gte('expense_date', `${currentYear}-01-01`)

        if (expensesError) throw expensesError

        // Calculate YTD metrics for Current Balance
        const totalRevenueYTD = payments?.reduce((sum, p) => sum + (Number(p.fact_amount) || 0), 0) || 0
        const totalExpensesYTD = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
        const currentBalance = totalRevenueYTD - totalExpensesYTD

        // Calculate current month metrics
        const currentMonthPayments = payments?.filter(p => p.month_number === currentMonth) || []
        const monthlyRevenue = currentMonthPayments.reduce((sum, p) => sum + (Number(p.fact_amount) || 0), 0)

        const currentMonthExpenses = expenses?.filter(e => {
            const expenseMonth = new Date(e.expense_date).getMonth() + 1
            return expenseMonth === currentMonth
        }) || []
        const monthlyExpenses = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

        // Calculate cash runway using Total Balance / Monthly Burn
        // If monthly burn is 0, use average monthly burn or just returns 0
        const burnRate = monthlyExpenses > 0 ? monthlyExpenses : (totalExpensesYTD / currentMonth)
        const cashRunway = currentBalance > 0 && burnRate > 0
            ? (currentBalance / burnRate).toFixed(1)
            : '0'

        // Get overdue payments
        const { data: overduePayments, error: overdueError } = await supabaseAdmin
            .from('monthly_payments')
            .select(`
        *,
        participant:participants(name)
      `)
            .eq('status', 'overdue')
            .limit(10)

        if (overdueError) throw overdueError

        // Aggregate monthly data for charts (last 6 months)
        const monthlyData = []
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

        for (let i = 5; i >= 0; i--) {
            const targetMonth = currentMonth - i
            const targetYear = targetMonth > 0 ? currentYear : currentYear - 1
            const adjustedMonth = targetMonth > 0 ? targetMonth : 12 + targetMonth

            const monthPayments = payments?.filter(p =>
                p.month_number === adjustedMonth && p.year === targetYear
            ) || []

            const monthExpenses = expenses?.filter(e => {
                const expenseDate = new Date(e.expense_date)
                return expenseDate.getMonth() + 1 === adjustedMonth && expenseDate.getFullYear() === targetYear
            }) || []

            const income = monthPayments.reduce((sum, p) => sum + (Number(p.fact_amount) || 0), 0)
            const expense = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

            monthlyData.push({
                month: monthNames[adjustedMonth - 1],
                income,
                expenses: expense,
                balance: income - expense,
                mrr: income,
                participants: monthPayments.length,
                paymentRate: monthPayments.length > 0
                    ? Math.round((monthPayments.filter(p => p.status === 'paid').length / monthPayments.length) * 100)
                    : 0
            })
        }

        return NextResponse.json({
            data: {
                metrics: {
                    currentBalance,
                    monthlyRevenue,
                    monthlyExpenses,
                    cashRunway: Number(cashRunway)
                },
                overduePayments: overduePayments?.map(p => ({
                    name: p.participant?.name || 'Unknown',
                    amount: p.plan_amount - (p.fact_amount || 0),
                    days: Math.floor((new Date().getTime() - new Date(p.due_date || new Date()).getTime()) / (1000 * 60 * 60 * 24))
                })) || [],
                chartData: monthlyData
            }
        }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching dashboard data:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
