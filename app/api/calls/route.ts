import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { FUNNEL_STAGES, type FunnelStage } from '@/lib/event-funnel'
import { guarded } from '@/lib/event-funnel-server'

/**
 * Events to call people for («Обзвон»): name, date, place and how many people are on each
 * funnel stage. No money: employees and managers use this page, not the event budget.
 */
export async function GET() {
    return guarded('loading call events', async () => {
        const { data: events, error } = await db
            .from('offline_events')
            .select('id, name, event_date, location, status')
            .neq('status', 'cancelled')
            .order('event_date', { ascending: false })
        if (error) throw error
        const ids = (events ?? []).map((e: any) => e.id)
        const counts = new Map<string, Record<FunnelStage, number>>()
        if (ids.length) {
            const res = await db.from('event_attendees').select('event_id, funnel_stage').in('event_id', ids)
            if (res.error) throw res.error
            for (const a of res.data as any[]) {
                const c = counts.get(a.event_id) ?? (Object.fromEntries(FUNNEL_STAGES.map(s => [s, 0])) as Record<FunnelStage, number>)
                const st = (a.funnel_stage || 'new') as FunnelStage
                if (st in c) c[st]++
                counts.set(a.event_id, c)
            }
        }
        const data = (events ?? []).map((e: any) => {
            const c = counts.get(e.id) ?? (Object.fromEntries(FUNNEL_STAGES.map(s => [s, 0])) as Record<FunnelStage, number>)
            return { ...e, counts: c, total: Object.values(c).reduce((s, n) => s + n, 0) }
        })
        return NextResponse.json({ data })
    })
}
