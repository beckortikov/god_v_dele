import { NextResponse } from 'next/server';
import { clientIp, recordFailure, recordSuccess, retryAfterMs } from '@/lib/login-limiter';
import { supabaseAdmin } from '@/lib/supabase-client';
import { signedInResponse } from '../_lib/session-response';
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

        return await signedInResponse(user);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
