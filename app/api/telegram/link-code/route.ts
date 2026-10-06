import { NextResponse } from 'next/server'
import { getActor } from '@/lib/audit'
import { LINK_CODE_TTL_DAYS, buildDeepLink, generateCode, isTelegramConfigured } from '@/lib/telegram'
import { errorResponse, getOrCreateCode, getSubject, isSupportedSubjectType, isUuid } from '../_lib/store'

export const dynamic = 'force-dynamic'

/**
 * POST { subjectType: 'participant', subjectId } -> { configured, code, url, expiresAt }.
 * Reuses an unused code that is still valid for at least a day.
 */
export async function POST(req: Request) {
  let body: { subjectType?: unknown; subjectId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const subjectType = body.subjectType ?? 'participant'
  const subjectId = body.subjectId

  if (!isSupportedSubjectType(subjectType)) {
    return NextResponse.json({ error: 'Unsupported subjectType' }, { status: 400 })
  }
  if (!isUuid(subjectId)) {
    return NextResponse.json({ error: 'subjectId must be a UUID' }, { status: 400 })
  }
  if (!isTelegramConfigured()) {
    return NextResponse.json({ configured: false })
  }

  try {
    const subject = await getSubject(subjectType, subjectId)
    if (!subject) return NextResponse.json({ error: 'Участник не найден' }, { status: 404 })

    const actor = getActor(req)
    const row = await getOrCreateCode(subjectType, subjectId, actor.name || actor.id, generateCode, LINK_CODE_TTL_DAYS)
    return NextResponse.json({
      configured: true,
      code: row.code,
      url: buildDeepLink(row.code),
      expiresAt: row.expires_at,
    })
  } catch (e) {
    return errorResponse(e, 'link-code')
  }
}
