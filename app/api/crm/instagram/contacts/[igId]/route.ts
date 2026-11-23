import { isIgStage } from '@/lib/crm-instagram'
import { IgRouteError, igRoute, ok, readText, upsertContact } from '../../_lib'

/** PATCH { stage?, note?, username?, name?, picture?, source? } → the person's CRM card. */
export async function PATCH(req: Request, { params }: { params: Promise<{ igId: string }> }) {
  const { igId } = await params
  return igRoute(req, 'saving contact', async () => {
    const body = await req.json().catch(() => ({}))
    const patch: { stage?: any; note?: string | null } = {}
    if ('stage' in body) {
      if (!isIgStage(body.stage)) throw new IgRouteError('Неизвестный этап')
      patch.stage = body.stage
    }
    if ('note' in body) patch.note = readText(body.note) || null
    if (!Object.keys(patch).length) throw new IgRouteError('Нечего сохранять')
    const who = { username: body.username, name: body.name, picture: body.picture, source: body.source === 'comment' ? ('comment' as const) : ('dm' as const) }
    return ok({ data: await upsertContact(igId, who, patch) })
  })
}
