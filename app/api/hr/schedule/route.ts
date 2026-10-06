import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';
import { logAudit } from '@/lib/audit';
import { SHIFT_LABELS, changeSuffix } from '@/lib/audit-labels';
import { formatDate, plural } from '@/lib/format';
import { employeeName } from '@/app/api/audit/_server';

const pairKey = (r: any) => `${r?.employee_id}|${r?.work_date}`;
const shortDay = (d: string) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');

/** Current rows for the (employee, date) pairs about to be upserted. Never throws. */
async function existingSchedules(records: any[]): Promise<any[]> {
    try {
        const empIds = [...new Set(records.map(r => r?.employee_id).filter(Boolean))];
        const dates = [...new Set(records.map(r => r?.work_date).filter(Boolean))];
        if (!empIds.length || !dates.length) return [];
        const { data } = await supabaseAdmin
            .from('employee_schedules')
            .select('*')
            .in('employee_id', empIds)
            .in('work_date', dates);
        const keys = new Set(records.map(pairKey));
        return (data ?? []).filter(r => keys.has(pairKey(r)));
    } catch {
        return [];
    }
}

/** One entry per save: a single day is logged with before/after, a range as one compact entry. */
async function logScheduleSave(request: Request, saved: any[], before: any[]) {
    const names = await Promise.all([...new Set(saved.map(r => r.employee_id))].map(employeeName));
    const who = names.filter(Boolean).join(', ') || 'сотрудник';
    const shifts = [...new Set(saved.map(r => SHIFT_LABELS[r.shift_type] ?? r.shift_type))].join(', ');

    if (saved.length === 1) {
        const row = saved[0];
        const prev = before.find(b => b.id === row.id || pairKey(b) === pairKey(row)) ?? null;
        const summary = `График: ${who} — ${shifts}, ${formatDate(row.work_date)}`;
        await logAudit(request, {
            table: 'employee_schedules',
            recordId: row.id,
            action: prev ? 'update' : 'create',
            summary: prev ? `${summary}${changeSuffix(prev, row)}` : summary,
            before: prev,
            after: row,
        });
        return;
    }

    const dates = saved.map(r => r.work_date).filter(Boolean).sort();
    await logAudit(request, {
        table: 'employee_schedules',
        recordId: null,
        action: before.length ? 'update' : 'create',
        summary: `График: ${who} — ${shifts}, ${saved.length} ${plural(saved.length, ['день', 'дня', 'дней'])} (${shortDay(dates[0])}–${shortDay(dates[dates.length - 1])})`,
        before: before.length ? before : null,
        after: saved,
    });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const start_date = searchParams.get('start_date');
        const end_date = searchParams.get('end_date');
        const employee_id = searchParams.get('employee_id');

        let query = supabaseAdmin
            .from('employee_schedules')
            .select(`
        *,
        employees (
          first_name,
          last_name,
          position
        )
      `)
            .order('work_date', { ascending: true });

        if (start_date) {
            query = query.gte('work_date', start_date);
        }
        if (end_date) {
            query = query.lte('work_date', end_date);
        }
        if (employee_id) {
            query = query.eq('employee_id', employee_id);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching schedules:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Expecting body to be a single object or an array of schedule items
        const records = Array.isArray(body) ? body : [body];
        const before = await existingSchedules(records);

        const { data, error } = await supabaseAdmin
            .from('employee_schedules')
            .upsert(records, { onConflict: 'employee_id, work_date' })
            .select();

        if (error) {
            console.error('Error saving schedules:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data?.length) await logScheduleSave(request, data, before);

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
