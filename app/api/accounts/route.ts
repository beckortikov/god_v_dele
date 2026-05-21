import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const programId = searchParams.get('program_id')

        let query = supabaseAdmin
            .from('accounts')
            .select('*, program:programs(name)')
            .order('created_at', { ascending: true })

        if (programId && programId !== 'all') {
            // Include both program-specific accounts and global accounts
            query = query.or(`program_id.eq.${programId},program_id.is.null`)
        }

        const { data: accounts, error } = await query

        if (error) {
            console.error('Error fetching accounts:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        
        // Fetch incomes and expenses to calculate balances
        const { data: payments } = await supabaseAdmin.from('monthly_payments').select('account_id, original_amount, fact_amount, currency').not('account_id', 'is', null)
        const { data: expenses } = await supabaseAdmin.from('expenses').select('account_id, amount, original_amount, currency').not('account_id', 'is', null)

        const accountsWithBalances = accounts.map(acc => {
            let balance = Number(acc.initial_balance) || 0;
            
            payments?.forEach(p => {
                if (p.account_id === acc.id) {
                    // fact_amount is usually in USD, original_amount is in the currency specified
                    // If account is TJS, we add original_amount. Otherwise, fact_amount (USD).
                    balance += (acc.currency === 'TJS' ? (p.original_amount || 0) : (p.fact_amount || 0))
                }
            })
            
            expenses?.forEach(e => {
                if (e.account_id === acc.id) {
                    balance -= (acc.currency === 'TJS' ? (e.original_amount || 0) : (e.amount || 0))
                }
            })
            
            return {
                ...acc,
                balance
            }
        })

        return NextResponse.json(accountsWithBalances)
    } catch (error) {
        console.error('Unexpected error fetching accounts:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, currency, program_id, is_default, initial_balance } = body

        if (!name || !currency) {
            return NextResponse.json({ error: 'Name and currency are required' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('accounts')
            .insert([{ 
                name, 
                currency, 
                program_id: program_id || null, 
                is_default: is_default || false,
                initial_balance: initial_balance || 0
            }])
            .select()
            .single()

        if (error) {
            console.error('Error creating account:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error('Unexpected error creating account:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json()
        const { id, name, currency, program_id, is_default, initial_balance } = body

        if (!id || !name || !currency) {
            return NextResponse.json({ error: 'ID, name and currency are required' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('accounts')
            .update({ 
                name, 
                currency, 
                program_id: program_id || null, 
                is_default: is_default || false,
                initial_balance: initial_balance || 0
            })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            console.error('Error updating account:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error('Unexpected error updating account:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('accounts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting account:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Unexpected error deleting account:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
