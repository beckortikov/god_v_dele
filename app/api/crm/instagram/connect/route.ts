import { reconnectUrl } from '@/lib/zernio'
import { igRoute, ok } from '../_lib'

/** GET → { url }: the Instagram login that reconnects the account and comes back to the CRM. */
export async function GET(req: Request) {
  return igRoute(req, 'reconnect url', async () => {
    const back = `${new URL(req.url).origin}/?page=instagram&connected=1`
    return ok({ url: await reconnectUrl(back) })
  })
}
