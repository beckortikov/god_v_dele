import { NextResponse } from 'next/server';
import { forbidden, mayUseEmployee } from '@/lib/api-auth'
import { db } from '@/lib/db';
import { fetchRow, logAudit } from '@/lib/audit';
import { changeSuffix } from '@/lib/audit-labels';
import { employeeName } from '@/app/api/audit/_server';
import { parseContactDate } from '@/lib/event-funnel';

async function taskSummary(row: any) {
    const name = await employeeName(row?.assignee_id);
    return `Задача «${row?.title ?? ''}»${name ? ` — ${name}` : ''}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const assigneeId = searchParams.get('assignee_id');
        const date = searchParams.get('date');
        // open=1: also the open tasks with a later deadline (the board and «Позже» show them)
        const withUpcoming = searchParams.get('open') === '1';

        const base = () => {
            let q = db
                .from('tasks')
                .select('*, target:participants(*)')
                .order('due_date', { ascending: true })
                .order('created_at', { ascending: false });
            if (assigneeId) q = q.eq('assignee_id', assigneeId);
            return q;
        };

        const { data, error } = date ? await base().lte('due_date', date) : await base();
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        let rows = (data ?? []) as any[];
        if (date && withUpcoming) {
            const later = await base().gt('due_date', date).in('status', ['todo', 'in_progress']);
            if (later.error) return NextResponse.json({ error: later.error.message }, { status: 500 });
            rows = [...rows, ...((later.data ?? []) as any[])];
        }

        return NextResponse.json(rows);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { assignee_id, creator_id, title, description, target_participant_id, due_date, task_type } = body;

        if (!assignee_id || !title) {
            return NextResponse.json({ error: 'assignee_id and title are required' }, { status: 400 });
        }
        if (!mayUseEmployee(request, assignee_id)) return forbidden();

        const { data, error } = await db
            .from('tasks')
            .insert([{
                assignee_id, creator_id, title, description,
                target_participant_id, due_date, task_type, status: 'todo'
            }])
            .select()
            .single();

        if (error) {
            console.error('Supabase error creating task:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data) {
            await logAudit(request, { table: 'tasks', recordId: data.id, action: 'create', summary: await taskSummary(data), after: data });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Internal Server Error creating task:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, status, result_comment } = body;
        const due = 'due_date' in body ? parseContactDate(body.due_date) : undefined;
        if ('due_date' in body && due === undefined) {
            return NextResponse.json({ error: 'Срок в формате ГГГГ-ММ-ДД' }, { status: 400 });
        }

        if (!id) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        let updateData: any = { updated_at: new Date().toISOString() };
        if (status) updateData.status = status;
        if (result_comment !== undefined) updateData.result_comment = result_comment;
        if ('due_date' in body) updateData.due_date = due;

        const before = await fetchRow('tasks', id);
        if (before && !mayUseEmployee(request, before.assignee_id)) return forbidden();

        const { data, error } = await db
            .from('tasks')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data) {
            await logAudit(request, {
                table: 'tasks',
                recordId: id,
                action: 'update',
                summary: `${await taskSummary(data)}${changeSuffix(before, data)}`,
                before,
                after: data,
            });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        const before = await fetchRow('tasks', id);
        if (before && !mayUseEmployee(request, before.assignee_id)) return forbidden();

        const { error } = await db
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (before) {
            await logAudit(request, { table: 'tasks', recordId: id, action: 'delete', summary: await taskSummary(before), before });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
