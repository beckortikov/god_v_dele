/**
 * Server side of the CRM's Instagram: the guard and error answer for every route, and the
 * CRM cards of Instagram people (crm_instagram_contacts, migration 029).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { crmGuard } from '@/lib/crm-access'
import { ZernioError } from '@/lib/zernio'
import { IG_NOTE_MAX, isIgStage, stageAfterReply, type IgContact, type IgStage } from '@/lib/crm-instagram'

const TABLE = 'crm_instagram_contacts'

export const MIGRATION_029 = 'Примените миграцию migrations/029_crm_instagram.sql'

type Err = { code?: string; message?: string } | null
export const tableMissing = (e: Err) => !!e && (e.code === '42P01' || /crm_instagram_contacts/.test(e.message ?? ''))

export class IgRouteError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

/** CRM access check, then the handler; Zernio and input errors become readable answers. */
export async function igRoute(req: Request, label: string, fn: () => Promise<Response>) {
  const denied = await crmGuard(req)
  if (denied) return denied
  try {
    return await fn()
  } catch (e) {
    if (e instanceof IgRouteError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof ZernioError) {
      const expired = e.code === 'TOKEN_EXPIRED' || /expired|reconnect/i.test(e.message)
      return NextResponse.json(
        { error: expired ? 'Сессия Instagram истекла: переподключите аккаунт' : e.message, code: expired ? 'TOKEN_EXPIRED' : e.code },
        { status: e.status >= 500 ? 502 : e.status }
      )
    }
    console.error(`[crm instagram] ${label}:`, e)
    return NextResponse.json({ error: (e as Error).message || 'Ошибка' }, { status: 500 })
  }
}

export const readText = (v: unknown, max = IG_NOTE_MAX) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Cards by Instagram user id, with the linked participant's name. Empty before migration 029. */
export async function contactsFor(ids: string[]): Promise<Map<string, IgContact>> {
  const out = new Map<string, IgContact>()
  if (!ids.length) return out
  const { data, error } = await db.from(TABLE).select('ig_user_id, stage, note, participant_id, participant:participants(name)').in('ig_user_id', ids)
  if (tableMissing(error)) return out
  if (error) throw error
  for (const r of data as any[]) {
    out.set(r.ig_user_id, { ig_user_id: r.ig_user_id, stage: r.stage, note: r.note, participant_id: r.participant_id, participant_name: r.participant?.name ?? null })
  }
  return out
}

export async function allContacts(): Promise<{ ig_user_id: string; stage: IgStage; participant_id: string | null }[]> {
  const { data, error } = await db.from(TABLE).select('ig_user_id, stage, participant_id')
  if (tableMissing(error)) return []
  if (error) throw error
  return data as any[]
}

export interface Who {
  username?: string | null
  name?: string | null
  picture?: string | null
  source?: 'dm' | 'comment'
}

/** Creates the card on first use, then applies `patch`. Returns the saved card. */
export async function upsertContact(igUserId: string, who: Who, patch: Partial<{ stage: IgStage; note: string | null; participant_id: string | null }>) {
  if (!igUserId) throw new IgRouteError('Нет id пользователя Instagram')
  if (patch.stage !== undefined && !isIgStage(patch.stage)) throw new IgRouteError('Неизвестный этап')
  const { data: existing, error } = await db.from(TABLE).select('id').eq('ig_user_id', igUserId).maybeSingle()
  if (tableMissing(error)) throw new IgRouteError(MIGRATION_029, 503)
  if (error) throw error
  const profile = {
    ...(who.username ? { username: who.username } : {}),
    ...(who.name ? { name: who.name } : {}),
    ...(who.picture ? { picture: who.picture } : {}),
  }
  const res = existing
    ? await db.from(TABLE).update({ ...profile, ...patch, updated_at: new Date().toISOString() }).eq('ig_user_id', igUserId).select().single()
    : await db.from(TABLE).insert({ ig_user_id: igUserId, source: who.source ?? 'dm', ...profile, ...patch }).select().single()
  if (res.error) throw res.error
  return res.data
}

/** After we answered someone: a new client becomes «В диалоге». Never fails the reply itself. */
export async function markReplied(igUserId: string | null, who: Who) {
  if (!igUserId) return
  try {
    const cards = await contactsFor([igUserId])
    const stage = stageAfterReply(cards.get(igUserId)?.stage)
    if (stage !== cards.get(igUserId)?.stage) await upsertContact(igUserId, who, { stage })
  } catch (e) {
    console.warn('[crm instagram] stage after reply not saved:', (e as Error).message)
  }
}

export const ok = (body: unknown, status = 200) => NextResponse.json(body, { status })
