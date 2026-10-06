import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, getActor, logAudit } from '@/lib/audit'
import { changeSuffix, monthLabel, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { logDeletedRows, participantName } from '@/app/api/audit/_server'
import { roundMoney } from '@/lib/money'
import { LEDGER_TABLE, ledgerEnabled, ledgerMock, ledgerUnavailable } from '@/lib/payments-ledger'
import { findOrCreateMonth, loadParticipants, planSummary, planUpdate, receiptsOfMonths, receiptSummary } from '@/app/api/payments/_server'

const paymentSummary = (name: string, row: any) =>
    `Платёж: ${name || 'участник'}, ${monthLabel(row?.month_number, row?.year)} — ${rowMoney(row, 'fact_amount')}`

// GET - Fetch monthly payments with optional filters
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const participantId = searchParams.get('participant_id')
        const monthNumber = searchParams.get('month_number')
        const year = searchParams.get('year')
        const status = searchParams.get('status')

        let query = supabaseAdmin
            .from('monthly_payments')
            .select(`
        *,
        participant:participants(*),
        program:programs(*)
      `)

        if (participantId) {
            query = query.eq('participant_id', participantId)
        }
        if (monthNumber) {
            query = query.eq('month_number', monthNumber)
        }
        if (year) {
            query = query.eq('year', year)
        }
        if (status) {
            query = query.eq('status', status)
        }

        const { data, error } = await query.order('year', { ascending: false })
            .order('month_number', { ascending: false })

        if (error) throw error

        // Automatically detect overdue payments
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth() + 1
        const currentYear = currentDate.getFullYear()

        const updatedData = data?.map(payment => {
            // Check if payment is from a past month
            const isPastMonth = payment.year < currentYear ||
                (payment.year === currentYear && payment.month_number < currentMonth)

            // If past month and not fully paid, mark as overdue
            if (isPastMonth && payment.status !== 'paid') {
                const planAmount = payment.plan_amount ?? payment.amount ?? 0
                const factAmount = payment.fact_amount || 0

                if (factAmount < planAmount) {
                    return { ...payment, status: 'overdue' }
                }
            }

            return payment
        })

        return NextResponse.json({ data: updatedData }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching monthly payments:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

const MONTH_SELECT = `
        *,
        participant:participants(*),
        program:programs(*)
      `

/**
 * Ledger mode (migration 014 applied): a POST no longer overwrites the month.
 * It makes sure the month exists (with the posted plan when it is new) and,
 * when fact_amount > 0, ADDS a receipt of that amount. Kept for clients that
 * still post here; new code uses POST /api/payments/transactions.
 */
async function postToLedger(req: Request, body: any) {
    if (ledgerMock(req)) return NextResponse.json(ledgerUnavailable(true), { status: 409 })
    const month = Number(body?.month_number)
    const year = Number(body?.year)
    if (!body?.participant_id || !(month >= 1 && month <= 12) || !year) {
        return NextResponse.json({ error: 'participant_id, month_number и year обязательны' }, { status: 400 })
    }
    const [participant] = await loadParticipants([String(body.participant_id)])
    if (!participant) return NextResponse.json({ error: 'Участник не найден' }, { status: 404 })

    let { row } = await findOrCreateMonth(req, participant, month, year)
    // A brand-new month gets the plan the client sent (the tariff by default)
    if (row && Number(row.fact_amount) === 0 && body.plan_amount != null && roundMoney(body.plan_amount) !== roundMoney(row.plan_amount)) {
        const before = row
        const { data, error } = await supabaseAdmin.from('monthly_payments').update(planUpdate(row, Number(body.plan_amount))).eq('id', row.id).select('*').single()
        if (error) throw error
        row = data
        await logAudit(req, { table: 'monthly_payments', recordId: row.id, action: 'update', summary: `${planSummary(participant.name, row)}${changeSuffix(before, row)}`, before, after: row })
    }

    const fact = roundMoney(body.fact_amount)
    if (fact > 0) {
        const actor = getActor(req)
        const currency = String(body.currency || 'USD').toUpperCase()
        const { data: tx, error } = await supabaseAdmin
            .from(LEDGER_TABLE)
            .insert([{
                monthly_payment_id: row.id,
                participant_id: participant.id,
                program_id: participant.program_id,
                amount_usd: fact,
                original_amount: body.original_amount != null ? roundMoney(body.original_amount) : fact,
                currency,
                exchange_rate: body.exchange_rate != null ? body.exchange_rate : 1,
                paid_date: body.paid_date || new Date().toISOString().slice(0, 10),
                account_id: body.account_id || null,
                notes: body.notes || null,
                created_by: actor.name || actor.id || null,
            }])
            .select('*')
            .single()
        if (error) throw error
        await logAudit(req, { table: LEDGER_TABLE, recordId: tx.id, action: 'create', summary: receiptSummary(participant.name, tx, month, year), after: tx })
    }

    const { data, error } = await supabaseAdmin.from('monthly_payments').select(MONTH_SELECT).eq('id', row.id)
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
}

// POST - Create or update payment record
export async function POST(req: Request) {
    try {
        const body = roundMoneyFields(await req.json())
        if (await ledgerEnabled(req)) return await postToLedger(req, body)

        // Upsert: read the current row first so the журнал records update vs create
        let before: any = null
        if (body?.participant_id && body?.month_number != null && body?.year != null) {
            const { data: existing } = await supabaseAdmin
                .from('monthly_payments')
                .select('*')
                .eq('participant_id', body.participant_id)
                .eq('month_number', body.month_number)
                .eq('year', body.year)
                .maybeSingle()
            before = existing ?? null
        }

        const { data, error } = await supabaseAdmin
            .from('monthly_payments')
            .upsert([body], { onConflict: 'participant_id,month_number,year' })
            .select(`
        *,
        participant:participants(*),
        program:programs(*)
      `)

        if (error) throw error

        const saved = data?.[0]
        if (saved) {
            const { participant, program, ...after } = saved as any
            const summary = paymentSummary(participant?.name ?? '', after)
            await logAudit(req, {
                table: 'monthly_payments',
                recordId: after.id,
                action: before ? 'update' : 'create',
                summary: before ? `${summary}${changeSuffix(before, after)}` : summary,
                before,
                after,
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating/updating payment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}


// DELETE - Remove payment record
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        const before = await fetchRow('monthly_payments', id)
        const name = before ? await participantName(before.participant_id) : ''
        // Receipts are removed by ON DELETE CASCADE — keep them in the корзина too
        const receipts = before && !ledgerMock(req) && (await ledgerEnabled(req).catch(() => false)) ? await receiptsOfMonths([id]) : []

        const { error } = await supabaseAdmin
            .from('monthly_payments')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'monthly_payments',
                recordId: id,
                action: 'delete',
                summary: paymentSummary(name, before),
                before,
            })
            await logDeletedRows(req, LEDGER_TABLE, receipts, tx =>
                `${receiptSummary(name, tx, before.month_number, before.year)} (вместе с месяцем)`
            )
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting payment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}


/**
 * PUT /api/monthly-payments { id, plan_amount } — changes the plan of one month.
 * Received money is not touched; the status follows the new plan. Works with
 * and without the ledger.
 */
export async function PUT(req: Request) {
    try {
        const body = await req.json().catch(() => ({}))
        const id = body?.id
        const plan = Number(body?.plan_amount)
        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })
        if (body?.plan_amount == null || body.plan_amount === '' || !Number.isFinite(plan) || plan < 0) {
            return NextResponse.json({ error: 'Укажите план — сумму не меньше нуля' }, { status: 400 })
        }

        const before = await fetchRow('monthly_payments', id)
        if (!before) return NextResponse.json({ error: 'Месяц не найден — возможно, его удалили' }, { status: 404 })

        const { data, error } = await supabaseAdmin
            .from('monthly_payments')
            .update(planUpdate(before, plan))
            .eq('id', id)
            .select(MONTH_SELECT)
            .single()
        if (error) throw error

        const { participant, program: _program, ...after } = data as any
        await logAudit(req, {
            table: 'monthly_payments',
            recordId: id,
            action: 'update',
            summary: `${planSummary(participant?.name ?? '', after)}${changeSuffix(before, after)}`,
            before,
            after,
        })

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating payment plan:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
