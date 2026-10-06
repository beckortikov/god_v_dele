import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';
import { fetchRow, logAudit } from '@/lib/audit';
import { changeSuffix, stripSecrets } from '@/lib/audit-labels';

// UPDATE - Update user (password, role, etc)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const body = await request.json();
        const { id } = await params;

        const updateData: any = { ...body };
        if (updateData.employee_id === '') {
            updateData.employee_id = null;
        }
        if (updateData.participant_id === '') {
            updateData.participant_id = null;
        }

        const rawBefore = await fetchRow('app_users', id);

        const { data, error } = await supabaseAdmin
            .from('app_users')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating user:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (data) {
            // Passwords never go into the журнал; only the fact that it changed
            const passwordChanged = !!rawBefore && 'password' in updateData && rawBefore.password !== data.password;
            const before = stripSecrets(rawBefore);
            const after = stripSecrets(data);
            const parts = [changeSuffix(before, after).replace(/^: /, ''), passwordChanged ? 'пароль' : ''].filter(Boolean);
            await logAudit(request, {
                table: 'app_users',
                recordId: id,
                action: 'update',
                summary: `Пользователь «${data.username}»${parts.length ? `: ${parts.join(', ')}` : ''}`,
                before,
                after,
            });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Remove user
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const before = stripSecrets(await fetchRow('app_users', id));

        const { error } = await supabaseAdmin
            .from('app_users')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting user:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (before) {
            await logAudit(request, {
                table: 'app_users',
                recordId: id,
                action: 'delete',
                summary: `Пользователь «${before.username}»`,
                before,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
