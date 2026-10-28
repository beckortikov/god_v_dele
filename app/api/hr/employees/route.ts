import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { personName, roundMoneyFields } from '@/lib/audit-labels';
import { isEmployeeAccountRole } from '@/lib/access';
import { AccountError, assertLoginFree, insertAccount, validateCredentials } from '@/app/api/_lib/accounts';

export async function GET() {
    try {
        const { data, error } = await db
            .from('employees')
            .select('*')
            .order('first_name', { ascending: true });

        if (error) {
            console.error('Error fetching employees:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST { …employee fields, account?: { username, password, role } }
 * With `account` the employee also gets a sign-in with that role. If the
 * account cannot be created the employee is not left behind.
 */
export async function POST(request: Request) {
    try {
        const { account, ...fields } = await request.json();
        const body = roundMoneyFields(fields);

        // Check the sign-in first, so a taken login does not leave half the work done
        let creds: { username: string; password: string } | null = null;
        if (account) {
            creds = validateCredentials(account);
            if (!isEmployeeAccountRole(account.role)) throw new AccountError('Выберите, какой доступ получит сотрудник');
            await assertLoginFree(creds.username);
        }

        const { data, error } = await db
            .from('employees')
            .insert([body])
            .select()
            .single();

        if (error) {
            console.error('Error creating employee:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let created: { username: string; role: string } | null = null;
        if (creds) {
            try {
                const user = await insertAccount(request, {
                    ...creds,
                    role: account.role,
                    full_name: personName(data),
                    employee_id: data.id,
                });
                created = { username: user.username, role: user.role };
            } catch (e) {
                await db.from('employees').delete().eq('id', data.id);
                throw e;
            }
        }

        await logAudit(request, {
            table: 'employees',
            recordId: data.id,
            action: 'create',
            summary: `Сотрудник «${personName(data)}»${data.position ? `, ${data.position}` : ''}`,
            after: data,
        });

        return NextResponse.json({ ...data, account: created });
    } catch (error) {
        if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
