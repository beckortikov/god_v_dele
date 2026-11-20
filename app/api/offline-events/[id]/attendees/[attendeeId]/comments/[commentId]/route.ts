import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Remove one comment (a typo, a wrong person). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; attendeeId: string; commentId: string }> }) {
    try {
        const { id, attendeeId, commentId } = await params
        const { data: owner, error: ownerError } = await db.from('event_attendees').select('id').eq('id', attendeeId).eq('event_id', id).maybeSingle()
        if (ownerError) throw ownerError
        if (!owner) return NextResponse.json({ error: 'Человек не найден в этом мероприятии' }, { status: 404 })
        const { error } = await db.from('event_attendee_comments').delete().eq('id', commentId).eq('attendee_id', attendeeId)
        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting attendee comment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
