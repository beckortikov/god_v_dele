import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { isMissingTable } from '@/app/api/account-transfers/shared'
import { ledgerEnabled, loadTransactions } from '@/lib/payments-ledger'
import { loanAccountEffects, type LoanRow, type RepaymentRow } from '@/lib/event-money'
import { moneyMissing } from '@/lib/event-money-server'

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const programId = searchParams.get('program_id')

        let query = db
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
        // Partial payments on (migration 014): every receipt counts on its own
        // account. Otherwise one row per month, exactly as before.
        let payments: { account_id: string | null; original_amount: number | null; fact_amount: number | null; currency: string | null }[] | null
        if (await ledgerEnabled(request)) {
            payments = (await loadTransactions(request))
                .filter(t => t.account_id)
                .map(t => ({ account_id: t.account_id, original_amount: t.original_amount, fact_amount: t.amount_usd, currency: t.currency }))
        } else {
            const { data } = await db.from('monthly_payments').select('account_id, original_amount, fact_amount, currency').not('account_id', 'is', null)
            payments = data
        }
        const { data: expenses } = await db.from('expenses').select('account_id, amount, original_amount, currency').not('account_id', 'is', null)

        // Transfers between accounts (migration 012). If the table is not there yet,
        // balances are computed exactly as before.
        let transfers: { from_account_id: string | null; to_account_id: string | null; amount_from: number; amount_to: number }[] = []
        const { data: transferRows, error: transferError } = await db
            .from('account_transfers')
            .select('from_account_id, to_account_id, amount_from, amount_to')
        if (!transferError) transfers = transferRows || []
        else if (!isMissingTable(transferError)) console.error('Error fetching transfers for balances:', transferError)

        // Event loans (migration 033): a loan from an account takes money out, its repayments bring it
        // back; repaying someone else's loan from an account takes money out. Same currency as the account.
        let loanEffects = new Map<string, { usd: number; original: number }>()
        const [loansRes, repaymentsRes] = await Promise.all([
            db.from('event_loans').select('id, source, account_id, amount, original_amount, currency, exchange_rate'),
            db.from('event_loan_repayments').select('loan_id, account_id, amount, original_amount, currency'),
        ])
        if (!loansRes.error && !repaymentsRes.error) loanEffects = loanAccountEffects(loansRes.data as LoanRow[], repaymentsRes.data as RepaymentRow[])
        else if (!moneyMissing(loansRes.error) && !moneyMissing(repaymentsRes.error)) console.error('Error fetching event loans for balances:', loansRes.error || repaymentsRes.error)

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

            // Transfer amounts are stored in each account's own currency
            transfers.forEach(t => {
                if (t.from_account_id === acc.id) balance -= Number(t.amount_from) || 0
                if (t.to_account_id === acc.id) balance += Number(t.amount_to) || 0
            })

            const loan = loanEffects.get(acc.id)
            if (loan) balance += acc.currency === 'TJS' ? loan.original : loan.usd
            
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

        const { data, error } = await db
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

        await logAudit(request, { table: 'accounts', recordId: data?.id, action: 'create', summary: `Счёт «${name}»`, after: data })

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

        const before = await fetchRow('accounts', id)

        const { data, error } = await db
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

        await logAudit(request, { table: 'accounts', recordId: id, action: 'update', summary: `Счёт «${name}»`, before, after: data })

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

        const before = await fetchRow('accounts', id)

        const { error } = await db
            .from('accounts')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Error deleting account:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        await logAudit(request, {
            table: 'accounts',
            recordId: id,
            action: 'delete',
            summary: before ? `Счёт «${before.name}»` : 'Счёт',
            before,
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Unexpected error deleting account:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
