import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';
import { logAudit } from '@/lib/audit';
import { employeeName } from '@/app/api/audit/_server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employee_id');
        const date = searchParams.get('date');

        if (!employeeId) {
            return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
        }

        let query = supabaseAdmin
            .from('time_logs')
            .select('*')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false });

        if (date) {
            query = query.eq('work_date', date);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employee_id, action, notes } = body; // action: 'start' | 'end'

        if (!employee_id || !action) {
            return NextResponse.json({ error: 'employee_id and action are required' }, { status: 400 });
        }

        if (action === 'start') {
            const { data, error } = await supabaseAdmin
                .from('time_logs')
                .insert([{ employee_id, status: 'active', notes }])
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            // High-volume: compact summary, after-row only
            const name = await employeeName(employee_id);
            await logAudit(request, { table: 'time_logs', recordId: data?.id, action: 'create', summary: `Начало работы: ${name || 'сотрудник'}`, after: data });
            return NextResponse.json(data);
        }
        else if (action === 'end') {
            // Find active log
            const { data: activeLogs, error: logError } = await supabaseAdmin
                .from('time_logs')
                .select('*')
                .eq('employee_id', employee_id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1);

            if (logError || !activeLogs || activeLogs.length === 0) {
                return NextResponse.json({ error: 'No active timer found' }, { status: 404 });
            }

            const activeLog = activeLogs[0];
            const startTime = new Date(activeLog.start_time);
            const endTime = new Date();
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            const { data, error } = await supabaseAdmin
                .from('time_logs')
                .update({ end_time: endTime.toISOString(), duration_minutes: durationMinutes, status: 'completed' })
                .eq('id', activeLog.id)
                .select()
                .single();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            const name = await employeeName(employee_id);
            const h = Math.floor(durationMinutes / 60);
            const m = durationMinutes % 60;
            await logAudit(request, {
                table: 'time_logs',
                recordId: activeLog.id,
                action: 'update',
                summary: `Конец работы: ${name || 'сотрудник'}, ${h ? `${h} ч ` : ''}${m} мин`,
                after: data,
            });
            return NextResponse.json(data);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
