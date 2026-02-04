import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
        const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
        const programId = searchParams.get('program_id') || 'all'

        // Fetch all participants
        let participantsQuery = supabaseAdmin
            .from('participants')
            .select(`
        *,
        program:programs(*)
      `)

        if (programId !== 'all') {
            participantsQuery = participantsQuery.eq('program_id', programId)
        }

        const { data: participants, error: participantsError } = await participantsQuery

        if (participantsError) throw participantsError

        // Fetch payments for the selected month
        const { data: payments, error: paymentsError } = await supabaseAdmin
            .from('monthly_payments')
            .select('*')
            .eq('month_number', month)
            .eq('year', year)

        if (paymentsError) throw paymentsError

        // Fetch expenses for the selected month
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const { data: expenses, error: expensesError } = await supabaseAdmin
            .from('expenses')
            .select('*')
            .gte('expense_date', startDate)
            .lte('expense_date', endDate)

        if (expensesError) throw expensesError

        // Fetch all payments for the year (for YTD calculations)
        const { data: ytdPayments, error: ytdError } = await supabaseAdmin
            .from('monthly_payments')
            .select('*')
            .eq('year', year)
            .lte('month_number', month)

        if (ytdError) throw ytdError

        // Fetch all expenses for the year (for YTD calculations)
        const ytdStartDate = new Date(year, 0, 1).toISOString().split('T')[0]
        const { data: ytdExpenses, error: ytdExpensesError } = await supabaseAdmin
            .from('expenses')
            .select('*')
            .gte('expense_date', ytdStartDate)
            .lte('expense_date', endDate)

        if (ytdExpensesError) throw ytdExpensesError

        // Calculate metrics
        const activeParticipants = participants?.filter(p => p.status === 'active') || []
        const completedParticipants = participants?.filter(p => p.status === 'completed') || []
        const archivedParticipants = participants?.filter(p => p.status === 'archived') || []

        // Financial metrics for the month - INCOME
        let planIncome = 0
        let factIncome = 0
        let overdueCount = 0
        let partialCount = 0
        let paidCount = 0

        const participantPayments = activeParticipants.map(participant => {
            const payment = payments?.find(p => p.participant_id === participant.id)
            const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            const fact = payment?.fact_amount || 0

            planIncome += plan
            factIncome += fact

            let status = 'unpaid'
            if (fact >= plan && fact > 0) {
                status = 'paid'
                paidCount++
            } else if (fact > 0 && fact < plan) {
                status = 'partial'
                partialCount++
            } else if (payment?.status === 'overdue' || fact === 0) {
                status = 'overdue'
                overdueCount++
            }

            return {
                participant_id: participant.id,
                participant_name: participant.name,
                program_name: participant.program?.name || 'Без программы',
                plan,
                fact,
                deviation: fact - plan,
                status,
                notes: payment?.notes || null
            }
        })

        // Calculate EXPENSES by category
        const expensesByCategory = {
            marketing: 0,
            salaries: 0,
            office: 0,
            events: 0,
            bonuses: 0,
            organizational: 0,
            other: 0
        }

        const categoryMapping: { [key: string]: keyof typeof expensesByCategory } = {
            'Маркетинг': 'marketing',
            'Зарплаты': 'salaries',
            'Офис': 'office',
            'Мероприятия': 'events',
            'Бонусы': 'bonuses',
            'Организационные': 'organizational',
            'Прочее': 'other'
        }

        expenses?.forEach(expense => {
            const category = categoryMapping[expense.category] || 'other'
            expensesByCategory[category] += expense.amount || 0
        })

        const totalExpenses = Object.values(expensesByCategory).reduce((sum, val) => sum + val, 0)

        // YTD (Year-to-Date) calculations
        let ytdPlanIncome = 0
        let ytdFactIncome = 0

        activeParticipants.forEach(participant => {
            const participantYtdPayments = ytdPayments?.filter(p => p.participant_id === participant.id) || []
            participantYtdPayments.forEach(payment => {
                const plan = payment.amount || participant.tariff || participant.program?.price_per_month || 0
                ytdPlanIncome += plan
                ytdFactIncome += payment.fact_amount || 0
            })
        })

        // YTD Expenses
        const ytdExpensesByCategory = {
            marketing: 0,
            salaries: 0,
            office: 0,
            events: 0,
            bonuses: 0,
            organizational: 0,
            other: 0
        }

        ytdExpenses?.forEach(expense => {
            const category = categoryMapping[expense.category] || 'other'
            ytdExpensesByCategory[category] += expense.amount || 0
        })

        const ytdTotalExpenses = Object.values(ytdExpensesByCategory).reduce((sum, val) => sum + val, 0)

        // Program analytics
        const programStats = participants?.reduce((acc: any, participant) => {
            const programId = participant.program_id
            const programName = participant.program?.name || 'Без программы'

            if (!acc[programId]) {
                acc[programId] = {
                    program_id: programId,
                    program_name: programName,
                    total_participants: 0,
                    active_participants: 0,
                    completed_participants: 0,
                    plan_income: 0,
                    fact_income: 0
                }
            }

            acc[programId].total_participants++
            if (participant.status === 'active') acc[programId].active_participants++
            if (participant.status === 'completed') acc[programId].completed_participants++

            // Add financial data for this month
            const payment = payments?.find(p => p.participant_id === participant.id)
            const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            const fact = payment?.fact_amount || 0

            acc[programId].plan_income += plan
            acc[programId].fact_income += fact

            return acc
        }, {})

        const programAnalytics = Object.values(programStats || {})

        // IFRS Financial Metrics (МСФО)
        const grossProfit = factIncome - totalExpenses // Валовая прибыль
        const operatingProfit = grossProfit // Операционная прибыль (пока без прочих доходов/расходов)
        const netProfit = operatingProfit // Чистая прибыль (пока без налогов)

        const ytdGrossProfit = ytdFactIncome - ytdTotalExpenses
        const ytdOperatingProfit = ytdGrossProfit
        const ytdNetProfit = ytdOperatingProfit

        const ifrsMetrics = {
            // Revenue Recognition (Признание выручки)
            revenue_recognized: factIncome, // Признанная выручка (фактические платежи)
            deferred_revenue: planIncome - factIncome, // Отложенная выручка (неполученные платежи)

            // Receivables (Дебиторская задолженность)
            accounts_receivable: planIncome - factIncome, // Дебиторская задолженность
            overdue_receivables: participantPayments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + p.plan, 0),

            // Expenses (Расходы)
            total_expenses: totalExpenses,
            expenses_by_category: expensesByCategory,

            // Profitability (Прибыльность)
            gross_profit: grossProfit, // Валовая прибыль
            operating_profit: operatingProfit, // Операционная прибыль
            net_profit: netProfit, // Чистая прибыль
            profit_margin: factIncome > 0 ? (netProfit / factIncome) * 100 : 0, // Рентабельность

            // Performance metrics (Показатели эффективности)
            collection_rate: planIncome > 0 ? (factIncome / planIncome) * 100 : 0, // Коэффициент инкассации
            revenue_completion_rate: planIncome > 0 ? (factIncome / planIncome) * 100 : 0, // Процент выполнения плана

            // YTD metrics (Показатели с начала года)
            ytd_revenue: ytdFactIncome,
            ytd_plan: ytdPlanIncome,
            ytd_expenses: ytdTotalExpenses,
            ytd_gross_profit: ytdGrossProfit,
            ytd_operating_profit: ytdOperatingProfit,
            ytd_net_profit: ytdNetProfit,
            ytd_completion_rate: ytdPlanIncome > 0 ? (ytdFactIncome / ytdPlanIncome) * 100 : 0,
            ytd_profit_margin: ytdFactIncome > 0 ? (ytdNetProfit / ytdFactIncome) * 100 : 0
        }

        // Response data
        const reportData = {
            period: {
                month,
                year,
                month_name: new Date(year, month - 1).toLocaleString('ru-RU', { month: 'long' })
            },
            summary: {
                total_participants: participants?.length || 0,
                active_participants: activeParticipants.length,
                completed_participants: completedParticipants.length,
                archived_participants: archivedParticipants.length,
                plan_income: planIncome,
                fact_income: factIncome,
                total_expenses: totalExpenses,
                gross_profit: grossProfit,
                net_profit: netProfit,
                deviation: factIncome - planIncome,
                completion_rate: planIncome > 0 ? (factIncome / planIncome) * 100 : 0,
                paid_count: paidCount,
                partial_count: partialCount,
                overdue_count: overdueCount
            },
            ifrs_metrics: ifrsMetrics,
            program_analytics: programAnalytics,
            participant_payments: participantPayments,
            problem_participants: {
                overdue: participantPayments.filter(p => p.status === 'overdue'),
                partial: participantPayments.filter(p => p.status === 'partial')
            }
        }

        return NextResponse.json({ data: reportData }, { status: 200 })
    } catch (error: any) {
        console.error('Error generating ОПиУ report:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
