import { NextResponse } from 'next/server'
import { getBotUsername, isTelegramConfigured, sendMessage, toLinkSummary } from '@/lib/telegram'
import {
  errorResponse,
  getActiveLinkBySubject,
  isSupportedSubjectType,
  isUuid,
  listActiveLinks,
  updateLink,
} from '../_lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET ?subject_type=participant&subject_id=<uuid> -> { configured, botUsername, link | null }
 * GET ?subject_type=participant                    -> { configured, links: [...] } (all active links)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const subjectType = searchParams.get('subject_type') || 'participant'
  const subjectId = searchParams.get('subject_id')
  if (!isSupportedSubjectType(subjectType)) {
    return NextResponse.json({ error: 'Unsupported subject_type' }, { status: 400 })
  }

  const configured = isTelegramConfigured()
  const botUsername = getBotUsername()

  try {
    if (subjectId) {
      if (!isUuid(subjectId)) return NextResponse.json({ error: 'subject_id must be a UUID' }, { status: 400 })
      const link = await getActiveLinkBySubject(subjectType, subjectId)
      return NextResponse.json({ configured, botUsername, link: link ? toLinkSummary(link, true) : null })
    }
    const links = await listActiveLinks(subjectType)
    return NextResponse.json({ configured, botUsername, links: links.map(l => toLinkSummary(l)) })
  } catch (e) {
    return errorResponse(e, 'links GET')
  }
}

/** DELETE ?subject_type=participant&subject_id=<uuid>: unlinks and says goodbye in Telegram. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const subjectType = searchParams.get('subject_type') || 'participant'
  const subjectId = searchParams.get('subject_id')
  if (!isSupportedSubjectType(subjectType)) {
    return NextResponse.json({ error: 'Unsupported subject_type' }, { status: 400 })
  }
  if (!isUuid(subjectId)) {
    return NextResponse.json({ error: 'subject_id must be a UUID' }, { status: 400 })
  }

  try {
    const link = await getActiveLinkBySubject(subjectType, subjectId)
    if (!link) return NextResponse.json({ ok: true, unlinked: false })

    await updateLink(link.id, { unlinked_at: new Date().toISOString(), unlink_reason: 'manual' })

    if (isTelegramConfigured()) {
      try {
        await sendMessage(
          link.chat_id,
          'Ваш Telegram отвязан от «Год в деле», уведомления сюда больше не придут. Чтобы подключить их снова, нажмите «Привязать Telegram» в личном кабинете.',
          { reply_markup: { remove_keyboard: true } }
        )
      } catch (e) {
        console.warn('[telegram] goodbye message not sent:', (e as Error).message)
      }
    }
    return NextResponse.json({ ok: true, unlinked: true })
  } catch (e) {
    return errorResponse(e, 'links DELETE')
  }
}
