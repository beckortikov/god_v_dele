import { NextResponse } from 'next/server'
import { attachmentUrl } from '@/lib/zernio'
import { IgRouteError, igRoute } from '../_lib'

export const dynamic = 'force-dynamic'

/** Instagram and Meta CDNs only: the route must not fetch arbitrary addresses for the caller. */
const ALLOWED = [/(^|\.)fbsbx\.com$/, /(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/]
const allowed = (u: string) => {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && ALLOWED.some(r => r.test(url.hostname))
  } catch {
    return false
  }
}

/**
 * The picture or video of a message, through the server (Instagram links expire and the key stays here):
 * ?c=<conversation>&m=<message>&i=<attachment index>, or ?u=<story link> for a reply to a story.
 * HEAD answers only the Content-Type, so the page knows whether to draw a picture or a video.
 */
async function media(req: Request, head: boolean) {
  return igRoute(req, 'loading media', async () => {
    const q = new URL(req.url).searchParams
    let target: string | null = null
    const c = q.get('c')
    const m = q.get('m')
    const i = Number(q.get('i'))
    if (c && m && Number.isInteger(i) && i >= 0) target = await attachmentUrl(c, m, i)
    else if (q.get('u')) target = q.get('u')
    else throw new IgRouteError('Не указано, какое вложение показать')
    if (!target || !allowed(target)) return NextResponse.json({ error: 'Вложение больше недоступно' }, { status: 404 })

    const upstream = await fetch(target, { method: head ? 'HEAD' : 'GET', cache: 'no-store', headers: req.headers.get('range') ? { range: req.headers.get('range')! } : undefined })
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: 'Вложение больше недоступно' }, { status: 404 })
    const headers = new Headers({ 'Cache-Control': 'private, max-age=3600' })
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    return new Response(head ? null : upstream.body, { status: upstream.status, headers })
  })
}

export const GET = (req: Request) => media(req, false)
export const HEAD = (req: Request) => media(req, true)
