import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor } from '@/lib/audit'
import { parseCommentBody } from '@/lib/event-funnel'

type Ctx = { params: Promise<{ id: string; attendeeId: string }> }

const MIGRATION = {
    error: 'funnel_migration_required',
    message: 'Комментарии ещё не подключены. Примените миграцию migrations/025_event_funnel.sql.',
}

/** The attendee must belong to this event, otherwise 404. */
async function attendeeOf(eventId: string, attendeeId: string) {
    const { data, error } = await db.from('event_attendees').select('id').eq('id', attendeeId).eq('event_id', eventId).maybeSingle()
    if (error) throw error
    return data
}

const missingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || /event_attendee_comments/.test(e.message ?? ''))

/** Call comments for one person, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
    try {
        const { id, attendeeId } = await params
        if (!(await attendeeOf(id, attendeeId))) return NextResponse.json({ error: 'Человек не найден в этом мероприятии' }, { status: 404 })
        const { data, error } = await db
            .from('event_attendee_comments')
            .select('id, attendee_id, body, author_name, created_at')
            .eq('attendee_id', attendeeId)
            .order('created_at', { ascending: false })
        if (missingTable(error)) return NextResponse.json(MIGRATION, { status: 503 })
        if (error) throw error
        return NextResponse.json({ data })
    } catch (error: any) {
        console.error('Error loading attendee comments:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request, { params }: Ctx) {
    try {
        const { id, attendeeId } = await params
        const body = parseCommentBody((await req.json().catch(() => ({})))?.body)
        if (!body) return NextResponse.json({ error: 'Напишите комментарий' }, { status: 400 })
        if (!(await attendeeOf(id, attendeeId))) return NextResponse.json({ error: 'Человек не найден в этом мероприятии' }, { status: 404 })
        const actor = getActor(req)
        const { data, error } = await db
            .from('event_attendee_comments')
            .insert({ attendee_id: attendeeId, body, author_id: actor.id, author_name: actor.name })
            .select('id, attendee_id, body, author_name, created_at')
            .single()
        if (missingTable(error)) return NextResponse.json(MIGRATION, { status: 503 })
        if (error) throw error
        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding attendee comment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
