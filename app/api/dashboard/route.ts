import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { overdueMonths, type MonthlyPayment, type Participant } from '@/components/participants/types'

// GET - Fetch aggregated dashboard metrics
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const programId = searchParams.get('program_id')

        const currentYear = new Date().getFullYear()
        const currentMonth = new Date().getMonth() + 1

        // Fetch all monthly payments for current year by actual receipt date OR planned billing year if not paid yet
        let paymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select(`
                *,
                participant:participants(id, program_id)
            `)
            .or(`paid_date.gte.${currentYear}-01-01,and(paid_date.is.null,year.eq.${currentYear})`)

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
            .is('event_id', null)

        if (expensesError) throw expensesError

        // Calculate YTD metrics for Current Balance (using actual paid payments in this year)
        const totalRevenueYTD = payments?.filter(p => {
            if (p.paid_date) {
                return p.paid_date >= `${currentYear}-01-01`
            }
            return false
        }).reduce((sum, p) => sum + (Number(p.fact_amount) || 0), 0) || 0
        const totalExpensesYTD = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0
        const currentBalance = totalRevenueYTD - totalExpensesYTD

        // Calculate current month metrics (using actual cash receipts by paid_date)
        const currentMonthPayments = payments?.filter(p => {
            if (p.paid_date) {
                const pDate = new Date(p.paid_date)
                return pDate.getMonth() + 1 === currentMonth && pDate.getFullYear() === currentYear
            }
            return false
        }) || []
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

        // Overdue: the same rule as the participants page (overdueMonths in
        // components/participants/types.ts): active participants only; every past
        // month that was billed (has a row, or lies inside the program duration)
        // and is not covered to the cent by fact vs plan_amount (tariff fallback).
        let overdueParticipantsQuery = supabaseAdmin
            .from('participants')
            .select('id, name, status, tariff, program_id, start_date, program:programs(id, name, price_per_month, duration_months)')
            .eq('status', 'active')
        if (programId && programId !== 'all') {
            overdueParticipantsQuery = overdueParticipantsQuery.eq('program_id', programId)
        }
        const [overdueParticipantsRes, overduePaymentsRes] = await Promise.all([
            overdueParticipantsQuery,
            supabaseAdmin
                .from('monthly_payments')
                .select('id, participant_id, year, month_number, plan_amount, fact_amount, status'),
        ])
        if (overdueParticipantsRes.error) throw overdueParticipantsRes.error
        if (overduePaymentsRes.error) throw overduePaymentsRes.error

        // Get recent payments (last 10 paid payments, sorted by updated_at DESC)
        const { data: recentPaymentsData, error: recentError } = await supabaseAdmin
            .from('monthly_payments')
            .select(`
                *,
                participant:participants(name, program_id, program:programs(name))
            `)
            .not('fact_amount', 'is', null)
            .gt('fact_amount', 0)
            .order('updated_at', { ascending: false })
            .limit(10)

        if (recentError) throw recentError

        // One entry per overdue month, most recent first. `days` counts from the end
        // of the billed month (the first day of the next month), the same as the
        // debt aging in Аналитика.
        const now = new Date()
        const paymentsByParticipant = new Map<string, MonthlyPayment[]>()
        for (const p of (overduePaymentsRes.data || []) as MonthlyPayment[]) {
            const list = paymentsByParticipant.get(p.participant_id)
            if (list) list.push(p)
            else paymentsByParticipant.set(p.participant_id, [p])
        }
        const allOverdue = ((overdueParticipantsRes.data || []) as unknown as Participant[])
            .flatMap(participant =>
                overdueMonths(participant, paymentsByParticipant.get(participant.id) || [], now).map(m => ({
                    participant_id: participant.id,
                    name: participant.name || 'Unknown',
                    year: m.year,
                    month: m.month,
                    amount: m.plan - m.fact,
                    reason: m.reason,
                    days: Math.max(0, Math.floor((now.getTime() - new Date(m.year, m.month, 1).getTime()) / 86_400_000)),
                }))
            )
            .sort((a, b) => b.year - a.year || b.month - a.month || b.amount - a.amount)

        // Filter recent payments by program if specified
        const recentPayments = programId && programId !== 'all'
            ? recentPaymentsData?.filter((p: any) => (p.program_id || p.participant?.program_id) === programId)
            : recentPaymentsData

        // Aggregate monthly data for charts (last 6 months)
        const monthlyData = []
        const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

        for (let i = 5; i >= 0; i--) {
            const targetMonth = currentMonth - i
            const targetYear = targetMonth > 0 ? currentYear : currentYear - 1
            const adjustedMonth = targetMonth > 0 ? targetMonth : 12 + targetMonth

            // Select actual cash payments received in this adjustedMonth/targetYear by paid_date
            const monthPayments = payments?.filter(p => {
                if (p.paid_date) {
                    const pDate = new Date(p.paid_date)
                    return pDate.getMonth() + 1 === adjustedMonth && pDate.getFullYear() === targetYear
                }
                return false
            }) || []

            const monthExpenses = expenses?.filter(e => {
                const expenseDate = new Date(e.expense_date)
                return expenseDate.getMonth() + 1 === adjustedMonth && expenseDate.getFullYear() === targetYear
            }) || []

            const income = monthPayments.reduce((sum, p) => sum + (Number(p.fact_amount) || 0), 0)
            const expense = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

            // Cohort billing payments for rate/participants tracking
            const cohortPayments = payments?.filter(p =>
                p.month_number === adjustedMonth && p.year === targetYear
            ) || []

            monthlyData.push({
                month: monthNames[adjustedMonth - 1],
                income,
                expenses: expense,
                balance: income - expense,
                mrr: income,
                participants: cohortPayments.length,
                paymentRate: cohortPayments.length > 0
                    ? Math.round((cohortPayments.filter(p => p.status === 'paid').length / cohortPayments.length) * 100)
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
                // Top 10 for the list; totals cover every overdue month
                overduePayments: allOverdue.slice(0, 10),
                overdueSummary: {
                    payments: allOverdue.length,
                    participants: new Set(allOverdue.map(o => o.participant_id)).size,
                    amount: allOverdue.reduce((sum, o) => sum + o.amount, 0),
                    missing: allOverdue.filter(o => o.reason === 'missing').length,
                    underpaid: allOverdue.filter(o => o.reason === 'underpaid').length,
                },
                recentPayments: recentPayments?.map(p => ({
                    name: p.participant?.name || 'Unknown',
                    program: p.participant?.program?.name || 'Не указана',
                    amount: p.fact_amount || 0,
                    month: p.month_number,
                    year: p.year,
                    date: p.updated_at
                })) || [],
                chartData: monthlyData
            }
        }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching dashboard data:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
