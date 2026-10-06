import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, monthLabel, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { fetchRowsWhere, logDeletedRows } from '@/app/api/audit/_server'
import { plural } from '@/lib/format'
import { LEDGER_TABLE, ledgerEnabled, ledgerMock } from '@/lib/payments-ledger'
import { receiptsOfMonths, receiptSummary } from '@/app/api/payments/_server'

// GET - Fetch all participants with their program details (optionally one by ?id=)
export async function GET(req: Request) {
    try {
        const id = new URL(req.url).searchParams.get('id')
        let query = supabaseAdmin
            .from('participants')
            .select(`
        *,
        program:programs(*)
      `)
        if (id) query = query.eq('id', id)
        const { data, error } = await query.order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching participants:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create new participant
export async function POST(req: Request) {
    try {
        const body = roundMoneyFields(await req.json())

        const { data, error } = await supabaseAdmin
            .from('participants')
            .insert([body])
            .select(`
        *,
        program:programs(*)
      `)

        if (error) throw error

        if (data?.[0]) {
            const { program, ...after } = data[0] as any
            await logAudit(req, {
                table: 'participants',
                recordId: after.id,
                action: 'create',
                summary: `Участник «${after.name}»${program?.name ? `, ${program.name}` : ''}`,
                after,
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PUT - Update participant
export async function PUT(req: Request) {
    try {
        const body = await req.json()
        const { id, ...rawUpdate } = body

        if (!id) {
            return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 })
        }

        const updateData = roundMoneyFields(rawUpdate)
        const before = await fetchRow('participants', id)

        const { data, error } = await supabaseAdmin
            .from('participants')
            .update(updateData)
            .eq('id', id)
            .select(`
        *,
        program:programs(*)
      `)

        if (error) throw error

        if (data?.[0]) {
            const { program, ...after } = data[0] as any
            await logAudit(req, {
                table: 'participants',
                recordId: id,
                action: 'update',
                summary: `Участник «${after.name}»${changeSuffix(before, after)}`,
                before,
                after,
            })
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Delete participant
export async function DELETE(req: Request) {
    try {
        const body = await req.json()
        const { id } = body

        if (!id) {
            return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 })
        }

        const before = await fetchRow('participants', id)
        // monthly_payments are removed by ON DELETE CASCADE — keep them in the корзина too
        const payments = before ? await fetchRowsWhere('monthly_payments', 'participant_id', id) : []
        // …and so are their receipts (migration 014)
        const receipts =
            payments.length && !ledgerMock(req) && (await ledgerEnabled(req).catch(() => false))
                ? await receiptsOfMonths(payments.map(p => p.id))
                : []

        const { error } = await supabaseAdmin
            .from('participants')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'participants',
                recordId: id,
                action: 'delete',
                summary: `Участник «${before.name}»${payments.length ? ` и ${payments.length} ${plural(payments.length, ['платёж', 'платежа', 'платежей'])}` : ''}`,
                before,
            })
            await logDeletedRows(req, 'monthly_payments', payments, p =>
                `Платёж: ${before.name}, ${monthLabel(p.month_number, p.year)} — ${rowMoney(p, 'fact_amount')} (вместе с участником)`
            )
            const monthOf = new Map(payments.map(p => [p.id, p]))
            await logDeletedRows(req, LEDGER_TABLE, receipts, tx => {
                const m = monthOf.get(tx.monthly_payment_id)
                return `${receiptSummary(before.name, tx, m?.month_number, m?.year)} (вместе с участником)`
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
