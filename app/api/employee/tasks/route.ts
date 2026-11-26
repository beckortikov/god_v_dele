import { NextResponse } from 'next/server';
import { forbidden, mayUseEmployee, sessionOf } from '@/lib/api-auth'
import { db } from '@/lib/db';
import { fetchRow, logAudit } from '@/lib/audit';
import { changeSuffix } from '@/lib/audit-labels';
import { employeeName } from '@/app/api/audit/_server';
import { parseContactDate } from '@/lib/event-funnel';

/** 1 «Срочно» … 4 «Не срочно»; anything else is not a priority. */
function parsePriority(v: unknown): number | undefined {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : undefined;
}

/** The assignee, whoever set the task, the admin and managers may change it. */
function mayEditTask(request: Request, row: any): boolean {
    if (mayUseEmployee(request, row?.assignee_id)) return true;
    const s = sessionOf(request);
    return !!s && !!row?.creator_id && row.creator_id === s.uid;
}

/** Ids of active employees among the given ones. */
async function activeEmployees(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const { data } = await db.from('employees').select('id, status').in('id', ids);
    return new Set(((data ?? []) as any[]).filter(e => e.status !== 'terminated').map(e => e.id));
}

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
        const { title, description, target_participant_id, due_date, task_type } = body;
        // One person (assignee_id) or several at once (assignee_ids): each gets their own copy
        const ids: string[] = Array.from(new Set(
            (Array.isArray(body.assignee_ids) ? body.assignee_ids : [body.assignee_id]).filter((v: unknown): v is string => typeof v === 'string' && !!v)
        ));
        const priority = body.priority === undefined ? 3 : parsePriority(body.priority);

        if (!ids.length || !title) {
            return NextResponse.json({ error: 'assignee_id and title are required' }, { status: 400 });
        }
        if (priority === undefined) {
            return NextResponse.json({ error: 'Приоритет — число от 1 до 4' }, { status: 400 });
        }
        const session = sessionOf(request);
        if (!session) return forbidden();
        const active = await activeEmployees(ids);
        if (ids.some(id => !active.has(id))) {
            return NextResponse.json({ error: 'Задачу можно поставить только действующему сотруднику' }, { status: 400 });
        }

        const { data, error } = await db
            .from('tasks')
            .insert(ids.map(assignee_id => ({
                assignee_id, creator_id: session.uid, title, description,
                target_participant_id, due_date, task_type, priority, status: 'todo'
            })))
            .select();

        if (error) {
            console.error('Error creating task:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const rows = (data ?? []) as any[];
        for (const row of rows) {
            await logAudit(request, { table: 'tasks', recordId: row.id, action: 'create', summary: await taskSummary(row), after: row });
        }

        return NextResponse.json(Array.isArray(body.assignee_ids) ? rows : rows[0] ?? null);
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
        if ('priority' in body) {
            const priority = parsePriority(body.priority);
            if (priority === undefined) return NextResponse.json({ error: 'Приоритет — число от 1 до 4' }, { status: 400 });
            updateData.priority = priority;
        }

        const before = await fetchRow('tasks', id);
        if (before && !mayEditTask(request, before)) return forbidden();
        if (typeof body.assignee_id === 'string' && body.assignee_id !== before?.assignee_id) {
            if (!(await activeEmployees([body.assignee_id])).has(body.assignee_id)) {
                return NextResponse.json({ error: 'Задачу можно передать только действующему сотруднику' }, { status: 400 });
            }
            updateData.assignee_id = body.assignee_id;
        }

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
        if (before && !mayEditTask(request, before)) return forbidden();

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
