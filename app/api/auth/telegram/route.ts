import { NextResponse } from 'next/server'
import { clientIp } from '@/lib/login-limiter'
import { isTelegramConfigured } from '@/lib/telegram'
import { LOGIN_START_LIMIT, LOGIN_START_WINDOW_MS, LOGIN_TTL_MS, describeDevice, hashSecret, loginDeepLink, newLoginSecret } from '@/lib/telegram-login'
import { generateCode } from '@/lib/telegram'
import { LoginMigrationRequired, createLogin, loginTableExists, recentLoginsFrom } from '../../telegram/_lib/login-store'

export const dynamic = 'force-dynamic'

/** GET -> { enabled }: the bot is set up and migration 021 is applied, so the login page may show «Войти через Telegram». */
export async function GET() {
  try {
    return NextResponse.json({ enabled: isTelegramConfigured() && (await loginTableExists()) })
  } catch (e) {
    console.error('[telegram-login] status:', e)
    return NextResponse.json({ enabled: false })
  }
}

/**
 * POST -> { token, secret, url, expiresAt }: starts a sign-in. The token goes to the bot link, the secret
 * stays in the browser that asked and is required to collect the session (so a link passed to someone else
 * cannot sign in the sender's browser).
 */
export async function POST(req: Request) {
  if (!isTelegramConfigured()) return NextResponse.json({ error: 'Вход через Telegram ещё не подключён' }, { status: 503 })
  try {
    const ip = clientIp(req)
    if ((await recentLoginsFrom(ip, new Date(Date.now() - LOGIN_START_WINDOW_MS))) >= LOGIN_START_LIMIT) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите немного и попробуйте снова.' }, { status: 429 })
    }
    const token = generateCode(24)
    const secret = newLoginSecret()
    const expiresAt = new Date(Date.now() + LOGIN_TTL_MS)
    await createLogin({ token, secretHash: hashSecret(secret), ip, device: describeDevice(req.headers.get('user-agent')), expiresAt })
    return NextResponse.json({ token, secret, url: loginDeepLink(token), expiresAt: expiresAt.toISOString() })
  } catch (e) {
    if (e instanceof LoginMigrationRequired) return NextResponse.json({ error: 'Вход через Telegram ещё не подключён' }, { status: 503 })
    console.error('[telegram-login] start:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
