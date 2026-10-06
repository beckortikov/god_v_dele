import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';
import { fetchRow, logAudit } from '@/lib/audit';
import { SHIFT_LABELS, changeSuffix } from '@/lib/audit-labels';
import { formatDate } from '@/lib/format';
import { employeeName } from '@/app/api/audit/_server';

async function scheduleSummary(row: any) {
    const name = await employeeName(row?.employee_id);
    return `График: ${name || 'сотрудник'} — ${SHIFT_LABELS[row?.shift_type] ?? row?.shift_type ?? '—'}, ${formatDate(row?.work_date)}`;
}

// UPDATE - Update schedule record (e.g. change type)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const body = await request.json();
        const { id } = await params;
        const before = await fetchRow('employee_schedules', id);

        const { data, error } = await supabaseAdmin
            .from('employee_schedules')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating schedule:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data) {
            await logAudit(request, {
                table: 'employee_schedules',
                recordId: id,
                action: 'update',
                summary: `${await scheduleSummary(data)}${changeSuffix(before, data)}`,
                before,
                after: data,
            });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Remove schedule record
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const before = await fetchRow('employee_schedules', id);

        const { error } = await supabaseAdmin
            .from('employee_schedules')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting schedule:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (before) {
            await logAudit(request, {
                table: 'employee_schedules',
                recordId: id,
                action: 'delete',
                summary: await scheduleSummary(before),
                before,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
