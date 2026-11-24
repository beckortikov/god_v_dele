/**
 * Adding people to the client base from the CRM: a participant of the «Гостевой» program, what is
 * known about their business in the profile, and optionally a guest of an event that «Обзвон» picks up.
 * Shared by Instagram's «Завести в базу» and «Клиенты» (people from the street, a call, a referral).
 *
 * Server only.
 */
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { todayISO } from '@/lib/format'
import { findGuestProgram } from '@/lib/participant-kind'
import { ProfileInputError, parseProfile, type ProfileInput } from '@/lib/participant-profile'
import { callerId, recordHistory } from '@/lib/event-funnel-server'
import { parseCommentBody } from '@/lib/event-funnel'

/** A mistake the person can fix; shown as is. */
export class CrmError extends Error {
  constructor(
    message: string,
    public status = 400,
    public extra?: Record<string, unknown>
  ) {
    super(message)
  }
}

/** The profile part of a request; empty strings mean «not given». */
export function readClientProfile(raw: unknown, extra: Record<string, unknown> = {}): ProfileInput {
  try {
    const given = Object.fromEntries(Object.entries((raw ?? {}) as Record<string, unknown>).filter(([, v]) => v !== '' && v != null))
    return parseProfile({ ...given, ...extra })
  } catch (e) {
    if (e instanceof ProfileInputError) throw new CrmError(e.message)
    throw e
  }
}

const lastDigits = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '').slice(-9)

/** Someone already in the base with the same phone (last 9 digits), so nobody is added twice. */
export async function findSamePhone(phone: string | null): Promise<{ id: string; name: string } | null> {
  const key = lastDigits(phone)
  if (key.length < 7) return null
  const { data, error } = await db.from('participants').select('id, name, phone')
  if (error) throw error
  const hit = (data as { id: string; name: string; phone: string | null }[]).find(p => lastDigits(p.phone) === key)
  return hit ? { id: hit.id, name: hit.name } : null
}

/** A new participant of the «Гостевой» program; `origin` goes to the change log («из Instagram @x», «с улицы»). */
export async function createGuest(req: Request, input: { name: string; phone: string | null; origin: string }): Promise<string> {
  const { data: programs, error: pErr } = await db.from('programs').select('id, name')
  if (pErr) throw pErr
  const guest = findGuestProgram((programs ?? []) as { id: string; name: string }[])
  if (!guest) throw new CrmError('Нет программы «Гостевой»: создайте её на странице «Программы»', 409)
  const { data: made, error } = await db
    .from('participants')
    .insert({ name: input.name, phone: input.phone, program_id: guest.id, start_date: todayISO(), status: 'active' })
    .select('id, name')
    .single()
  if (error) throw error
  const id = (made as { id: string }).id
  await logAudit(req, { table: 'participants', recordId: id, action: 'create', summary: `Участник «${input.name}», ${guest.name} (${input.origin})`, after: made })
  return id
}

export async function saveProfile(req: Request, participantId: string, profile: ProfileInput) {
  if (!Object.keys(profile).length) return
  const { error } = await db
    .from('participant_profiles')
    .upsert({ participant_id: participantId, ...profile, updated_by: getActor(req).name, updated_at: new Date().toISOString() }, { onConflict: 'participant_id' })
  if (error) throw error
}

/**
 * A guest of the event on «Не звонили», the caller as hunter; once per person and event.
 * `note` becomes the first line of their history in «Обзвон».
 */
export async function inviteToEvent(
  req: Request,
  input: { participantId: string; name: string; phone: string | null; eventId: string; note?: string | null; origin: string }
): Promise<string> {
  const { data: event, error: eErr } = await db.from('offline_events').select('id, name, status').eq('id', input.eventId).maybeSingle()
  if (eErr) throw eErr
  if (!event || (event as { status: string }).status === 'cancelled') throw new CrmError('Мероприятие не найдено', 404)
  const { data: already } = await db.from('event_attendees').select('id').eq('event_id', input.eventId).eq('participant_id', input.participantId).maybeSingle()
  if (already) return (already as { id: string }).id

  const { data: att, error } = await db
    .from('event_attendees')
    .insert({
      event_id: input.eventId,
      attendee_type: 'guest',
      participant_id: input.participantId,
      guest_name: input.name,
      guest_phone: input.phone,
      funnel_stage: 'new',
      hunter_id: callerId(req),
    })
    .select('id')
    .single()
  if (error) throw error
  const attendeeId = (att as { id: string }).id
  const note = parseCommentBody(input.note)
  await recordHistory(req, [
    { attendee_id: attendeeId, kind: 'added', body: 'new' },
    ...(note ? [{ attendee_id: attendeeId, kind: 'note' as const, body: note }] : []),
  ])
  await logAudit(req, {
    table: 'event_attendees',
    recordId: attendeeId,
    action: 'create',
    summary: `Гость «${input.name}» на «${(event as { name: string }).name}» (${input.origin})`,
    after: att,
  })
  return attendeeId
}
