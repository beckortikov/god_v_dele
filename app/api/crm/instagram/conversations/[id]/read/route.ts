import { markRead } from '@/lib/zernio'
import { igRoute, ok } from '../../../_lib'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return igRoute(req, 'marking read', async () => {
    await markRead(id)
    return ok({ success: true })
  })
}
