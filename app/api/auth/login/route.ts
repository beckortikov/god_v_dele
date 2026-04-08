import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { login, password } = body;

        if (!login || !password) {
            return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
        }

        const { data: user, error } = await supabaseAdmin
            .from('app_users')
            .select('*')
            .eq('username', login)
            .eq('password', password) // Validating plaintext password as requested
            .single();

        if (error || !user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        let position = null;
        let employeeName = null;
        if (user.employee_id) {
            const { data: employeeData } = await supabaseAdmin
                .from('employees')
                .select('position, first_name, last_name')
                .eq('id', user.employee_id)
                .single();
            if (employeeData) {
                position = employeeData.position;
                employeeName = `${employeeData.first_name} ${employeeData.last_name}`;
            }
        }

        // Update last login timestamp
        // We don't await this so it doesn't block the login response, 
        // or we await it to ensure it executes. Let's await to be safe against edge functions terminating.
        await supabaseAdmin
            .from('app_users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id);

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                employee_id: user.employee_id,
                employee_name: employeeName,
                position: position,
                participant_id: user.participant_id,
            }
        });
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
