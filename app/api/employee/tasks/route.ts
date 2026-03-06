import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const assigneeId = searchParams.get('assignee_id');
        const date = searchParams.get('date');

        let query = supabaseAdmin
            .from('tasks')
            .select('*, target:participants(*)')
            .order('due_date', { ascending: true })
            .order('created_at', { ascending: false });

        if (assigneeId) {
            query = query.eq('assignee_id', assigneeId);
        }

        if (date) {
            query = query.lte('due_date', date);
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
        const { assignee_id, creator_id, title, description, target_participant_id, due_date, task_type } = body;

        if (!assignee_id || !title) {
            return NextResponse.json({ error: 'assignee_id and title are required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
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

        if (!id) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        let updateData: any = { updated_at: new Date().toISOString() };
        if (status) updateData.status = status;
        if (result_comment !== undefined) updateData.result_comment = result_comment;

        const { data, error } = await supabaseAdmin
            .from('tasks')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
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

        const { error } = await supabaseAdmin
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
