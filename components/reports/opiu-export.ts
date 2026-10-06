'use client'

// PDF / XLSX export of the ОПиУ report. The document layout (including the
// colours inside the generated PDF) is unchanged from the original page.
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import * as XLSX from 'xlsx'

// Configure pdfMake with fonts
if (typeof window !== 'undefined') {
    (pdfMake as any).vfs = pdfFonts
}

export function exportOpiuToPDF(reportData: any) {
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
                        ['Сальдо на начало', `$${reportData.summary.opening_balance_usd.toLocaleString()} ${reportData.summary.opening_balance_tjs > 0 ? `(${reportData.summary.opening_balance_tjs.toLocaleString()} TJS)` : ''}`],
                        ['Сальдо на конец', `$${reportData.summary.closing_balance_usd.toLocaleString()} ${reportData.summary.closing_balance_tjs > 0 ? `(${reportData.summary.closing_balance_tjs.toLocaleString()} TJS)` : ''}`],
                        ['Всего участников', reportData.summary.total_participants.toString()],
                        ['Активных участников', reportData.summary.active_participants.toString()],
                        ['Завершивших программу', reportData.summary.completed_participants.toString()],
                        ['План по доходам', `$${reportData.summary.plan_income.toLocaleString()}`],
                        ['Факт по доходам', `$${reportData.summary.fact_income.toLocaleString()} ${reportData.summary.fact_income_tjs > 0 ? `(${reportData.summary.fact_income_tjs.toLocaleString()} TJS)` : ''}`],
                        ['Всего расходов', `$${reportData.summary.total_expenses.toLocaleString()} ${reportData.summary.total_expenses_tjs > 0 ? `(${reportData.summary.total_expenses_tjs.toLocaleString()} TJS)` : ''}`],
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

            // Detailed Accounts Section
            { text: 'Остатки на счетах (детализация)', style: 'sectionHeader', margin: [0, 0, 0, 10] },
            {
                table: {
                    widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                    body: [
                        ['Счет', 'Валюта', 'На начало', 'Приход', 'Расход', 'На конец'],
                        ...reportData.summary.account_balances.map((acc: any) => [
                            acc.name,
                            acc.currency,
                            acc.currency === 'TJS' ? `${acc.opening_balance.toLocaleString()} TJS` : `$${acc.opening_balance.toLocaleString()}`,
                            acc.currency === 'TJS' ? `${acc.fact_income.toLocaleString()} TJS` : `$${acc.fact_income.toLocaleString()}`,
                            acc.currency === 'TJS' ? `${acc.total_expenses.toLocaleString()} TJS` : `$${acc.total_expenses.toLocaleString()}`,
                            acc.currency === 'TJS' ? `${acc.closing_balance.toLocaleString()} TJS` : `$${acc.closing_balance.toLocaleString()}`
                        ])
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
                        ...Object.entries(reportData.ifrs_metrics.expenses_by_category || {}).map(([catName, amount]) => [
                            catName,
                            `$${Number(amount || 0).toLocaleString()}`
                        ]),
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

    // Add Program Analytics
    docDefinition.content.push(
        { text: 'Аналитика по программам', style: 'sectionHeader', pageBreak: 'before', margin: [0, 0, 0, 10] },
        {
            table: {
                widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                body: [
                    ['Программа', 'Участников (акт.)', 'План ($)', 'Факт ($)', 'Факт (TJS)', 'Выполнение'],
                    ...reportData.program_analytics.map((p: any) => [
                        p.program_name,
                        p.active_participants.toString(),
                        `$${p.plan_income.toLocaleString()}`,
                        `$${p.fact_income.toLocaleString()}`,
                        p.fact_income_tjs > 0 ? `${p.fact_income_tjs.toLocaleString()} TJS` : '—',
                        p.plan_income > 0 ? `${((p.fact_income / p.plan_income) * 100).toFixed(1)}%` : '0%'
                    ])
                ]
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 20]
        }
    )

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

export function exportOpiuToExcel(reportData: any) {
    if (!reportData) return

    const wb = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
        ['Отчет ОПиУ'],
        [`${reportData.period.month_name} ${reportData.period.year}`],
        [],
        ['Общая статистика'],
        ['Показатель', 'Значение', 'Сомони (TJS)'],
        ['Сальдо на начало', reportData.summary.opening_balance_usd, reportData.summary.opening_balance_tjs || 0],
        ['Сальдо на конец', reportData.summary.closing_balance_usd, reportData.summary.closing_balance_tjs || 0],
        ['Всего участников', reportData.summary.total_participants, ''],
        ['Активных участников', reportData.summary.active_participants, ''],
        ['Завершивших программу', reportData.summary.completed_participants, ''],
        ['План по доходам', reportData.summary.plan_income, ''],
        ['Факт по доходам', reportData.summary.fact_income, reportData.summary.fact_income_tjs || 0],
        ['Всего расходов', reportData.summary.total_expenses, reportData.summary.total_expenses_tjs || 0],
        ['Процент выполнения', `${reportData.summary.completion_rate.toFixed(1)}%`, ''],
        ['Оплачено полностью', reportData.summary.paid_count, ''],
        ['Частичная оплата', reportData.summary.partial_count, ''],
        ['Просрочено', reportData.summary.overdue_count, '']
    ]

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Общая статистика')

    // Account Balances sheet
    const accountsData = [
        ['Остатки на счетах (Сальдо)'],
        [],
        ['Счет', 'Валюта', 'На начало', 'Приход', 'Расход', 'На конец']
    ]

    reportData.summary.account_balances.forEach((acc: any) => {
        accountsData.push([
            acc.name,
            acc.currency,
            acc.currency === 'TJS' ? `${acc.opening_balance.toLocaleString()} TJS` : `$${acc.opening_balance.toLocaleString()}`,
            acc.currency === 'TJS' ? `${acc.fact_income.toLocaleString()} TJS` : `$${acc.fact_income.toLocaleString()}`,
            acc.currency === 'TJS' ? `${acc.total_expenses.toLocaleString()} TJS` : `$${acc.total_expenses.toLocaleString()}`,
            acc.currency === 'TJS' ? `${acc.closing_balance.toLocaleString()} TJS` : `$${acc.closing_balance.toLocaleString()}`
        ])
    })

    const wsAccounts = XLSX.utils.aoa_to_sheet(accountsData)
    XLSX.utils.book_append_sheet(wb, wsAccounts, 'Счета')

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

    // Program Analytics sheet
    const programData = [
        ['Аналитика по программам'],
        [],
        ['Программа', 'Всего участников', 'Активных', 'План ($)', 'Факт ($)', 'Факт (TJS)', 'Выполнение']
    ]

    reportData.program_analytics.forEach((p: any) => {
        programData.push([
            p.program_name,
            p.total_participants,
            p.active_participants,
            p.plan_income,
            p.fact_income,
            p.fact_income_tjs,
            p.plan_income > 0 ? `${((p.fact_income / p.plan_income) * 100).toFixed(1)}%` : '0%'
        ])
    })
    const ws4 = XLSX.utils.aoa_to_sheet(programData)
    XLSX.utils.book_append_sheet(wb, ws4, 'Программы')

    XLSX.writeFile(wb, `opiu-report-${reportData.period.month}-${reportData.period.year}.xlsx`)
}
