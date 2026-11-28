import { parseMoney } from '@/lib/event-money'
import { accountById } from '@/lib/event-money-server'

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/**
 * Loan fields from a request body, or an error text. A loan comes from a «Год в деле» account
 * (in that account's currency) or from a person / company (a name is needed).
 */
export async function loanFields(body: Record<string, any>): Promise<{ fields: Record<string, unknown> } | { error: string }> {
    const source = body.source === 'account' ? 'account' : body.source === 'person' ? 'person' : null
    if (!source) return { error: 'Откуда займ: счёт «Год в деле» или человек' }
    const m = parseMoney(body)
    if ('error' in m) return { error: m.error }
    const f: Record<string, unknown> = { source, ...m, account_id: null, lender_name: null }
    if (source === 'account') {
        const acc = body.account_id ? await accountById(String(body.account_id)) : null
        if (!acc) return { error: 'Выберите счёт «Год в деле»' }
        if ((acc.currency === 'TJS' ? 'TJS' : 'USD') !== m.currency) return { error: `Счёт «${acc.name}» в ${acc.currency}: займ должен быть в той же валюте` }
        f.account_id = acc.id
    } else {
        const name = typeof body.lender_name === 'string' ? body.lender_name.trim() : ''
        if (!name) return { error: 'У кого взяли: имя или компания' }
        f.lender_name = name.slice(0, 200)
    }
    f.received_on = date(body.received_on) ?? new Date().toISOString().slice(0, 10)
    f.due_on = date(body.due_on)
    f.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null
    return { fields: f }
}
