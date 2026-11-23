import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { todayISO } from '@/lib/format'
import { findGuestProgram } from '@/lib/participant-kind'
import { callerId, recordHistory } from '@/lib/event-funnel-server'
import { IgRouteError, contactsFor, igRoute, ok, readText, upsertContact } from '../../../_lib'

/**
 * POST { name, phone?, note?, event_id?, username?, picture?, source? } → «Завести в базу»:
 * the person becomes a participant of the «Гостевой» program (once), and, if an event is
 * chosen, a guest of that event on «Не звонили» with the caller as hunter («Обзвон» picks them up).
 */
export async function POST(req: Request, { params }: { params: Promise<{ igId: string }> }) {
  const { igId } = await params
  return igRoute(req, 'adding to base', async () => {
    const body = await req.json().catch(() => ({}))
    const name = readText(body.name, 200)
    const phone = readText(body.phone, 40) || null
    const note = readText(body.note) || null
    const eventId = typeof body.event_id === 'string' && body.event_id ? body.event_id : null
    if (!name) throw new IgRouteError('Укажите имя')
    const who = { username: body.username, name, picture: body.picture, source: body.source === 'comment' ? ('comment' as const) : ('dm' as const) }

    let participantId = (await contactsFor([igId])).get(igId)?.participant_id ?? null
    if (!participantId) {
      const { data: programs, error: pErr } = await db.from('programs').select('id, name')
      if (pErr) throw pErr
      const guest = findGuestProgram((programs ?? []) as { id: string; name: string }[])
      if (!guest) throw new IgRouteError('Нет программы «Гостевой»: создайте её на странице «Программы»', 409)
      const { data: made, error } = await db
        .from('participants')
        .insert({ name, phone, program_id: guest.id, start_date: todayISO(), status: 'active' })
        .select('id, name')
        .single()
      if (error) throw error
      participantId = (made as { id: string }).id
      await logAudit(req, {
        table: 'participants',
        recordId: participantId,
        action: 'create',
        summary: `Участник «${name}», ${guest.name} (из Instagram${who.username ? ` @${who.username}` : ''})`,
        after: made,
      })
    }
    const card = await upsertContact(igId, who, { participant_id: participantId, ...(note ? { note } : {}) })

    let attendeeId: string | null = null
    if (eventId) {
      const { data: event, error: eErr } = await db.from('offline_events').select('id, name, status').eq('id', eventId).maybeSingle()
      if (eErr) throw eErr
      if (!event || (event as { status: string }).status === 'cancelled') throw new IgRouteError('Мероприятие не найдено', 404)
      const { data: already } = await db.from('event_attendees').select('id').eq('event_id', eventId).eq('participant_id', participantId).maybeSingle()
      if (already) {
        attendeeId = (already as { id: string }).id
      } else {
        const { data: att, error: aErr } = await db
          .from('event_attendees')
          .insert({
            event_id: eventId,
            attendee_type: 'guest',
            participant_id: participantId,
            guest_name: name,
            guest_phone: phone,
            funnel_stage: 'new',
            hunter_id: callerId(req),
          })
          .select('id')
          .single()
        if (aErr) throw aErr
        attendeeId = (att as { id: string }).id
        await recordHistory(req, [{ attendee_id: attendeeId, kind: 'added', body: 'new' }])
        await logAudit(req, {
          table: 'event_attendees',
          recordId: attendeeId,
          action: 'create',
          summary: `Гость «${name}» на «${(event as { name: string }).name}» (из Instagram)`,
          after: att,
        })
      }
    }
    return ok({ data: { contact: card, participant_id: participantId, attendee_id: attendeeId } }, 201)
  })
}
