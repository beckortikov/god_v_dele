import { db } from '@/lib/db'
import { isGuestProgram } from '@/lib/participant-kind'
import { CrmError, createGuest, findSamePhone, inviteToEvent, readClientProfile, saveProfile } from '@/lib/crm-clients-server'
import { igRoute, ok, readText } from '../instagram/_lib'

export const dynamic = 'force-dynamic'

type Row = Record<string, any>

/** GET → the client base: everyone in «Участники» with where they came from and their business, newest first. */
export async function GET(req: Request) {
  return igRoute(req, 'listing clients', async () => {
    const { data: people, error } = await db.from('participants').select('id, name, phone, status, created_at, program:programs(name)').order('created_at', { ascending: false })
    if (error) throw error
    const { data: profiles, error: prErr } = await db.from('participant_profiles').select('participant_id, city, source, activity, business_name, monthly_turnover, currency, instagram')
    if (prErr) throw prErr
    const byId = new Map((profiles as Row[]).map(p => [p.participant_id, p]))
    const { data: cards } = await db.from('crm_instagram_contacts').select('participant_id, username')
    const insta = new Map(((cards ?? []) as Row[]).filter(c => c.participant_id).map(c => [c.participant_id, c.username]))
    const data = (people as Row[]).map(p => {
      const pr = byId.get(p.id) ?? {}
      return {
        id: p.id,
        name: p.name,
        phone: p.phone ?? null,
        created_at: p.created_at,
        kind: p.status === 'archived' ? 'archived' : isGuestProgram(p.program) ? 'guest' : 'member',
        program: p.program?.name ?? null,
        city: pr.city ?? null,
        source: pr.source ?? null,
        activity: pr.activity ?? null,
        business_name: pr.business_name ?? null,
        monthly_turnover: pr.monthly_turnover == null ? null : Number(pr.monthly_turnover),
        currency: pr.currency ?? 'TJS',
        instagram: pr.instagram ?? insta.get(p.id) ?? null,
      }
    })
    return ok({ data })
  })
}

/**
 * POST { name, phone?, profile?: { city, source, activity, business_name, monthly_turnover, currency, instagram },
 *        event_id?, note?, force? } → a new client (a guest in «Участники»), optionally invited to an event.
 * The same phone already in the base → 409 with `existing`, unless `force`.
 */
export async function POST(req: Request) {
  return igRoute(req, 'adding client', async () => {
    const body = await req.json().catch(() => ({}))
    const name = readText(body.name, 200)
    const phone = readText(body.phone, 40) || null
    if (!name) throw new CrmError('Укажите имя')
    const profile = readClientProfile(body.profile)
    const eventId = typeof body.event_id === 'string' && body.event_id ? body.event_id : null
    if (!body.force) {
      const same = await findSamePhone(phone)
      if (same) throw new CrmError(`С этим номером уже есть клиент: ${same.name}`, 409, { existing: same })
    }
    const origin = (profile.source || 'вручную').toLowerCase()
    const participantId = await createGuest(req, { name, phone, origin })
    await saveProfile(req, participantId, profile)
    const attendeeId = eventId ? await inviteToEvent(req, { participantId, name, phone, eventId, note: readText(body.note), origin }) : null
    return ok({ data: { id: participantId, attendee_id: attendeeId } }, 201)
  })
}
