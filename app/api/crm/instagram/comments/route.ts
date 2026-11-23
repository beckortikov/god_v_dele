import { listCommentPosts } from '@/lib/zernio'
import { igRoute, ok } from '../_lib'

export const dynamic = 'force-dynamic'

/** GET → posts that have comments; `error` when Instagram refused (e.g. the session expired). */
export async function GET(req: Request) {
  return igRoute(req, 'listing commented posts', async () => {
    const r = await listCommentPosts()
    const expired = r.error && (r.error.code === 'TOKEN_EXPIRED' || /expired|reconnect/i.test(r.error.message))
    return ok({
      data: r.items,
      error: r.error ? { message: expired ? 'Сессия Instagram истекла: переподключите аккаунт' : r.error.message, code: expired ? 'TOKEN_EXPIRED' : r.error.code } : null,
    })
  })
}
