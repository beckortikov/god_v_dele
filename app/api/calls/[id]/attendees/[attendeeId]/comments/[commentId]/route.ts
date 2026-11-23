import { crmGuard } from '@/lib/crm-access'
import { deleteNote, guarded } from '@/lib/event-funnel-server'

/** Remove one note (a typo, a wrong person): its author or an admin. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; attendeeId: string; commentId: string }> }) {
    const { id, attendeeId, commentId } = await params
    const denied = await crmGuard(req)
    if (denied) return denied
    return guarded('deleting attendee comment', () => deleteNote(req, id, attendeeId, commentId))
}
