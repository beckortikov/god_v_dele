import { createGuest, inviteToEvent, readClientProfile, saveProfile } from '@/lib/crm-clients-server'
import { IgRouteError, contactsFor, igRoute, ok, readText, upsertContact } from '../../../_lib'

/**
 * POST { name, phone?, note?, event_id?, username?, picture?, source?,
 *        profile?: { city?, activity?, business_name?, source?, monthly_turnover?, currency? } } → «Завести в базу»:
 * the person becomes a participant of the «Гостевой» program (once), and, if an event is
 * chosen, a guest of that event on «Не звонили» with the caller as hunter («Обзвон» picks them up).
 * What was learnt about the business goes to the participant's profile, with the Instagram username.
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
    const profile = readClientProfile(body.profile, typeof body.username === 'string' && body.username ? { instagram: body.username } : {})
    const who = { username: body.username, name, picture: body.picture, source: body.source === 'comment' ? ('comment' as const) : ('dm' as const) }
    const origin = `из Instagram${who.username ? ` @${who.username}` : ''}`

    const participantId = (await contactsFor([igId])).get(igId)?.participant_id ?? (await createGuest(req, { name, phone, origin }))
    const card = await upsertContact(igId, who, { participant_id: participantId, ...(note ? { note } : {}) })
    await saveProfile(req, participantId, profile)
    const attendeeId = eventId ? await inviteToEvent(req, { participantId, name, phone, eventId, origin }) : null
    return ok({ data: { contact: card, participant_id: participantId, attendee_id: attendeeId } }, 201)
  })
}
