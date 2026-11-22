import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { changeSuffix, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName, participantName } from '@/app/api/audit/_server'
import {
  isFunnelStage,
  parseCommentBody,
  parseContactDate,
  summarizeHistory,
  teamSummary,
  type HistoryKind,
} from '@/lib/event-funnel'

/**
 * Server side of the invitation funnel, shared by the finance event page
 * (/api/offline-events/…, with money) and the employees' «Обзвон» page (/api/calls/…, without).
 * Every stage change, payment change and note is written to event_attendee_comments
 * with who did it, so an administrator can see who marked what.
 */

const HISTORY = 'event_attendee_comments'
const HISTORY_COLS = 'id, attendee_id, kind, body, author_id, author_name, created_at'

export const FUNNEL_MIGRATION = {
  error: 'funnel_migration_required',
  message: 'История ещё не подключена. Примените миграции migrations/025_event_funnel.sql и 026_event_funnel_history.sql.',
}

type Row = Record<string, any>
type Err = { code?: string; message?: string } | null

/** Table or the kind column is not there yet. */
export const funnelMissing = (e: Err) => !!e && (e.code === '42P01' || e.code === '42703' || /event_attendee_comments|column .*kind/.test(e.message ?? ''))

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

/** Admin and finance see the per-employee summary; employees see only the list. */
export function seesTeam(req: Request) {
  try {
    const role = getSession(req)?.role
    return role === 'admin' || role === 'finance'
  } catch {
    return false
  }
}

/** Writes action lines (stage change, payment, added) on behalf of the caller. Never throws. */
export async function recordHistory(req: Request, rows: { attendee_id: string; kind: HistoryKind; body: string }[]) {
  if (!rows.length) return
  const actor = getActor(req)
  try {
    const { error } = await db.from(HISTORY).insert(rows.map(r => ({ ...r, author_id: actor.id, author_name: actor.name })))
    if (error) console.warn('[funnel] history not recorded:', error.message)
  } catch (e) {
    console.warn('[funnel] history not recorded:', (e as Error).message)
  }
}

/** Fields the «Обзвон» page gets: who, how to reach them, where they are in the funnel. No money. */
const CALL_FIELDS = [
  'id', 'event_id', 'attendee_type', 'participant_id', 'participant_name', 'participant_phone', 'participant_email',
  'guest_name', 'guest_phone', 'guest_email', 'funnel_stage', 'next_contact_on', 'created_at',
  'last_comment', 'comments_count', 'last_mark',
] as const

