import { NextResponse } from 'next/server'
import { secretMatches } from '@/lib/telegram-login'
import { isValidCode } from '@/lib/telegram'
import { signedInResponse } from '../../_lib/session-response'
import { accountOfParticipant, consumeLogin, getLoginRow } from '../../../telegram/_lib/login-store'

export const dynamic = 'force-dynamic'

/**
 * POST { token, secret } -> { status: 'pending' | 'denied' | 'expired' } until the person confirms in the bot,
 * then the same answer as a password sign-in (and the session cookie), once.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token : ''
    const row = isValidCode(token) ? await getLoginRow(token) : null
    // Unknown token and wrong secret answer the same, so tokens cannot be probed
    if (!row || !secretMatches(body?.secret, row.secret_hash)) return NextResponse.json({ status: 'expired' })

    if (new Date(row.expires_at).getTime() <= Date.now() || row.status === 'used') return NextResponse.json({ status: 'expired' })
    if (row.status === 'denied') return NextResponse.json({ status: 'denied' })
    if (row.status !== 'approved' || !row.approved_participant_id) return NextResponse.json({ status: 'pending' })

    const user = await accountOfParticipant(row.approved_participant_id)
    if (!user) return NextResponse.json({ status: 'expired' })
    // Whoever flips approved -> used first gets the session; a repeated poll gets nothing
    if (!(await consumeLogin(token))) return NextResponse.json({ status: 'expired' })
    return await signedInResponse(user)
  } catch (e) {
    console.error('[telegram-login] poll:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
