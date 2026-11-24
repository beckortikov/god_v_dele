import { db } from '@/lib/db'
import { CrmError, inviteToEvent } from '@/lib/crm-clients-server'
import { igRoute, ok, readText } from '../../../instagram/_lib'

/** POST { event_id, note? } → an existing client becomes a guest of the event in «Обзвон», the caller as hunter. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return igRoute(req, 'inviting client', async () => {
    const body = await req.json().catch(() => ({}))
    if (typeof body.event_id !== 'string' || !body.event_id) throw new CrmError('Выберите мероприятие')
    const { data: p, error } = await db.from('participants').select('id, name, phone').eq('id', id).maybeSingle()
    if (error) throw error
    if (!p) throw new CrmError('Клиент не найден', 404)
    const person = p as { id: string; name: string; phone: string | null }
    const attendeeId = await inviteToEvent(req, { participantId: person.id, name: person.name, phone: person.phone, eventId: body.event_id, note: readText(body.note), origin: 'из CRM' })
    return ok({ data: { attendee_id: attendeeId } }, 201)
  })
}
