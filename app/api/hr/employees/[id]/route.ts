import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';
import { fetchRow, logAudit } from '@/lib/audit';
import { changeSuffix, monthLabel, personName, roundMoneyFields } from '@/lib/audit-labels';
import { formatMoney } from '@/lib/format';
import { fetchRowsWhere, logDeletedRows } from '@/app/api/audit/_server';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = roundMoneyFields(await request.json());
        const before = await fetchRow('employees', id);

        const { data, error } = await supabaseAdmin
            .from('employees')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating employee:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data) {
            await logAudit(request, {
                table: 'employees',
                recordId: id,
                action: 'update',
                summary: `Сотрудник «${personName(data)}»${changeSuffix(before, data)}`,
                before,
                after: data,
            });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const before = await fetchRow('employees', id);
        // Payroll rows are removed by ON DELETE CASCADE — keep them in the корзина too
        const payroll = before ? await fetchRowsWhere('payroll', 'employee_id', id) : [];

        const { error } = await supabaseAdmin
            .from('employees')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting employee:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (before) {
            const name = personName(before);
            await logAudit(request, { table: 'employees', recordId: id, action: 'delete', summary: `Сотрудник «${name}»`, before });
            await logDeletedRows(request, 'payroll', payroll, p =>
                `Зарплата: ${name}, ${monthLabel(p.month_number, p.year)} — ${formatMoney(p.total_amount, 'TJS')} (вместе с сотрудником)`
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
