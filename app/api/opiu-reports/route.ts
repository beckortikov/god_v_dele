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

        // Fetch accounts
        let accountsQuery = supabaseAdmin.from('accounts').select('*')
        if (programId !== 'all') {
            accountsQuery = accountsQuery.or(`program_id.eq.${programId},program_id.is.null`)
        }
        const { data: accounts, error: accountsError } = await accountsQuery
        // Ignore accountsError for now if table doesn't exist yet, we'll handle gracefully.

        // Fetch payments for the selected month
        let paymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('*, participant:participants!inner(program_id)')
            .eq('month_number', month)
            .eq('year', year)

        if (programId !== 'all') {
            paymentsQuery = paymentsQuery.eq('participant.program_id', programId)
        }

        const { data: payments, error: paymentsError } = await paymentsQuery
        if (paymentsError) throw paymentsError

        // Fetch expenses for the selected month
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        let expensesQuery = supabaseAdmin
            .from('expenses')
            .select('*')
            .gte('expense_date', startDate)
            .lte('expense_date', endDate)

        if (programId !== 'all') {
            expensesQuery = expensesQuery.eq('program_id', programId)
        }

        const { data: expenses, error: expensesError } = await expensesQuery
        if (expensesError) throw expensesError

        // Fetch Opening Balances (Before startDate)
        let openingPaymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('fact_amount, currency, original_amount, account_id, participant:participants!inner(program_id)')
            .or(`year.lt.${year},and(year.eq.${year},month_number.lt.${month})`)
            
        if (programId !== 'all') {
            openingPaymentsQuery = openingPaymentsQuery.eq('participant.program_id', programId)
        }
        
        const { data: openingPayments, error: openingPaymentsError } = await openingPaymentsQuery
        if (openingPaymentsError) throw openingPaymentsError

        let openingExpensesQuery = supabaseAdmin
            .from('expenses')
            .select('amount, currency, original_amount, account_id')
            .lt('expense_date', startDate)

        if (programId !== 'all') {
            openingExpensesQuery = openingExpensesQuery.eq('program_id', programId)
        }

        const { data: openingExpenses, error: openingExpensesError } = await openingExpensesQuery
        if (openingExpensesError) throw openingExpensesError

        let openingBalanceUSD = 0
        let openingBalanceTJS = 0

        const accountBalances: Record<string, any> = {}
        accounts?.forEach(acc => {
            accountBalances[acc.id] = {
                id: acc.id,
                name: acc.name,
                currency: acc.currency,
                opening_balance: Number(acc.initial_balance) || 0,
                closing_balance: 0,
                fact_income: 0,
                total_expenses: 0
            }
        })

        openingPayments?.forEach(p => {
            openingBalanceUSD += p.fact_amount || 0
            if (p.currency === 'TJS') openingBalanceTJS += p.original_amount || 0
            
            const acc = p.account_id ? accountBalances[p.account_id] : null
            if (acc) {
                if (acc.currency === 'TJS') {
                    acc.opening_balance += p.original_amount || 0
                } else {
                    acc.opening_balance += p.fact_amount || 0
                }
            }
        })

        openingExpenses?.forEach(e => {
            openingBalanceUSD -= e.amount || 0
            if (e.currency === 'TJS') openingBalanceTJS -= e.original_amount || 0
            
            const acc = e.account_id ? accountBalances[e.account_id] : null
            if (acc) {
                if (acc.currency === 'TJS') {
                    acc.opening_balance -= e.original_amount || 0
                } else {
                    acc.opening_balance -= e.amount || 0
                }
            }
        })

        // Current month calculations for accounts
        payments?.forEach(p => {
            const acc = p.account_id ? accountBalances[p.account_id] : null
            if (acc) {
                if (acc.currency === 'TJS') {
                    acc.fact_income += p.original_amount || 0
                } else {
                    acc.fact_income += p.fact_amount || 0
                }
            }
        })

        expenses?.forEach(e => {
            const acc = e.account_id ? accountBalances[e.account_id] : null
            if (acc) {
                if (acc.currency === 'TJS') {
                    acc.total_expenses += e.original_amount || 0
                } else {
                    acc.total_expenses += e.amount || 0
                }
            }
        })

        // Calculate closing balances per account
        Object.values(accountBalances).forEach(acc => {
            acc.closing_balance = acc.opening_balance + acc.fact_income - acc.total_expenses
        })

        let account_balances_list = Object.values(accountBalances)

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
        let factIncomeTJS = 0
        let overdueCount = 0
        let partialCount = 0
        let paidCount = 0

        const participantPayments = activeParticipants.map(participant => {
            const payment = payments?.find(p => p.participant_id === participant.id)
            const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            const fact = payment?.fact_amount || 0
            const factTJS = payment?.currency === 'TJS' ? (payment.original_amount || 0) : 0

            planIncome += plan
            factIncome += fact
            factIncomeTJS += factTJS

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
                factTJS,
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

        let totalExpensesTJS = 0

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
            if (expense.currency === 'TJS') {
                totalExpensesTJS += expense.original_amount || 0
            }
        })

        const totalExpenses = Object.values(expensesByCategory).reduce((sum, val) => sum + val, 0)
        
        const closingBalanceUSD = openingBalanceUSD + factIncome - totalExpenses
        const closingBalanceTJS = openingBalanceTJS + factIncomeTJS - totalExpensesTJS

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
                    fact_income: 0,
                    fact_income_tjs: 0
                }
            }

            acc[programId].total_participants++
            if (participant.status === 'active') acc[programId].active_participants++
            if (participant.status === 'completed') acc[programId].completed_participants++

            // Add financial data for this month
            const payment = payments?.find(p => p.participant_id === participant.id)
            const plan = payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            const fact = payment?.fact_amount || 0
            const factTJS = payment?.currency === 'TJS' ? (payment.original_amount || 0) : 0

            acc[programId].plan_income += plan
            acc[programId].fact_income += fact
            acc[programId].fact_income_tjs += factTJS

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
                opening_balance_usd: openingBalanceUSD,
                opening_balance_tjs: openingBalanceTJS,
                closing_balance_usd: closingBalanceUSD,
                closing_balance_tjs: closingBalanceTJS,
                plan_income: planIncome,
                fact_income: factIncome,
                fact_income_tjs: factIncomeTJS,
                total_expenses: totalExpenses,
                total_expenses_tjs: totalExpensesTJS,
                gross_profit: grossProfit,
                net_profit: netProfit,
                deviation: factIncome - planIncome,
                completion_rate: planIncome > 0 ? (factIncome / planIncome) * 100 : 0,
                paid_count: paidCount,
                partial_count: partialCount,
                overdue_count: overdueCount,
                account_balances: account_balances_list
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
