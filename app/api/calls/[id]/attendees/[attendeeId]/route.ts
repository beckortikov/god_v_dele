import { crmGuard } from '@/lib/crm-access'
import { guarded, updateAttendee } from '@/lib/event-funnel-server'

/** On the «Обзвон» page only the stage, the callback date and the hunter can change. */
const CALL_EDITABLE = ['funnel_stage', 'next_contact_on', 'hunter_id'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
    const { id, attendeeId } = await params
    const denied = await crmGuard(req)
    if (denied) return denied
    return guarded('updating call stage', async () => updateAttendee(req, id, attendeeId, await req.json().catch(() => ({})), CALL_EDITABLE))
}
