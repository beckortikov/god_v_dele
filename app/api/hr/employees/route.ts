import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
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

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Basic validation could go here

        const { data, error } = await supabaseAdmin
            .from('employees')
            .insert([body])
            .select()
            .single();

        if (error) {
            console.error('Error creating employee:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
