import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function GET(request: Request) {
    try {
        const { data, error } = await supabaseAdmin
            .from('app_users')
            .select(`
                *,
                employee:employees (
                    id,
                    first_name,
                    last_name,
                    position
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password, role, full_name, employee_id } = body;

        // Basic validation
        if (!username || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const insertData: any = { username, password, role, full_name };
        if (employee_id) insertData.employee_id = employee_id;

        const { data, error } = await supabaseAdmin
            .from('app_users')
            .insert([insertData])
            .select()
            .single();

        if (error) {
            console.error('Error creating user:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
