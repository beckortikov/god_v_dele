import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

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

        const { data, error } = await supabaseAdmin
            .from('employee_schedules')
            .upsert(records, { onConflict: 'employee_id, work_date' })
            .select();

        if (error) {
            console.error('Error saving schedules:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
