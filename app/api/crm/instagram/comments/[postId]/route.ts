import { listComments, privateReply, replyComment } from '@/lib/zernio'
import { IgRouteError, contactsFor, igRoute, markReplied, ok, readText } from '../../_lib'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ postId: string }> }

/** GET → the post's comments with replies, and the CRM cards of their authors. */
export async function GET(req: Request, { params }: Ctx) {
  const { postId } = await params
  return igRoute(req, 'loading comments', async () => {
    const comments = await listComments(postId)
    const ids = [...new Set(comments.flatMap(c => [c, ...c.replies]).filter(c => !c.mine && c.authorId).map(c => c.authorId!))]
    const cards = await contactsFor(ids)
    return ok({ data: comments, contacts: Object.fromEntries(cards) })
  })
}

/**
 * POST { commentId, text, mode: 'public' | 'private', authorId?, username?, name?, picture? }:
 * a reply under the post, or a direct message to the comment's author.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { postId } = await params
  return igRoute(req, 'replying to comment', async () => {
    const body = await req.json().catch(() => ({}))
    const text = readText(body.text, 1000)
    if (!text) throw new IgRouteError('Напишите ответ')
    if (typeof body.commentId !== 'string' || !body.commentId) throw new IgRouteError('Выберите комментарий')
    if (body.mode === 'private') await privateReply(postId, body.commentId, text)
    else await replyComment(postId, body.commentId, text)
    await markReplied(typeof body.authorId === 'string' ? body.authorId : null, { username: body.username, name: body.name, picture: body.picture, source: 'comment' })
    return ok({ success: true }, 201)
  })
}
