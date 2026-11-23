import { listConversations, instagramAccount } from '@/lib/zernio'
import { contactsFor, igRoute, ok } from '../_lib'

export const dynamic = 'force-dynamic'

/** GET ?cursor= → direct conversations, newest first, each with its CRM card. */
export async function GET(req: Request) {
  return igRoute(req, 'listing conversations', async () => {
    const cursor = new URL(req.url).searchParams.get('cursor')
    const [account, page] = await Promise.all([instagramAccount(), listConversations(cursor)])
    const cards = await contactsFor(page.items.map(c => c.participantId))
    return ok({
      account: account && { username: account.username, name: account.displayName ?? account.username, picture: account.picture, active: account.active },
      items: page.items.map(c => ({ ...c, contact: cards.get(c.participantId) ?? null })),
      nextCursor: page.nextCursor,
    })
  })
}
