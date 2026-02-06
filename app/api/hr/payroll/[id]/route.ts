import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Update payroll record
        const { data: updatedPayroll, error: updateError } = await supabaseAdmin
            .from('payroll')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating payroll:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Logic Note: Expense creation is now handled by Finance API.
        // We do typically NOT trigger it here to avoid circular logic.
        // However, if we need to sync status changes initiated here (like 'cancelled'), we could.
        // But per plan, we keep it simple: HR reflects Finance.
        // Status updates manually in HR are allowed (e.g. correct a mistake).

        return NextResponse.json(updatedPayroll);

    } catch (error: any) {
        console.error('Unexpected error in PUT:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Fetch payroll details BEFORE deletion to identify the expense
        const { data: payroll, error: fetchError } = await supabaseAdmin
            .from('payroll')
            .select(`
                *,
                employees (
                    first_name,
                    last_name
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError || !payroll) {
            return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 });
        }

        // 2. Delete payroll record
        const { error: deleteError } = await supabaseAdmin
            .from('payroll')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Error deleting payroll:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        // 3. Try to delete linked Expense
        if (payroll.employees) {
            const empName = `Зарплата: ${payroll.employees.first_name} ${payroll.employees.last_name}`;

            // Calculate date range for the payroll month
            const year = payroll.year;
            const month = payroll.month_number;
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            // simplistic end date calc
            let endMonth = month + 1;
            let endYear = year;
            if (endMonth > 12) { endMonth = 1; endYear++; }
            const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

            // Find expenses with matching name in that month
            const { data: expensesToDelete } = await supabaseAdmin
                .from('expenses')
                .select('id, name, expense_date')
                .eq('name', empName)
                .gte('expense_date', startDate)
                .lt('expense_date', endDate);

            if (expensesToDelete && expensesToDelete.length > 0) {
                const expenseIds = expensesToDelete.map(e => e.id);
                const { error: expenseDelError } = await supabaseAdmin
                    .from('expenses')
                    .delete()
                    .in('id', expenseIds);

                if (expenseDelError) {
                    console.error('Failed to delete linked expenses:', expenseDelError);
                } else {
                    console.log(`Deleted ${expensesToDelete.length} linked expenses for payroll ${id}`);
                }
            } else if (payroll.payment_date) {
                // Fallback specific date match
                const { error: dateDelError } = await supabaseAdmin
                    .from('expenses')
                    .delete()
                    .eq('expense_date', payroll.payment_date)
                    .eq('name', empName);

                if (dateDelError) console.error('Failed to delete linked expenses (fallback):', dateDelError);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Unexpected error in DELETE:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
