import { NextResponse } from 'next/server'
import { ledgerEnabled, ledgerMock } from '@/lib/payments-ledger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/payments/ledger → { enabled, preview? }
 * Whether partial payments (migration 014) are on. `preview` is the dev-only
 * read-only mock (see lib/payments-ledger.ts).
 */
export async function GET(req: Request) {
  try {
    return NextResponse.json({ enabled: await ledgerEnabled(req), preview: ledgerMock(req) || undefined })
  } catch (error: any) {
    console.error('Error checking the payments ledger:', error)
    return NextResponse.json({ error: error.message || 'Не удалось проверить режим оплат' }, { status: 500 })
  }
}
