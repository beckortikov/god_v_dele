import { NextResponse } from 'next/server'
import { loadEventMoney, MONEY_MIGRATION } from '@/lib/event-money-server'

/** The event's suppliers (contract, paid, left), loans (taken, repaid, owed) and accounts to pay from. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const res = await loadEventMoney(id)
        if ('missing' in res) {
            if (res.missing) return NextResponse.json(MONEY_MIGRATION, { status: 503 })
            throw res.error
        }
        return NextResponse.json(res)
    } catch (error: any) {
        console.error('Error loading event money:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
