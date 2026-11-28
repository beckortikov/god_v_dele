import { isSupplierKind, parseMoney } from '@/lib/event-money'

/** Supplier fields from a request body, or an error text. `partial` for an update. */
export function supplierFields(body: Record<string, any>, partial: boolean): { fields: Record<string, unknown> } | { error: string } {
    const f: Record<string, unknown> = {}
    if (!partial || 'name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name) return { error: 'Укажите название поставщика' }
        f.name = name.slice(0, 200)
    }
    if (!partial || 'kind' in body) f.kind = isSupplierKind(body.kind) ? body.kind : 'other'
    if (!partial || 'contract_original' in body || 'currency' in body) {
        const m = parseMoney({ currency: body.currency, original_amount: body.contract_original ?? 0, exchange_rate: body.exchange_rate }, { allowZero: true })
        if ('error' in m) return { error: m.error }
        Object.assign(f, { contract_amount: m.amount, contract_currency: m.currency, contract_original: m.original_amount, contract_rate: m.exchange_rate })
    }
    for (const k of ['contact', 'note'] as const) if (!partial || k in body) f[k] = typeof body[k] === 'string' && body[k].trim() ? body[k].trim().slice(0, 1000) : null
    return { fields: f }
}
