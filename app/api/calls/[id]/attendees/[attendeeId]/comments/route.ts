import { crmGuard } from '@/lib/crm-access'
import { addNote, guarded, listHistory } from '@/lib/event-funnel-server'

type Ctx = { params: Promise<{ id: string; attendeeId: string }> }

/** The person's feed: call notes plus who changed the stage or payment, newest first. */
export async function GET(req: Request, { params }: Ctx) {
    const { id, attendeeId } = await params
    const denied = await crmGuard(req)
    if (denied) return denied
    return guarded('loading attendee history', () => listHistory(req, id, attendeeId))
}

export async function POST(req: Request, { params }: Ctx) {
    const { id, attendeeId } = await params
    const denied = await crmGuard(req)
    if (denied) return denied
    return guarded('adding attendee comment', () => addNote(req, id, attendeeId))
}
