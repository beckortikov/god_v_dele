import { NextResponse, type NextRequest } from 'next/server'
import { authorize, isPublic, isReadMethod } from '@/lib/auth-policy'
import { getSession } from '@/lib/session'

/**
 * Every /api request passes here first: it needs a valid session cookie and a
 * role that the route is open to (lib/auth-policy.ts), otherwise it is answered
 * with 401 / 403 and never reaches the route.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // A page on another site can make the browser send our cookie; such a request
  // carries an Origin that is not ours. Reads are harmless, writes are refused.
  if (!isReadMethod(request.method) && !isPublic(pathname)) {
    const origin = request.headers.get('origin')
    if (origin) {
      const ours = [request.headers.get('host'), request.headers.get('x-forwarded-host'), request.nextUrl.host]
      let host = ''
      try {
        host = new URL(origin).host
      } catch {
        /* an unparsable Origin is treated as foreign */
      }
      if (!host || !ours.includes(host)) {
        return NextResponse.json({ error: 'Запрос с другого сайта отклонён' }, { status: 403 })
      }
    }
  }

  let session
  try {
    session = getSession(request)
  } catch (e) {
    console.error('[auth] cannot verify sessions:', (e as Error).message)
    return NextResponse.json({ error: 'Сервер настроен неверно' }, { status: 500 })
  }

  const decision = authorize(session, request.method, pathname, searchParams)
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status })
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
