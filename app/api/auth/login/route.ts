import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { clientIp, recordFailure, recordSuccess, retryAfterMs } from '@/lib/login-limiter';
import { supabaseAdmin } from '@/lib/supabase-client';
import { fakeVerify, hashPassword, isHashed, verifyPassword } from '@/lib/password';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const login = typeof body?.login === 'string' ? body.login.trim() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!login || !password) {
            return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
        }

        const ip = clientIp(request);
        const wait = retryAfterMs(login, ip);
        if (wait > 0) {
            return NextResponse.json(
                { error: 'Слишком много попыток. Подождите немного и попробуйте снова.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(wait / 1000)) } }
            );
        }

        // Look the account up by login only; the password is checked here, never in the query.
        const { data: candidates, error } = await supabaseAdmin
            .from('app_users')
            .select('*')
            .eq('username', login);

        if (error) {
            console.error('Login lookup failed:', error.message);
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }

        let user: any = null;
        for (const c of candidates ?? []) {
            if (await verifyPassword(password, c.password)) {
                user = c;
                break;
            }
        }

        if (!user) {
            // An unknown login must not answer faster than a wrong password
            if (!candidates?.length) await fakeVerify(password);
            recordFailure(login, ip);
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }
        recordSuccess(login, ip);

        // Plain-text passwords from before hashing are replaced with a hash on the first login
        if (!isHashed(user.password)) {
            await supabaseAdmin.from('app_users').update({ password: await hashPassword(password) }).eq('id', user.id);
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

        const response = NextResponse.json({
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
        response.cookies.set(SESSION_COOKIE, createSessionToken({ ...user, full_name: user.full_name || user.username }), sessionCookieOptions);
        return response;
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
