
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'
import { MONEY_MIGRATION, moneyMissing, paymentLinks } from '@/lib/event-money-server'

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { data, error } = await db
            .from('expenses')
            .select('*')
            .eq('event_id', id)
            .order('expense_date', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching expenses:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        const expenseData = {
            event_id: id,
            name: body.name,
            amount: body.amount,
            category: body.category,
            expense_date: body.expense_date,
            status: body.status || 'pending',
            currency: body.currency || 'USD',
            original_amount: body.original_amount,
            exchange_rate: body.exchange_rate || 1,
            description: body.description || null
        }

        // Who is paid and where the money comes from (migration 033); old clients send none of these
        if ('supplier_id' in body || 'account_id' in body || 'loan_id' in body) {
            const links = await paymentLinks(id, body, expenseData.currency === 'TJS' ? 'TJS' : 'USD')
            if ('error' in links) return NextResponse.json({ error: links.error }, { status: 400 })
            Object.assign(expenseData, links.fields)
        }

        const { data, error } = await db
            .from('expenses')
            .insert([roundMoneyFields(expenseData)])
            .select()

        if (moneyMissing(error)) return NextResponse.json(MONEY_MIGRATION, { status: 503 })
        if (error) throw error

        if (data?.[0]) {
            const ev = await eventName(id)
            await logAudit(req, {
                table: 'expenses',
                recordId: data[0].id,
                action: 'create',
                summary: `Расход «${data[0].name}» ${rowMoney(data[0])} — мероприятие «${ev || '—'}»`,
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
