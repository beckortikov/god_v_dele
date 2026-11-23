import { listConversations } from '@/lib/zernio'
import { igFunnel } from '@/lib/crm-instagram'
import { allContacts, igRoute, ok } from '../_lib'

export const dynamic = 'force-dynamic'

/** GET → the Instagram funnel: everyone who wrote in direct (up to 500) plus everyone with a CRM card. */
export async function GET(req: Request) {
  return igRoute(req, 'instagram funnel', async () => {
    const ids = new Set<string>()
    let cursor: string | null = null
    for (let page = 0; page < 5; page++) {
      const r = await listConversations(cursor)
      r.items.forEach(c => ids.add(c.participantId))
      cursor = r.nextCursor
      if (!cursor) break
    }
    const cards = new Map((await allContacts()).map(c => [c.ig_user_id, c]))
    cards.forEach((_, id) => ids.add(id))
    const people = [...ids].map(id => ({ stage: cards.get(id)?.stage ?? 'new', inBase: !!cards.get(id)?.participant_id }))
    return ok(igFunnel(people))
  })
}
