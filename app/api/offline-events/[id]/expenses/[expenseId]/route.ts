
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
    try {
        const { expenseId } = await params
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .update(body)
            .eq('id', expenseId)
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
    try {
        const { expenseId } = await params

        const { error } = await supabaseAdmin
            .from('expenses')
            .delete()
            .eq('id', expenseId)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
