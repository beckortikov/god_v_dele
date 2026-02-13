
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
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

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .insert([expenseData])
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
