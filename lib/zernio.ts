/**
 * Zernio API (zernio.com): the Instagram direct inbox and comments for the CRM.
 * Server only: the key (ZERNIO_API_KEY) never reaches the browser.
 */
const BASE = 'https://zernio.com/api/v1'

export class ZernioError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ZernioError'
  }
}

function apiKey(): string {
  const key = process.env.ZERNIO_API_KEY
  if (!key) throw new ZernioError('Instagram не подключён: на сервере нет ZERNIO_API_KEY', 503, 'NO_KEY')
  return key
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = json?.error
    const message = typeof err === 'string' ? err : err?.message || json?.message || `Zernio ${res.status}`
    throw new ZernioError(message, res.status, typeof err === 'object' ? err?.code : json?.code)
  }
  return json as T
}

export interface IgAccount {
  id: string
  profileId: string
  username: string
  displayName?: string
  picture?: string | null
  /** false: Instagram's session expired; the account must be reconnected. */
  active: boolean
}

let accountCache: { at: number; value: IgAccount | null } | null = null

/** The connected Instagram account (cached for 5 minutes per server instance). */
export async function instagramAccount(): Promise<IgAccount | null> {
  if (accountCache && Date.now() - accountCache.at < 5 * 60_000) return accountCache.value
  const r = await call<{ accounts: any[] }>('GET', '/accounts')
  const all = (r.accounts ?? []).filter(x => x.platform === 'instagram')
  // An inactive account (expired session) is still the one to read and to reconnect
  const a = all.find(x => x.isActive !== false) ?? all[0] ?? null
  const value = a
    ? {
        id: a._id as string,
        profileId: (typeof a.profileId === 'object' ? a.profileId?._id : a.profileId) as string,
        username: a.username as string,
        displayName: a.displayName,
        picture: a.profilePicture ?? null,
        active: a.isActive !== false,
      }
    : null
  accountCache = { at: Date.now(), value }
  return value
}

async function requireAccount(): Promise<IgAccount> {
  const a = await instagramAccount()
  if (!a) throw new ZernioError('Instagram-аккаунт не подключён', 409, 'NOT_CONNECTED')
  return a
}

export interface IgConversation {
  id: string
  participantId: string
  name: string
  username: string | null
  picture: string | null
  lastMessage: string
  updatedTime: string
  unread: number
  url: string | null
}

export async function listConversations(cursor?: string | null): Promise<{ items: IgConversation[]; nextCursor: string | null }> {
  const a = await requireAccount()
  const q = new URLSearchParams({ accountId: a.id, platform: 'instagram', limit: '100', sortOrder: 'desc' })
  if (cursor) q.set('cursor', cursor)
  const r = await call<{ data: any[]; pagination?: { nextCursor?: string | null } }>('GET', `/inbox/conversations?${q}`)
  return {
    items: (r.data ?? []).map(c => ({
      id: String(c.id),
      participantId: String(c.participantId ?? c.id),
      name: c.participantName || c.participantUsername || 'Без имени',
      username: c.participantUsername ?? null,
      picture: c.participantPicture ?? null,
      lastMessage: c.lastMessage ?? '',
      updatedTime: c.updatedTime ?? c.updatedAt ?? '',
      unread: Number(c.unreadCount) || 0,
      url: c.url ?? null,
    })),
    nextCursor: r.pagination?.nextCursor ?? null,
  }
}

export interface IgAttachment {
  url: string
  type: string
}

export interface IgMessage {
  id: string
  text: string
  outgoing: boolean
  createdAt: string
  attachments: IgAttachment[]
  storyMention: boolean
}

export async function listMessages(conversationId: string): Promise<IgMessage[]> {
  const a = await requireAccount()
  const q = new URLSearchParams({ accountId: a.id, limit: '100', sortOrder: 'asc' })
  const r = await call<{ messages: any[] }>('GET', `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${q}`)
  return (r.messages ?? [])
    .map(m => ({
      id: String(m.id),
      text: m.message ?? '',
      outgoing: m.direction === 'outgoing',
      createdAt: m.createdAt ?? '',
      attachments: ((m.attachments ?? []) as any[]).map(x => ({ url: x.url ?? x.payload?.url ?? '', type: x.type ?? 'file' })).filter(x => x.url),
      storyMention: !!m.isStoryMention,
    }))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
}

