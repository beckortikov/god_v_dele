import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        // Fetch event stats
        const { data: eventData, error: eventError } = await supabaseAdmin
            .from('offline_events')
            .select('total_income, total_expenses, balance, attendees_registered, attendees_attended')
            .eq('id', id)
            .single()

        if (eventError) throw eventError

        // Calculate ROI
        const totalIncome = eventData.total_income || 0
        const totalExpenses = eventData.total_expenses || 0
        const balance = eventData.balance || 0
        const roi = totalExpenses > 0 ? (balance / totalExpenses) * 100 : 0

        // Fetch breakdown manually if needed, or query event_attendees aggs
        // For now, let's keep it simple and return what `offline_events` has calculated

        // But requirement says: income_breakdown { guest_payments, other_income }
        // We need to query event_attendees for this detail

        // Fetch expenses breakdown
        const { data: expenses, error: expensesError } = await supabaseAdmin
            .from('expenses')
            .select('amount, category')
            .eq('event_id', id)

        if (expensesError) throw expensesError

        const { data: attendees, error: attendeesError } = await supabaseAdmin
            .from('event_attendees')
            .select('attendee_type, payment_received')
            .eq('event_id', id)

        if (attendeesError) throw attendeesError

        let guestPayments = 0
        let participantsCount = 0
        let guestsCount = 0

        attendees.forEach((a: any) => {
            if (a.attendee_type === 'guest') {
                guestPayments += (a.payment_received || 0)
                guestsCount++
            } else {
                participantsCount++
            }
        })

        // Group expenses by category
        const expenseBreakdown: Record<string, number> = {}
        expenses.forEach((e: any) => {
            expenseBreakdown[e.category] = (expenseBreakdown[e.category] || 0) + (e.amount || 0)
        })

        const summary = {
            total_income: totalIncome,
            total_expenses: totalExpenses,
            balance: balance,
            roi: roi,
            income_breakdown: {
                guest_payments: guestPayments,
                other_income: totalIncome - guestPayments
            },
            expense_breakdown: expenseBreakdown,
            attendee_stats: {
                total_registered: eventData.attendees_registered,
                total_attended: eventData.attendees_attended,
                participants: participantsCount,
                guests: guestsCount
            }
        }

        return NextResponse.json({ data: summary }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching financial summary:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
