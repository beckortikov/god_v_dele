import { guarded, updateAttendee } from '@/lib/event-funnel-server'

/** On the «Обзвон» page only the stage and the callback date can change. */
const CALL_EDITABLE = ['funnel_stage', 'next_contact_on'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
    const { id, attendeeId } = await params
    return guarded('updating call stage', async () => updateAttendee(req, id, attendeeId, await req.json().catch(() => ({})), CALL_EDITABLE))
}
