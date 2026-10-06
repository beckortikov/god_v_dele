import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { roundMoney } from '@/lib/money'
import { changeSuffix, monthLabel, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { employeeName } from '@/app/api/audit/_server'

// GET - Fetch expenses with optional filters
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const category = searchParams.get('category')
        const eventId = searchParams.get('event_id')
        const excludeEvents = searchParams.get('exclude_events')
        const onlyEvents = searchParams.get('only_events')

        // When fetching event-linked expenses, join with offline_events for event name
        const selectQuery = onlyEvents === 'true'
            ? '*, offline_events(id, name, event_date, status)'
            : '*'

        let query = supabaseAdmin
            .from('expenses')
            .select(selectQuery)

        if (category) {
            query = query.eq('category', category)
        }
        if (eventId) {
            query = query.eq('event_id', eventId)
        }

        // Filter: only general expenses (no event_id)
        if (excludeEvents === 'true') {
            query = query.is('event_id', null)
        }

        // Filter: only event-linked expenses (has event_id)
        if (onlyEvents === 'true') {
            query = query.not('event_id', 'is', null)
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
        const body = roundMoneyFields(await req.json())

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .insert([body])
            .select()

        if (error) throw error

        const created = data?.[0]
        if (created) {
            await logAudit(req, {
                table: 'expenses',
                recordId: created.id,
                action: 'create',
                summary: `Расход «${created.name}» ${rowMoney(created)}`,
                after: created,
            })
        }

        // HR Integration: If this is a salary payment (has employee_id)
        if (body.employee_id) {
            const expenseDate = new Date(body.expense_date);
            const month = expenseDate.getMonth() + 1;
            const year = expenseDate.getFullYear();

            // 1. Check if payroll record exists
            const { data: payroll, error: payrollError } = await supabaseAdmin
                .from('payroll')
                .select('*')
                .eq('employee_id', body.employee_id)
                .eq('month_number', month)
                .eq('year', year)
                .single();

            const empName = await employeeName(body.employee_id);
            const payrollLabel = `Зарплата: ${empName || 'сотрудник'}, ${monthLabel(month, year)}`;

            // 2. If exists, update to PAID
            if (payroll) {
                const { data: updatedPayroll } = await supabaseAdmin
                    .from('payroll')
                    .update({
                        status: 'paid',
                        total_amount: roundMoney(body.original_amount || body.amount * (body.exchange_rate || 1)), // Use TJS amount if available
                        payment_date: body.expense_date
                    })
                    .eq('id', payroll.id)
                    .select()
                    .maybeSingle();

                if (updatedPayroll) {
                    await logAudit(req, {
                        table: 'payroll',
                        recordId: payroll.id,
                        action: 'update',
                        summary: `${payrollLabel} — выплачено по расходу`,
                        before: payroll,
                        after: updatedPayroll,
                    });
                }
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

                const salaryAmount = roundMoney(body.original_amount || body.amount * (body.exchange_rate || 1)); // Best guess at TJS amount

                const { data: createdPayroll } = await supabaseAdmin
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
                    }])
                    .select()
                    .maybeSingle();

                if (createdPayroll) {
                    await logAudit(req, {
                        table: 'payroll',
                        recordId: createdPayroll.id,
                        action: 'create',
                        summary: `${payrollLabel} — создано по расходу`,
                        after: createdPayroll,
                    });
                }
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
        const { id, ...rawUpdates } = body

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        const updates = roundMoneyFields(rawUpdates)
        const before = await fetchRow('expenses', id)

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .update(updates)
            .eq('id', id)
            .select()

        if (error) throw error

        const after = data?.[0]
        if (after) {
            await logAudit(req, {
                table: 'expenses',
                recordId: id,
                action: 'update',
                summary: `Расход «${after.name}» ${rowMoney(after)}${changeSuffix(before, after)}`,
                before,
                after,
            })
        }

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

        const before = await fetchRow('expenses', id)

        const { error } = await supabaseAdmin
            .from('expenses')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'expenses',
                recordId: id,
                action: 'delete',
                summary: `Расход «${before.name}» ${rowMoney(before)}`,
                before,
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