export async function sendMessage(conversationId: string, text: string) {
  const a = await requireAccount()
  return call('POST', `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { accountId: a.id, message: text })
}

export async function markRead(conversationId: string) {
  const a = await requireAccount()
  return call('POST', `/inbox/conversations/${encodeURIComponent(conversationId)}/read`, { accountId: a.id })
}

export interface IgPost {
  id: string
  caption: string
  picture: string | null
  permalink: string | null
  createdTime: string
  commentCount: number
  likeCount: number
}

/** Posts with comments, newest activity first. `error` set when Zernio could not read the account. */
export async function listCommentPosts(): Promise<{ items: IgPost[]; error: { message: string; code?: string } | null }> {
  const a = await requireAccount()
  const q = new URLSearchParams({ accountId: a.id, platform: 'instagram', limit: '50', minComments: '1' })
  const r = await call<{ data: any[]; meta?: { failedAccounts?: { error?: string; code?: string }[] } }>('GET', `/inbox/comments?${q}`)
  const failed = r.meta?.failedAccounts?.[0]
  return {
    items: (r.data ?? []).map(p => ({
      id: String(p.id),
      caption: p.content ?? '',
      picture: typeof p.picture === 'string' ? p.picture : null,
      permalink: typeof p.permalink === 'string' ? p.permalink : null,
      createdTime: p.createdTime ?? '',
      commentCount: Number(p.commentCount) || 0,
      likeCount: Number(p.likeCount) || 0,
    })),
    error: failed ? { message: failed.error ?? 'Instagram не ответил', code: failed.code } : null,
  }
}

export interface IgComment {
  id: string
  text: string
  createdTime: string
  authorId: string | null
  authorName: string
  authorUsername: string | null
  authorPicture: string | null
  mine: boolean
  replies: IgComment[]
  canReply: boolean
}

function toComment(c: any): IgComment {
  return {
    id: String(c.id),
    text: c.message ?? '',
    createdTime: c.createdTime ?? '',
    authorId: c.from?.id ? String(c.from.id) : null,
    authorName: c.from?.name || c.from?.username || 'Без имени',
    authorUsername: c.from?.username ?? null,
    authorPicture: c.from?.picture ?? null,
    mine: !!c.from?.isOwner,
    replies: ((c.replies ?? []) as any[]).filter(r => r && typeof r === 'object').map(toComment),
    canReply: c.canReply !== false,
  }
}

export async function listComments(postId: string): Promise<IgComment[]> {
  const a = await requireAccount()
  const q = new URLSearchParams({ accountId: a.id, limit: '100' })
  const r = await call<{ comments: any[] }>('GET', `/inbox/comments/${encodeURIComponent(postId)}?${q}`)
  return (r.comments ?? []).map(toComment).sort((x, y) => x.createdTime.localeCompare(y.createdTime))
}

/** A public reply under the post, to a comment. */
export async function replyComment(postId: string, commentId: string, text: string) {
  const a = await requireAccount()
  return call('POST', `/inbox/comments/${encodeURIComponent(postId)}`, { accountId: a.id, message: text, commentId })
}

/** A direct message to the comment's author (Instagram allows one, within 7 days of the comment). */
export async function privateReply(postId: string, commentId: string, text: string) {
  const a = await requireAccount()
  return call('POST', `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/private-reply`, { accountId: a.id, message: text })
}

/** The Instagram login page that reconnects the account (keeps its history), coming back to `redirectUrl`. */
export async function reconnectUrl(redirectUrl: string): Promise<string> {
  const a = await requireAccount()
  const q = new URLSearchParams({ profileId: a.profileId, reconnectAccountId: a.id, redirect_url: redirectUrl })
  const r = await call<{ authUrl: string }>('GET', `/connect/instagram?${q}`)
  accountCache = null
  return r.authUrl
}
