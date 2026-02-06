import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch expenses with optional filters
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const category = searchParams.get('category')
        const eventId = searchParams.get('event_id')

        let query = supabaseAdmin
            .from('expenses')
            .select('*')

        if (category) {
            query = query.eq('category', category)
        }
        if (eventId) {
            query = query.eq('event_id', eventId)
        }

        const { data, error } = await query.order('expense_date', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching expenses:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create new expense
export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .insert([body])
            .select()

        if (error) throw error

        // HR Integration: If this is a salary payment (has employee_id)
        if (body.employee_id) {
            const expenseDate = new Date(body.expense_date);
            const month = expenseDate.getMonth() + 1;
            const year = expenseDate.getFullYear();

            // 1. Check if payroll record exists
            const { data: payroll, error: payrollError } = await supabaseAdmin
                .from('payroll')
                .select('id')
                .eq('employee_id', body.employee_id)
                .eq('month_number', month)
                .eq('year', year)
                .single();

            // 2. If exists, update to PAID
            if (payroll) {
                await supabaseAdmin
                    .from('payroll')
                    .update({
                        status: 'paid',
                        total_amount: body.original_amount || body.amount * (body.exchange_rate || 1), // Use TJS amount if available
                        payment_date: body.expense_date
                    })
                    .eq('id', payroll.id);
            }
            // 3. If not exists, CREATE as PAID
            else {
                // Fetch employee base salary first? Or just trust the expense amount?
                // Ideally, we should fetch base salary.
                const { data: employee } = await supabaseAdmin
                    .from('employees')
                    .select('base_salary')
                    .eq('id', body.employee_id)
                    .single();

                const salaryAmount = body.original_amount || body.amount * (body.exchange_rate || 1); // Best guess at TJS amount

                await supabaseAdmin
                    .from('payroll')
                    .insert([{
                        employee_id: body.employee_id,
                        month_number: month,
                        year: year,
                        base_salary: employee?.base_salary || salaryAmount,
                        bonus_amount: 0,
                        deduction_amount: 0,
                        total_amount: salaryAmount,
                        status: 'paid',
                        payment_date: body.expense_date
                    }]);
            }
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PUT - Update expense
export async function PUT(req: Request) {
    try {
        const body = await req.json()
        const { id, ...updates } = body

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .update(updates)
            .eq('id', id)
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Delete expense
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        const { error } = await supabaseAdmin
            .from('expenses')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
