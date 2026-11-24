import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { isGuestProgram } from '@/lib/participant-kind'
import { CrmError, readClientProfile, saveProfile } from '@/lib/crm-clients-server'
import { loadStaff } from '@/lib/event-funnel-server'
import { igRoute, ok, readText } from '../../instagram/_lib'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
type Row = Record<string, any>

const CLEARABLE = ['city', 'source', 'activity', 'business_name', 'monthly_turnover', 'instagram']

/**
 * GET → one client's card: contacts and business, the events they are invited to with their
 * «Обзвон» stage and hunter, the latest call notes and marks, and their Instagram card if any.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  return igRoute(req, 'loading client', async () => {
    const { data: p, error } = await db.from('participants').select('id, name, phone, email, status, created_at, program:programs(name)').eq('id', id).maybeSingle()
    if (error) throw error
    if (!p) throw new CrmError('Клиент не найден', 404)
    const person = p as Row
    const { data: profile } = await db.from('participant_profiles').select('*').eq('participant_id', id).maybeSingle()
    const { data: atts, error: aErr } = await db.from('event_attendees').select('id, event_id, funnel_stage, hunter_id, next_contact_on').eq('participant_id', id)
    if (aErr) throw aErr
    const attendees = (atts ?? []) as Row[]
    const eventIds = [...new Set(attendees.map(a => a.event_id))]
    const events = eventIds.length ? (((await db.from('offline_events').select('id, name, event_date, status').in('id', eventIds)).data ?? []) as Row[]) : []
    const staff = await loadStaff()
    const names = new Map(staff.map(s => [s.id, s.name]))
    let history: Row[] = []
    if (attendees.length) {
      const res = await db.from('event_attendee_comments').select('id, attendee_id, kind, body, author_name, created_at').in('attendee_id', attendees.map(a => a.id)).order('created_at', { ascending: false }).limit(30)
      if (!res.error) history = (res.data ?? []) as Row[]
    }
    const { data: ig } = await db.from('crm_instagram_contacts').select('username, stage, note').eq('participant_id', id).maybeSingle()
    const pr = (profile ?? {}) as Row
    return ok({
      data: {
        id: person.id,
        name: person.name,
        phone: person.phone ?? null,
        email: person.email ?? null,
        created_at: person.created_at,
        kind: person.status === 'archived' ? 'archived' : isGuestProgram(person.program) ? 'guest' : 'member',
        program: person.program?.name ?? null,
        profile: {
          city: pr.city ?? null,
          source: pr.source ?? null,
          activity: pr.activity ?? null,
          business_name: pr.business_name ?? null,
          monthly_turnover: pr.monthly_turnover == null ? null : Number(pr.monthly_turnover),
          currency: pr.currency ?? 'TJS',
          instagram: pr.instagram ?? (ig as Row | null)?.username ?? null,
        },
        instagram: ig ?? null,
        events: attendees
          .map(a => {
            const e = events.find(x => x.id === a.event_id)
            return { attendee_id: a.id, event_id: a.event_id, name: e?.name ?? 'Мероприятие', event_date: e?.event_date ?? null, stage: a.funnel_stage || 'new', hunter: a.hunter_id ? names.get(a.hunter_id) ?? null : null, next_contact_on: a.next_contact_on ?? null }
          })
          .sort((x, y) => (y.event_date ?? '').localeCompare(x.event_date ?? '')),
        history: history.map(h => ({ ...h, event: events.find(e => e.id === attendees.find(a => a.id === h.attendee_id)?.event_id)?.name ?? null })),
      },
    })
  })
}

/** PATCH { name?, phone?, profile? } → contacts and business from the CRM card. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return igRoute(req, 'saving client', async () => {
    const body = await req.json().catch(() => ({}))
    const { data: before, error } = await db.from('participants').select('id, name, phone').eq('id', id).maybeSingle()
    if (error) throw error
    if (!before) throw new CrmError('Клиент не найден', 404)
    const patch: Row = {}
    if ('name' in body) {
      const name = readText(body.name, 200)
      if (!name) throw new CrmError('Укажите имя')
      patch.name = name
    }
    if ('phone' in body) patch.phone = readText(body.phone, 40) || null
    // Unlike adding, an emptied field here means «clear it»
    let profile: Row = {}
    if (body.profile && typeof body.profile === 'object') {
      const raw = body.profile as Row
      profile = readClientProfile(raw)
      for (const k of CLEARABLE) if (k in raw && (raw[k] === '' || raw[k] === null)) profile[k] = null
    }
    if (Object.keys(patch).length) {
      const { error: uErr } = await db.from('participants').update(patch).eq('id', id)
      if (uErr) throw uErr
    }
    await saveProfile(req, id, profile)
    await logAudit(req, {
      table: 'participants',
      recordId: id,
      action: 'update',
      summary: `Клиент «${patch.name ?? (before as Row).name}»: ${[...Object.keys(patch), ...Object.keys(profile)].join(', ') || 'без изменений'} (из CRM)`,
    })
    return ok({ success: true })
  })
}