/** Attendees of an event with contacts, newest note and who put them on their current stage. */
export async function loadFunnel(req: Request, eventId: string, opts: { withMoney: boolean }) {
  const { data, error } = await db
    .from('event_attendees')
    .select('*, participant:participants(name, phone, email)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const ids = (data as Row[]).map(a => a.id)
  let history: Row[] = []
  if (ids.length) {
    const res = await db.from(HISTORY).select('attendee_id, kind, body, author_name, created_at').in('attendee_id', ids)
    if (!res.error) history = res.data as Row[]
    else if (!funnelMissing(res.error)) throw res.error
  }
  const summary = summarizeHistory(history as any)

  const rows = (data as Row[]).map(({ participant, ...item }) => {
    const s = summary.get(item.id)
    const full: Row = {
      ...item,
      participant_name: participant?.name || null,
      participant_phone: participant?.phone || null,
      participant_email: participant?.email || null,
      last_comment: s?.last_comment ?? null,
      comments_count: s?.comments_count ?? 0,
      last_mark: s?.last_mark ?? null,
    }
    return opts.withMoney ? full : Object.fromEntries(CALL_FIELDS.map(k => [k, full[k] ?? null]))
  })

  return { rows, team: seesTeam(req) ? teamSummary(history as any) : undefined }
}

/**
 * Changes one attendee: only `allowed` fields, the stage and callback date checked,
 * and only within this event. Stage and payment changes go to the person's history.
 */
export async function updateAttendee(req: Request, eventId: string, attendeeId: string, raw: Row, allowed: readonly string[]) {
  const body: Row = {}
  for (const k of allowed) if (raw && k in raw) body[k] = raw[k]
  if ('funnel_stage' in body && !isFunnelStage(body.funnel_stage)) return json({ error: 'Неизвестный этап воронки' }, 400)
  if ('next_contact_on' in body) {
    const d = parseContactDate(body.next_contact_on)
    if (d === undefined) return json({ error: 'Дата «перезвонить» в формате ГГГГ-ММ-ДД' }, 400)
    body.next_contact_on = d
  }
  if (!Object.keys(body).length) return json({ error: 'Нечего сохранять' }, 400)

  const { data: before, error: beforeError } = await db.from('event_attendees').select('*').eq('id', attendeeId).eq('event_id', eventId).maybeSingle()
  if (beforeError) throw beforeError
  if (!before) return json({ error: 'Человек не найден в этом мероприятии' }, 404)

  const { data, error } = await db.from('event_attendees').update(roundMoneyFields(body)).eq('id', attendeeId).eq('event_id', eventId).select()
  if (error) throw error
  const after = (data as Row[])?.[0]

  if (after) {
    const lines: { attendee_id: string; kind: HistoryKind; body: string }[] = []
    const oldStage = (before as Row).funnel_stage || 'new'
    if (after.funnel_stage && after.funnel_stage !== oldStage) lines.push({ attendee_id: attendeeId, kind: 'stage', body: `${oldStage}>${after.funnel_stage}` })
    const oldPaid = Math.round((Number((before as Row).payment_received) || 0) * 100) / 100
    const newPaid = Math.round((Number(after.payment_received) || 0) * 100) / 100
    if (newPaid !== oldPaid) lines.push({ attendee_id: attendeeId, kind: 'payment', body: `${oldPaid}>${newPaid}` })
    await recordHistory(req, lines)

    const [who, ev] = await Promise.all([after.participant_id ? participantName(after.participant_id) : Promise.resolve(''), eventName(eventId)])
    await logAudit(req, {
      table: 'event_attendees',
      recordId: attendeeId,
      action: 'update',
      summary: `Гость «${who || after.guest_name || 'без имени'}» на «${ev || 'мероприятие'}» ${rowMoney(after, 'payment_received')}${changeSuffix(before, after)}`,
      before,
      after,
    })
  }
  return json({ data })
}

async function belongs(eventId: string, attendeeId: string) {
  const { data, error } = await db.from('event_attendees').select('id').eq('id', attendeeId).eq('event_id', eventId).maybeSingle()
  if (error) throw error
  return !!data
}

const notFound = () => json({ error: 'Человек не найден в этом мероприятии' }, 404)

/** The person's feed, newest first: notes and actions, each with who and when. */
export async function listHistory(req: Request, eventId: string, attendeeId: string) {
  if (!(await belongs(eventId, attendeeId))) return notFound()
  const { data, error } = await db.from(HISTORY).select(HISTORY_COLS).eq('attendee_id', attendeeId).order('created_at', { ascending: false })
  if (funnelMissing(error)) return json(FUNNEL_MIGRATION, 503)
  if (error) throw error
  let me: { id: string | null; admin: boolean } = { id: null, admin: false }
  try {
    const s = getSession(req)
    me = { id: s?.uid ?? null, admin: s?.role === 'admin' }
  } catch {
    /* no session: nothing can be deleted */
  }
  const rows = (data as Row[]).map(({ author_id, ...c }) => ({
    ...c,
    kind: c.kind || 'note',
    can_delete: (c.kind || 'note') === 'note' && (me.admin || (!!me.id && author_id === me.id)),
  }))
  return json({ data: rows })
}

export async function addNote(req: Request, eventId: string, attendeeId: string) {
  const body = parseCommentBody((await req.json().catch(() => ({})))?.body)
  if (!body) return json({ error: 'Напишите комментарий' }, 400)
  if (!(await belongs(eventId, attendeeId))) return notFound()
  const actor = getActor(req)
  const { data, error } = await db
    .from(HISTORY)
    .insert({ attendee_id: attendeeId, kind: 'note', body, author_id: actor.id, author_name: actor.name })
    .select(HISTORY_COLS)
    .single()
  if (funnelMissing(error)) return json(FUNNEL_MIGRATION, 503)
  if (error) throw error
  const { author_id: _author, ...made } = data as Row
  return json({ data: { ...made, kind: 'note', can_delete: true } }, 201)
}

/** Only notes can be removed, by their author or an admin; actions stay as the record. */
export async function deleteNote(req: Request, eventId: string, attendeeId: string, commentId: string) {
  if (!(await belongs(eventId, attendeeId))) return notFound()
  const { data: note, error } = await db.from(HISTORY).select('id, kind, author_id').eq('id', commentId).eq('attendee_id', attendeeId).maybeSingle()
  if (error) throw error
  if (!note) return json({ error: 'Комментарий не найден' }, 404)
  const n = note as Row
  if ((n.kind || 'note') !== 'note') return json({ error: 'Отметки об этапах и оплатах не удаляются' }, 403)
  const actor = getActor(req)
  let admin = false
  try {
    admin = getSession(req)?.role === 'admin'
  } catch {
    /* treated as not admin */
  }
  if (!admin && (!actor.id || n.author_id !== actor.id)) return json({ error: 'Удалить можно только свой комментарий' }, 403)
  const del = await db.from(HISTORY).delete().eq('id', commentId).eq('attendee_id', attendeeId)
  if (del.error) throw del.error
  return json({ success: true })
}

/** Wraps a handler body: unexpected errors become 500 with the message. */
export async function guarded(label: string, fn: () => Promise<Response>) {
  try {
    return await fn()
  } catch (error: any) {
    console.error(`Error ${label}:`, error)
    return json({ error: error?.message ?? 'Ошибка' }, 500)
  }
}
