import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { crmGuard } from '@/lib/crm-access'
import { funnelSummary } from '@/lib/crm-funnel'
import { guarded, loadStaff } from '@/lib/event-funnel-server'

export const dynamic = 'force-dynamic'

/**
 * GET ?event=<id> (or none for every event) → the «Обзвон» funnel: stage counts in total,
 * per event and per hunter. No money and no names of the people called.
 */
export async function GET(req: Request) {
  const denied = await crmGuard(req)
  if (denied) return denied
  return guarded('loading crm funnel', async () => {
    const eventId = new URL(req.url).searchParams.get('event')
    const { data: events, error } = await db
      .from('offline_events')
      .select('id, name, event_date, location, status')
      .neq('status', 'cancelled')
      .order('event_date', { ascending: false })
    if (error) throw error
    const all = (events ?? []) as { id: string; name: string; event_date: string; location: string | null }[]
    const chosen = eventId ? all.filter(e => e.id === eventId) : all
    let attendees: { event_id: string; funnel_stage: string | null; hunter_id: string | null }[] = []
    if (chosen.length) {
      const res = await db.from('event_attendees').select('event_id, funnel_stage, hunter_id').in('event_id', chosen.map(e => e.id))
      if (res.error) throw res.error
      attendees = res.data as typeof attendees
    }
    const staff = await loadStaff()
    const names = new Map(staff.map(s => [s.id, s.name]))
    const summary = funnelSummary(attendees, chosen, id => names.get(id))
    return NextResponse.json({
      options: all.map(e => ({ id: e.id, name: e.name, event_date: e.event_date, location: e.location })),
      total: summary.total,
      hunters: summary.hunters,
      events: summary.events.map(s => ({ ...s, event_date: chosen.find(e => e.id === s.id)?.event_date ?? null })),
    })
  })
}
