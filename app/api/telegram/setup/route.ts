import { NextResponse } from 'next/server'
import { TelegramApiError, getBotUsername, getWebhookSecret, isTelegramConfigured, tg } from '@/lib/telegram'
import { tablesExist } from '../_lib/store'

export const dynamic = 'force-dynamic'

interface WebhookInfo {
  url: string
  has_custom_certificate?: boolean
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
  max_connections?: number
  allowed_updates?: string[]
}

interface BotUser {
  id: number
  username?: string
  first_name?: string
}

/** The public origin, also behind the Vercel proxy. */
function publicOrigin(req: Request) {
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')
  return `${proto}://${host}`
}

const webhookPath = '/api/telegram/webhook'

async function migrationStatus() {
  try {
    return await tablesExist()
  } catch (e) {
    console.warn('[telegram] could not check tables:', (e as Error).message)
    return null
  }
}

function telegramError(e: unknown) {
  if (e instanceof TelegramApiError) {
    const status = e.errorCode === 401 || e.errorCode === 404 ? 400 : 502
    return NextResponse.json(
      {
        error: 'telegram_error',
        message:
          e.errorCode === 401 || e.errorCode === 404
            ? 'Telegram не принял токен. Проверьте TELEGRAM_BOT_TOKEN.'
            : `Telegram ответил ошибкой: ${e.description}`,
      },
      { status }
    )
  }
  console.error('[telegram] setup:', e)
  return NextResponse.json({ error: 'telegram_unreachable', message: 'Не удалось связаться с Telegram. Попробуйте ещё раз.' }, { status: 502 })
}

/** GET -> { configured, botUsername, hasSecret, migrationApplied, expectedUrl, webhook, bot } */
export async function GET(req: Request) {
  const expectedUrl = `${publicOrigin(req)}${webhookPath}`
  const base = {
    configured: isTelegramConfigured(),
    botUsername: getBotUsername(),
    hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    hasSecret: Boolean(getWebhookSecret()),
    migrationApplied: await migrationStatus(),
    expectedUrl,
  }
  if (!base.configured) return NextResponse.json({ ...base, webhook: null, bot: null })

  try {
    const [bot, webhook] = await Promise.all([tg<BotUser>('getMe'), tg<WebhookInfo>('getWebhookInfo')])
    return NextResponse.json({
      ...base,
      bot,
      webhook,
      usernameMismatch: !!bot.username && bot.username.toLowerCase() !== base.botUsername?.toLowerCase(),
    })
  } catch (e) {
    return telegramError(e)
  }
}

/** POST: points the bot at <origin>/api/telegram/webhook and sets the commands. */
export async function POST(req: Request) {
  if (!isTelegramConfigured()) return NextResponse.json({ configured: false })
  const secret = getWebhookSecret()
  if (!secret) {
    return NextResponse.json(
      { error: 'secret_missing', message: 'Добавьте переменную TELEGRAM_WEBHOOK_SECRET и перезапустите приложение.' },
      { status: 400 }
    )
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return NextResponse.json(
      { error: 'secret_invalid', message: 'TELEGRAM_WEBHOOK_SECRET может содержать только латиницу, цифры, _ и - (до 256 символов).' },
      { status: 400 }
    )
  }

  const url = `${publicOrigin(req)}${webhookPath}`
  if (!url.startsWith('https://')) {
    return NextResponse.json(
      { error: 'https_required', message: `Telegram принимает только https-адреса, а сейчас ${url}. Нажмите кнопку на опубликованном сайте.` },
      { status: 400 }
    )
  }

  try {
    await tg('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], max_connections: 20 })
    await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Привязать аккаунт' },
        { command: 'stop', description: 'Отписаться от уведомлений' },
      ],
    })
    const webhook = await tg<WebhookInfo>('getWebhookInfo')
    return NextResponse.json({ configured: true, botUsername: getBotUsername(), expectedUrl: url, webhook })
  } catch (e) {
    return telegramError(e)
  }
}
