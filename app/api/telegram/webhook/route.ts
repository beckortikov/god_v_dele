import { NextResponse, after } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getWebhookSecret, handleUpdate, isTelegramConfigured, sendMessage, type TgUpdate } from '@/lib/telegram'
import { supabaseTelegramStore } from '../_lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function secretMatches(given: string | null, expected: string) {
  if (!given) return false
  // Hash both sides so lengths match and the comparison is constant-time.
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// Telegram redelivers an update when it does not get 200 in time. The handler
// is idempotent anyway; this per-instance memory just skips obvious repeats.
const recentUpdates = new Set<number>()
function seenRecently(updateId: number) {
  if (recentUpdates.has(updateId)) return true
  recentUpdates.add(updateId)
  if (recentUpdates.size > 500) {
    const oldest = recentUpdates.values().next().value
    if (oldest !== undefined) recentUpdates.delete(oldest)
  }
  return false
}

/**
 * Telegram webhook. Checks X-Telegram-Bot-Api-Secret-Token, answers 200 at
 * once and processes the update after the response. Internal errors are
 * logged, never returned to Telegram (otherwise it would retry forever).
 */
export async function POST(req: Request) {
  const secret = getWebhookSecret()
  if (!secret || !secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let update: TgUpdate | null = null
  try {
    update = (await req.json()) as TgUpdate
  } catch {
    console.warn('[telegram] webhook: invalid JSON body')
    return NextResponse.json({ ok: true })
  }

  if (!update || typeof update.update_id !== 'number' || !isTelegramConfigured() || seenRecently(update.update_id)) {
    return NextResponse.json({ ok: true })
  }

  const current = update
  after(async () => {
    try {
      await handleUpdate(current, {
        store: supabaseTelegramStore,
        send: sendMessage,
        log: (message, meta) => console.info(`[telegram] ${message}`, meta ?? ''),
      })
    } catch (e) {
      console.error('[telegram] webhook: failed to handle update', current.update_id, e)
    }
  })

  return NextResponse.json({ ok: true })
}
