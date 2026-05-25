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

        // 1. Fetch Planned Period Payments for the selected month/year (cohort billing)
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

        // Calculate startDate and endDate for date comparisons
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        // 2. Fetch Cash Payments (Actual Cash Received in the selected month/year)
        let cashPaymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('*, participant:participants!inner(program_id)')
            .or(`and(paid_date.gte.${startDate},paid_date.lte.${endDate}),and(paid_date.is.null,month_number.eq.${month},year.eq.${year},fact_amount.gt.0)`)

        if (programId !== 'all') {
            cashPaymentsQuery = cashPaymentsQuery.eq('participant.program_id', programId)
        }

        const { data: cashPayments, error: cashPaymentsError } = await cashPaymentsQuery
        if (cashPaymentsError) throw cashPaymentsError

        // Fetch expenses for the selected month
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

        // 3. Fetch Opening Balances (Before startDate) - cash basis (paid_date < startDate)
        let allOpeningPaymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('fact_amount, currency, original_amount, account_id, paid_date, year, month_number, participant:participants!inner(program_id)')
            .lte('year', year)
            
        if (programId !== 'all') {
            allOpeningPaymentsQuery = allOpeningPaymentsQuery.eq('participant.program_id', programId)
        }
        
        const { data: allOpeningPayments, error: allOpeningPaymentsError } = await allOpeningPaymentsQuery
        if (allOpeningPaymentsError) throw allOpeningPaymentsError

        // Filter opening payments in JS safely to support fallbacks for null paid_date
        const openingPayments = allOpeningPayments?.filter(p => {
            const dateStr = p.paid_date || `${p.year}-${String(p.month_number).padStart(2, '0')}-01`
            return dateStr < startDate
        })

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

        // Current month calculations for accounts (using cashPayments for actual cash flows)
        cashPayments?.forEach(p => {
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

        // 4. YTD Calculations (split into planned period vs actual cash received)
        // Fetch YTD Period Payments
        let ytdPeriodPaymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('*, participant:participants!inner(program_id)')
            .eq('year', year)
            .lte('month_number', month)

        if (programId !== 'all') {
            ytdPeriodPaymentsQuery = ytdPeriodPaymentsQuery.eq('participant.program_id', programId)
        }
        const { data: ytdPeriodPayments, error: ytdPeriodPaymentsError } = await ytdPeriodPaymentsQuery
        if (ytdPeriodPaymentsError) throw ytdPeriodPaymentsError

        // Fetch YTD Cash Payments
        const ytdStartDate = `${year}-01-01`
        let ytdCashPaymentsQuery = supabaseAdmin
            .from('monthly_payments')
            .select('fact_amount, currency, original_amount, paid_date, year, month_number, participant:participants!inner(program_id)')
            .or(`and(paid_date.gte.${ytdStartDate},paid_date.lte.${endDate}),and(paid_date.is.null,year.eq.${year},month_number.lte.${month},fact_amount.gt.0)`)

        if (programId !== 'all') {
            ytdCashPaymentsQuery = ytdCashPaymentsQuery.eq('participant.program_id', programId)
        }
        const { data: ytdCashPayments, error: ytdCashPaymentsError } = await ytdCashPaymentsQuery
        if (ytdCashPaymentsError) throw ytdCashPaymentsError

        // Fetch all expenses for the year (for YTD calculations)
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
            const plan = payment?.plan_amount || payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            const fact = payment?.fact_amount || 0
            const factTJS = payment?.currency === 'TJS' ? (payment.original_amount || 0) : 0

            planIncome += plan

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

        // Calculate actual cash receipts for the month (using cashPayments)
        cashPayments?.forEach(p => {
            factIncome += p.fact_amount || 0
            if (p.currency === 'TJS') {
                factIncomeTJS += p.original_amount || 0
            }
        })

        // Calculate EXPENSES by category dynamically
        const expensesByCategory: Record<string, number> = {
            'Зарплаты': 0,
            'Маркетинг': 0,
            'Офис': 0,
            'Мероприятия': 0,
            'Бонусы': 0,
            'Организационные': 0,
            'Прочее': 0
        }

        let totalExpensesTJS = 0

        expenses?.forEach(expense => {
            const category = expense.category || 'Прочее'
            expensesByCategory[category] = (expensesByCategory[category] || 0) + Number(expense.amount || 0)
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

        // Calculate ytdPlanIncome using ytdPeriodPayments (cohort target period billing)
        activeParticipants.forEach(participant => {
            const participantYtdPayments = ytdPeriodPayments?.filter(p => p.participant_id === participant.id) || []
            participantYtdPayments.forEach(payment => {
                const plan = payment.plan_amount || payment.amount || participant.tariff || participant.program?.price_per_month || 0
                ytdPlanIncome += plan
            })
        })

        // Calculate ytdFactIncome using ytdCashPayments (actual cash received from Jan 1)
        ytdCashPayments?.forEach(payment => {
            ytdFactIncome += payment.fact_amount || 0
        })

        // YTD Expenses dynamically
        const ytdExpensesByCategory: Record<string, number> = {
            'Зарплаты': 0,
            'Маркетинг': 0,
            'Офис': 0,
            'Мероприятия': 0,
            'Бонусы': 0,
            'Организационные': 0,
            'Прочее': 0
        }

        ytdExpenses?.forEach(expense => {
            const category = expense.category || 'Прочее'
            ytdExpensesByCategory[category] = (ytdExpensesByCategory[category] || 0) + Number(expense.amount || 0)
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

            // Plan is cohort-based:
            const payment = payments?.find(p => p.participant_id === participant.id)
            const plan = payment?.plan_amount || payment?.amount || participant.tariff || participant.program?.price_per_month || 0
            acc[programId].plan_income += plan

            // Fact is cash-basis: sum of all actual cash payments received in this month for this participant
            const participantCashPayments = cashPayments?.filter(p => p.participant_id === participant.id) || []
            const fact = participantCashPayments.reduce((sum, p) => sum + (p.fact_amount || 0), 0)
            const factTJS = participantCashPayments.reduce((sum, p) => p.currency === 'TJS' ? sum + (p.original_amount || 0) : sum, 0)
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
            deferred_revenue: Math.max(0, planIncome - factIncome), // Отложенная выручка (неполученные платежи)

            // Receivables (Дебиторская задолженность)
            accounts_receivable: Math.max(0, planIncome - (payments?.reduce((sum, p) => sum + (p.fact_amount || 0), 0) || 0)), // Дебиторская задолженность по текущему месяцу начислений
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
