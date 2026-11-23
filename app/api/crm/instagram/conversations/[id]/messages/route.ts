import { listMessages, sendMessage } from '@/lib/zernio'
import { IgRouteError, igRoute, markReplied, ok, readText } from '../../../_lib'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  return igRoute(req, 'loading messages', async () => ok({ data: await listMessages(id) }))
}

/** POST { text, participantId, username?, name?, picture? } → sends a direct message. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  return igRoute(req, 'sending message', async () => {
    const body = await req.json().catch(() => ({}))
    const text = readText(body.text, 1000)
    if (!text) throw new IgRouteError('Напишите сообщение')
    await sendMessage(id, text)
    await markReplied(typeof body.participantId === 'string' ? body.participantId : null, { username: body.username, name: body.name, picture: body.picture, source: 'dm' })
    return ok({ success: true }, 201)
  })
}
