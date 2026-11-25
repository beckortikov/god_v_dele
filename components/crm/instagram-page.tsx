'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  Instagram,
  MessageCircle,
  MessagesSquare,
  PanelRight,
  Paperclip,
  RefreshCw,
  SendHorizontal,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { Field } from '@/components/erp/field'
import { useNav } from '@/components/app-shell/nav-context'
import { LEAD_SOURCES } from '@/lib/participant-profile'
import { IG_NOTE_MAX, IG_STAGE_INFO, igStageOf, phoneFromMessages, splitInstagramName, stageAfterReply, type IgContact, type IgStage } from '@/lib/crm-instagram'
import { CrmSearch, PILL, PersonAvatar, clock, dayLabel, enterSends, shortTime } from '@/components/crm/parts'

interface Conversation {
  id: string
  participantId: string
  name: string
  username: string | null
  picture: string | null
  lastMessage: string
  updatedTime: string
  unread: number
  url: string | null
  contact: IgContact | null
}

interface Message {
  id: string
  text: string
  outgoing: boolean
  createdAt: string
  attachments: { index: number; type: string; originalType: string | null }[]
  storyMention: boolean
  storyReply: { storyId: string; storyUrl: string | null } | null
  unsupported: boolean
  pending?: boolean
}

interface Post {
  id: string
  caption: string
  picture: string | null
  permalink: string | null
  createdTime: string
  commentCount: number
  likeCount: number
}

interface Comment {
  id: string
  text: string
  createdTime: string
  authorId: string | null
  authorName: string
  authorUsername: string | null
  authorPicture: string | null
  mine: boolean
  replies: Comment[]
  canReply: boolean
}

/** The person the right panel and «Завести в базу» are about. */
interface Person {
  igId: string
  name: string
  username: string | null
  picture: string | null
  source: 'dm' | 'comment'
  contact: IgContact | null
}

type Mode = 'dm' | 'comments'
type Filter = 'all' | 'unread' | 'nobase'
type ApiError = Error & { code?: string }

const TEMPLATES = [
  { label: 'О программе', text: '«Год в деле» — годовая программа для предпринимателей: мастермайнды, наставник, спринты и операционный план. Удобно созвониться, чтобы рассказать подробнее?' },
  { label: 'Номер телефона', text: 'Оставьте, пожалуйста, номер телефона — мы перезвоним и всё расскажем.' },
  { label: 'Мастермайнд', text: 'Приглашаем на открытый мастермайнд. Подскажите номер телефона — пришлём детали.' },
  { label: 'Ответили в директ', text: 'Спасибо за вопрос! Написали вам в директ.' },
]

/** What is in the composer right now (a phone keyboard may still be finishing a word), else the state. */
const fieldText = (draft: string) => ((typeof document !== 'undefined' ? (document.getElementById('ig-composer') as HTMLTextAreaElement | null)?.value : null) ?? draft).trim()

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) {
    const e = new Error(typeof body.error === 'string' ? body.error : body.error?.message || `Ошибка ${res.status}`) as ApiError
    e.code = body.code ?? body.error?.code
    throw e
  }
  return body as T
}

/** Polls `fn` every `ms` while the tab is visible. */
function usePoll(fn: () => void, ms: number, on = true) {
  const ref = React.useRef(fn)
  React.useEffect(() => {
    ref.current = fn
  })
  React.useEffect(() => {
    if (!on) return
    const t = setInterval(() => document.visibilityState === 'visible' && ref.current(), ms)
    return () => clearInterval(t)
  }, [ms, on])
}

/**
 * CRM → Instagram: direct messages and comments of @god_v_dele in one place, Telegram-style.
 * Each person has a sales stage, a note and «Завести в базу» (a guest in the participants list,
 * optionally invited to an event so that «Обзвон» picks them up).
 */
export function InstagramPage() {
  const { navigate } = useNav()
  const [mode, setMode] = React.useState<Mode>('dm')
  const [showInfo, setShowInfo] = React.useState(true)
  const [threadOpen, setThreadOpen] = React.useState(false)
  const [baseFor, setBaseFor] = React.useState<Person | null>(null)
  // Phone numbers people typed in direct, by Instagram user id: «Завести в базу» fills them in
  const [phones, setPhones] = React.useState<Record<string, string>>({})
  const [reconnecting, setReconnecting] = React.useState(false)

  // Direct
  const [convs, setConvs] = React.useState<Conversation[] | null>(null)
  const [account, setAccount] = React.useState<{ username: string; active: boolean } | null>(null)
  const [convError, setConvError] = React.useState<ApiError | null>(null)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [query, setQuery] = React.useState('')
  const [convId, setConvId] = React.useState<string | null>(null)

  // Comments
  const [posts, setPosts] = React.useState<Post[] | null>(null)
  const [postsError, setPostsError] = React.useState<{ message: string; code?: string } | null>(null)
  const [postId, setPostId] = React.useState<string | null>(null)
  const [commentAuthor, setCommentAuthor] = React.useState<Person | null>(null)

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('connected')) {
      toast.success('Instagram переподключён')
      const url = new URL(window.location.href)
      url.searchParams.delete('connected')
      window.history.replaceState(null, '', url)
    }
  }, [])

  const loadConvs = React.useCallback(async () => {
    try {
      const r = await api<{ items: Conversation[]; account: { username: string; active: boolean } | null }>('/api/crm/instagram/conversations')
      setConvs(r.items)
      setAccount(r.account)
      setConvError(null)
    } catch (e) {
      setConvError(e as ApiError)
      setConvs(c => c ?? [])
    }
  }, [])

  const loadPosts = React.useCallback(async () => {
    try {
      const r = await api<{ data: Post[]; error: { message: string; code?: string } | null }>('/api/crm/instagram/comments')
      setPosts(r.data)
      setPostsError(r.error)
    } catch (e) {
      setPostsError({ message: (e as ApiError).message, code: (e as ApiError).code })
      setPosts(p => p ?? [])
    }
  }, [])

  React.useEffect(() => {
    loadConvs()
  }, [loadConvs])
  React.useEffect(() => {
    if (mode === 'comments' && posts === null) loadPosts()
  }, [mode, posts, loadPosts])
  usePoll(loadConvs, 30_000)

  const reconnect = async () => {
    setReconnecting(true)
    try {
      const r = await api<{ url: string }>('/api/crm/instagram/connect')
      window.location.href = r.url
    } catch (e) {
      toast.error('Не удалось открыть вход в Instagram', { description: (e as Error).message })
      setReconnecting(false)
    }
  }

  /** A changed card goes into every list that shows this person. */
  const applyContact = (igId: string, contact: IgContact) => {
    setConvs(list => list?.map(c => (c.participantId === igId ? { ...c, contact } : c)) ?? list)
    setCommentAuthor(p => (p?.igId === igId ? { ...p, contact } : p))
    setBaseFor(p => (p?.igId === igId ? { ...p, contact } : p))
  }

  const saveContact = async (p: Person, patch: { stage?: IgStage; note?: string }) => {
    const prev = p.contact
    const optimistic: IgContact = { ig_user_id: p.igId, stage: prev?.stage ?? 'new', note: prev?.note ?? null, participant_id: prev?.participant_id ?? null, participant_name: prev?.participant_name, ...patch }
    applyContact(p.igId, optimistic)
    try {
      const r = await api<{ data: IgContact }>(`/api/crm/instagram/contacts/${encodeURIComponent(p.igId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, username: p.username, name: p.name, picture: p.picture, source: p.source }),
      })
      applyContact(p.igId, { ...optimistic, ...r.data, participant_name: optimistic.participant_name })
    } catch (e) {
      if (prev) applyContact(p.igId, prev)
      toast.error('Не удалось сохранить', { description: (e as Error).message })
    }
  }

  const unread = (convs ?? []).filter(c => c.unread > 0).length
  const q = query.trim().toLowerCase()
  const visible = (convs ?? []).filter(
    c =>
      (filter === 'all' || (filter === 'unread' ? c.unread > 0 : !c.contact?.participant_id)) &&
      (!q || c.name.toLowerCase().includes(q) || (c.username ?? '').toLowerCase().includes(q))
  )
  const conv = (convs ?? []).find(c => c.id === convId) ?? null
  const post = (posts ?? []).find(p => p.id === postId) ?? null

  const person: Person | null =
    mode === 'dm'
      ? conv && { igId: conv.participantId, name: conv.name, username: conv.username, picture: conv.picture, source: 'dm', contact: conv.contact }
      : commentAuthor

  const openConv = (c: Conversation) => {
    setConvId(c.id)
    setThreadOpen(true)
    if (c.unread > 0) {
      setConvs(list => list?.map(x => (x.id === c.id ? { ...x, unread: 0 } : x)) ?? list)
      api(`/api/crm/instagram/conversations/${encodeURIComponent(c.id)}/read`, { method: 'POST' }).catch(() => {})
    }
  }

  const expired = account?.active === false || convError?.code === 'TOKEN_EXPIRED' || postsError?.code === 'TOKEN_EXPIRED'

  return (
    <div className="flex h-full min-h-0">
      {/* Left: conversations or posts */}
      <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-r bg-card lg:flex lg:w-[22.5rem]', threadOpen && 'hidden')}>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <Instagram className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold">Instagram</h1>
            <p className="truncate text-xs text-muted-foreground">{account ? `@${account.username}` : 'Директ и комментарии'}</p>
          </div>
        </div>
        <div className="px-3 pb-2.5">
          <Segmented
            aria-label="Раздел"
            className="grid w-full grid-cols-2"
            value={mode}
            onChange={m => {
              setMode(m)
              setThreadOpen(false)
            }}
            options={[
              { value: 'dm', label: (<><MessagesSquare className="size-3.5" />Директ</>), count: unread || undefined },
              { value: 'comments', label: (<><MessageCircle className="size-3.5" />Комментарии</>) },
            ]}
          />
        </div>

        {expired && (
          <div className="mx-3 mb-2.5 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
            <p className="font-medium">Сессия Instagram истекла</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Пока аккаунт не войдёт заново, новые сообщения и комментарии могут не приходить. История сохранится.</p>
            <Button size="sm" className="mt-2" onClick={reconnect} disabled={reconnecting}>
              <RefreshCw className={cn(reconnecting && 'animate-spin')} /> Переподключить
            </Button>
          </div>
        )}

        {mode === 'dm' ? (
          <>
            <div className="space-y-2 px-3 pb-2">
              <CrmSearch value={query} onChange={setQuery} placeholder="Поиск по имени или нику" />
              <Segmented
                size="sm"
                aria-label="Фильтр"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Все' },
                  { value: 'unread', label: 'Непрочитанные', count: unread },
                  { value: 'nobase', label: 'Нет в базе' },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t p-1.5">
              {convs === null ? (
                <ListSkeleton />
              ) : convError && !convs.length ? (
                <EmptyState icon={MessagesSquare} title="Директ не загрузился" description={convError.message} action={<Button size="sm" variant="outline" onClick={loadConvs}>Повторить</Button>} />
              ) : visible.length === 0 ? (
                <EmptyState icon={MessagesSquare} title={convs.length ? 'Никого не найдено' : expired ? 'Переписка появится после переподключения' : 'Сообщений пока нет'} />
              ) : (
                visible.map(c => {
                  const on = c.id === convId
                  const st = igStageOf(c.contact?.stage)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openConv(c)}
                      aria-current={on || undefined}
                      className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30', on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                    >
                      <PersonAvatar name={c.name} picture={c.picture} seed={c.participantId} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.name}</span>
                          <span className={cn('num shrink-0 text-xs', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{shortTime(c.updatedTime)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={cn('min-w-0 flex-1 truncate text-sm', on ? 'text-primary-foreground/85' : c.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>{!c.lastMessage || c.lastMessage === '[Attachment]' ? 'Вложение' : c.lastMessage}</span>
                          {c.unread > 0 && !on && <span className="num flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{c.unread}</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', on ? 'bg-primary-foreground/20' : PILL[st.variant])}>{st.label}</span>
                          {!c.contact?.participant_id && <span className={cn('rounded-md border border-dashed px-1.5 text-[11px]', on ? 'border-primary-foreground/50' : 'text-muted-foreground')}>нет в базе</span>}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto border-t p-1.5">
            {posts === null ? (
              <ListSkeleton />
            ) : posts.length === 0 ? (
              <EmptyState icon={MessageCircle} title={postsError ? 'Комментарии не загрузились' : 'Комментариев пока нет'} description={postsError && !expired ? postsError.message : undefined} />
            ) : (
              posts.map(p => {
                const on = p.id === postId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPostId(p.id)
                      setCommentAuthor(null)
                      setThreadOpen(true)
                    }}
                    aria-current={on || undefined}
                    className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30', on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  >
                    <PostThumb post={p} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 text-sm font-medium">{p.caption || 'Без подписи'}</span>
                      <span className={cn('num flex items-center gap-3 text-xs', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="size-3.5" /> {p.commentCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5" /> {p.likeCount}
                        </span>
                        <span>{p.createdTime ? formatDate(p.createdTime) : ''}</span>
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </aside>

      {/* Center */}
      <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-muted/50 lg:flex', !threadOpen && 'hidden')}>
        {mode === 'dm' && conv && person ? (
          <DmThread
            key={conv.id}
            conv={conv}
            person={person}
            showInfo={showInfo}
            onBack={() => setThreadOpen(false)}
            onToggleInfo={() => setShowInfo(s => !s)}
            onStage={s => saveContact(person, { stage: s })}
            onBase={() => setBaseFor(person)}
            onPhone={phone => setPhones(p => (p[conv.participantId] === phone ? p : { ...p, [conv.participantId]: phone }))}
            onSent={text => {
              setConvs(list => list?.map(c => (c.id === conv.id ? { ...c, lastMessage: text, updatedTime: new Date().toISOString(), contact: { ...(c.contact ?? { ig_user_id: c.participantId, note: null, participant_id: null }), stage: stageAfterReply(c.contact?.stage) } } : c)) ?? list)
            }}
          />
        ) : mode === 'comments' && post ? (
          <CommentsThread
            key={post.id}
            post={post}
            selectedAuthor={commentAuthor?.igId ?? null}
            showInfo={showInfo}
            onBack={() => setThreadOpen(false)}
            onToggleInfo={() => setShowInfo(s => !s)}
            onAuthor={setCommentAuthor}
            onExpired={() => setPostsError({ message: 'Сессия Instagram истекла', code: 'TOKEN_EXPIRED' })}
          />
        ) : (
          <EmptyState
            className="m-auto"
            icon={mode === 'dm' ? MessagesSquare : MessageCircle}
            title={mode === 'dm' ? 'Выберите переписку' : 'Выберите пост'}
            description={mode === 'dm' ? 'Слева — все, кто написал @god_v_dele в директ' : 'Ответьте под постом или напишите автору в директ'}
          />
        )}
      </section>

      {/* Right: the client card */}
      {showInfo && person && (
        <ClientCard
          key={person.igId}
          person={person}
          onStage={s => saveContact(person, { stage: s })}
          onNote={note => saveContact(person, { note })}
          onBase={() => setBaseFor(person)}
          onCalls={() => navigate('calls')}
        />
      )}

      <BaseDialog
        person={baseFor}
        phoneHint={baseFor ? phones[baseFor.igId] ?? '' : ''}
        onClose={() => setBaseFor(null)}
        onSaved={(igId, contact) => {
          applyContact(igId, contact)
          setBaseFor(null)
        }}
      />
    </div>
  )
}

/** What a story or a shared post is: a line above the media, so the manager sees what the person reacted to. */
function contextLabel(m: Message): string | null {
  const emojiOnly = !!m.text && !/[\p{L}\p{N}]/u.test(m.text) && m.text.length <= 12
  if (m.storyReply) return emojiOnly ? 'Реакция на вашу сторис' : 'Ответ на вашу сторис'
  if (m.storyMention) return m.outgoing ? 'Вы упомянули в сторис' : 'Упомянул(а) вас в сторис'
  const t = m.attachments[0]?.originalType ?? m.attachments[0]?.type
  if (t === 'story_mention') return m.outgoing ? 'Вы упомянули в своей сторис' : 'Упомянул(а) вас в сторис'
  if (t === 'ig_story' || t === 'story') return 'Поделился сторис'
  if (t === 'ig_reel' || t === 'reel') return 'Поделился Reels'
  if (t === 'ig_post' || t === 'post' || t === 'share') return 'Поделился публикацией'
  return null
}

function MessageContext({ m, convId }: { m: Message; convId: string }) {
  const label = contextLabel(m)
  const isStory = !!m.storyReply || m.storyMention || m.attachments.some(a => /story/.test(a.originalType ?? a.type))
  const sources = [
    ...(m.storyReply?.storyUrl ? [`/api/crm/instagram/media?u=${encodeURIComponent(m.storyReply.storyUrl)}`] : []),
    ...m.attachments.map(a => `/api/crm/instagram/media?c=${encodeURIComponent(convId)}&m=${encodeURIComponent(m.id)}&i=${a.index}`),
  ]
  return (
    <>
      {label && <span className={cn('mb-1 block text-xs font-semibold', m.outgoing ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{label}</span>}
      {sources.map(src => (
        <MessageMedia key={src} src={src} story={isStory} onDark={m.outgoing} />
      ))}
      {isStory && !sources.length && <MediaGone story onDark={m.outgoing} />}
      {m.unsupported && !sources.length && (
        <span className={cn('block text-sm italic', m.outgoing ? 'text-primary-foreground/85' : 'text-muted-foreground')}>Карточка или ссылка, которую Instagram не показывает в CRM — откройте переписку в Instagram</span>
      )}
    </>
  )
}

function MediaGone({ story, onDark }: { story: boolean; onDark: boolean }) {
  return (
    <span className={cn('my-1 flex h-20 w-44 items-center justify-center rounded-xl px-3 text-center text-xs', onDark ? 'bg-primary-foreground/15 text-primary-foreground/85' : 'bg-muted text-muted-foreground')}>
      {story ? 'Сторис больше недоступна: Instagram хранит её 24 часа' : 'Вложение больше недоступно'}
    </span>
  )
}

/** A picture, video or voice message; the type is asked from the server first (HEAD). */
function MessageMedia({ src, story, onDark }: { src: string; story: boolean; onDark: boolean }) {
  const [kind, setKind] = React.useState<'loading' | 'image' | 'video' | 'audio' | 'file' | 'gone'>('loading')
  React.useEffect(() => {
    let live = true
    fetch(src, { method: 'HEAD' })
      .then(r => {
        if (!live) return
        if (!r.ok) return setKind('gone')
        const t = r.headers.get('content-type') ?? ''
        setKind(t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'file')
      })
      .catch(() => live && setKind('gone'))
    return () => {
      live = false
    }
  }, [src])
  if (kind === 'loading') return <Skeleton className={cn('my-1 rounded-xl', story ? 'h-64 w-36' : 'h-40 w-56')} />
  if (kind === 'gone') return <MediaGone story={story} onDark={onDark} />
  if (kind === 'image')
    return (
      <a href={src} target="_blank" rel="noreferrer" className="my-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={story ? 'Сторис' : 'Фото'} onError={() => setKind('gone')} className={cn('rounded-xl object-cover', story ? 'max-h-80 w-44' : 'max-h-72 max-w-full')} />
      </a>
    )
  if (kind === 'video')
    return <video src={src} controls playsInline preload="metadata" onError={() => setKind('gone')} className={cn('my-1 rounded-xl bg-black', story ? 'max-h-96 w-48' : 'max-h-80 max-w-full')} />
  if (kind === 'audio') return <audio src={src} controls preload="metadata" className="my-1 max-w-64" />
  return (
    <a href={src} target="_blank" rel="noreferrer" className={cn('my-0.5 flex items-center gap-1.5 text-sm underline underline-offset-2', onDark ? 'text-primary-foreground' : 'text-primary')}>
      <Paperclip className="size-3.5" /> Открыть вложение
    </a>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-1">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex items-center gap-3 p-1.5">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PostThumb({ post, size = 'md' }: { post: Post; size?: 'md' | 'lg' }) {
  const [broken, setBroken] = React.useState(false)
  const box = size === 'lg' ? 'size-16' : 'size-14'
  return post.picture && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={post.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn('shrink-0 rounded-lg bg-muted object-cover', box)} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground', box)}>
      <Instagram className="size-5" />
    </span>
  )
}

/** Stage chips: one click moves the person; saved to their CRM card. */
function StageBar({ value, onChange }: { value: IgStage | null | undefined; onChange: (s: IgStage) => void }) {
  const idx = IG_STAGE_INFO.findIndex(s => s.value === (value ?? 'new'))
  return (
    <div role="radiogroup" aria-label="Этап" className="flex flex-wrap items-center gap-1">
      {IG_STAGE_INFO.map((s, i) => {
        const on = i === idx
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={s.hint}
            onClick={() => !on && onChange(s.value)}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30',
              on ? cn(PILL[s.variant], 'ring-1 ring-foreground/15 ring-inset') : i < idx ? 'text-foreground/75 hover:bg-muted' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {i < idx && '✓ '}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

function ThreadHeader({
  person,
  subtitle,
  href,
  showInfo,
  onBack,
  onToggleInfo,
  onBase,
  children,
}: {
  person: { igId: string; name: string; picture: string | null; contact: IgContact | null }
  subtitle: string
  href: string | null
  showInfo: boolean
  onBack: () => void
  onToggleInfo: () => void
  onBase?: () => void
  children?: React.ReactNode
}) {
  return (
    <header className="space-y-2.5 border-b bg-card px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="Назад к списку" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <PersonAvatar name={person.name} picture={person.picture} seed={person.igId} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {onBase && !person.contact?.participant_id && (
          <Button type="button" size="sm" variant="outline" onClick={onBase}>
            <UserPlus /> В базу
          </Button>
        )}
        {href && (
          <Button asChild variant="ghost" size="icon" aria-label="Открыть в Instagram">
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink />
            </a>
          </Button>
        )}
        <Button type="button" variant={showInfo ? 'soft' : 'ghost'} size="icon" className="max-xl:hidden" aria-label="Карточка клиента" aria-pressed={showInfo} onClick={onToggleInfo}>
          <PanelRight />
        </Button>
      </div>
      {children}
    </header>
  )
}

function Composer({
  placeholder,
  sending,
  onSend,
  draft,
  setDraft,
  above,
}: {
  placeholder: string
  sending: boolean
  onSend: () => void
  draft: string
  setDraft: (v: string) => void
  above?: React.ReactNode
}) {
  return (
    <div className="space-y-2 px-3 pt-2 pb-3 sm:px-4">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {TEMPLATES.map(t => (
          <button key={t.label} type="button" onClick={() => setDraft(t.text)} className="h-8 shrink-0 rounded-full border bg-card px-3 text-xs font-medium text-foreground/80 outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30">
            {t.label}
          </button>
        ))}
      </div>
      {above}
      <form
        className="flex items-end gap-2"
        onSubmit={e => {
          e.preventDefault()
          onSend()
        }}
      >
        <label htmlFor="ig-composer" className="sr-only">
          {placeholder}
        </label>
        <textarea
          id="ig-composer"
          rows={1}
          value={draft}
          maxLength={1000}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (enterSends(e)) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={placeholder}
          className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none rounded-3xl border bg-card px-4 py-2.5 text-[15px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Отправить" className="size-11 shrink-0 rounded-full">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}

function DmThread({
  conv,
  person,
  showInfo,
  onBack,
  onToggleInfo,
  onStage,
  onBase,
  onPhone,
  onSent,
}: {
  conv: Conversation
  person: Person
  showInfo: boolean
  onBack: () => void
  onToggleInfo: () => void
  onStage: (s: IgStage) => void
  onBase: () => void
  onPhone: (phone: string) => void
  onSent: (text: string) => void
}) {
  const [messages, setMessages] = React.useState<Message[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const phoneRef = React.useRef(onPhone)
  React.useEffect(() => {
    phoneRef.current = onPhone
  })

  const load = React.useCallback(async () => {
    try {
      const r = await api<{ data: Message[] }>(`/api/crm/instagram/conversations/${encodeURIComponent(conv.id)}/messages`)
      setMessages(r.data)
      setError(null)
      const phone = phoneFromMessages(r.data)
      if (phone) phoneRef.current(phone)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [conv.id])
  React.useEffect(() => {
    load()
  }, [load])
  usePoll(load, 8_000)

  const send = async () => {
    const text = fieldText(draft)
    if (!text || sending) return
    setSending(true)
    const temp: Message = { id: `tmp-${Date.now()}`, text, outgoing: true, createdAt: new Date().toISOString(), attachments: [], storyMention: false, storyReply: null, unsupported: false, pending: true }
    setMessages(m => [...(m ?? []), temp])
    setDraft('')
    try {
      await api(`/api/crm/instagram/conversations/${encodeURIComponent(conv.id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, participantId: conv.participantId, username: conv.username, name: conv.name, picture: conv.picture }),
      })
      onSent(text)
      load()
    } catch (e) {
      setMessages(m => (m ?? []).filter(x => x.id !== temp.id))
      setDraft(text)
      toast.error('Сообщение не отправлено', { description: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const lines: React.ReactNode[] = []
  let lastDay = ''
  ;(messages ?? []).forEach((m, i) => {
    const day = dayLabel(m.createdAt)
    if (day && day !== lastDay) {
      lastDay = day
      lines.push(
        <div key={`d-${m.id}`} className="flex justify-center py-2">
          <span className="rounded-full bg-foreground/55 px-3 py-0.5 text-xs font-medium text-background">{day}</span>
        </div>
      )
    }
    const next = messages![i + 1]
    const tail = !next || next.outgoing !== m.outgoing || dayLabel(next.createdAt) !== day
    lines.push(
      <div key={m.id} className={cn('flex', m.outgoing ? 'justify-end' : 'justify-start', tail ? 'pb-1.5' : 'pb-0.5')}>
        <div
          className={cn(
            'max-w-[min(36rem,78%)] px-3 pt-1.5 pb-1 text-[15px] leading-snug shadow-xs',
            m.outgoing ? 'bg-primary text-primary-foreground' : 'bg-card',
            m.outgoing ? (tail ? 'rounded-[18px_18px_6px_18px]' : 'rounded-[18px]') : tail ? 'rounded-[18px_18px_18px_6px]' : 'rounded-[18px]',
            m.pending && 'opacity-70'
          )}
        >
          <MessageContext m={m} convId={conv.id} />
          {m.text && <span className="whitespace-pre-wrap">{m.text}</span>}
          <span className={cn('num float-right mt-1.5 ml-2.5 text-[11px]', m.outgoing ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{m.pending ? '…' : clock(m.createdAt)}</span>
        </div>
      </div>
    )
  })

  return (
    <>
      <ThreadHeader
        person={person}
        subtitle={conv.username ? `@${conv.username}` : 'Instagram'}
        href={conv.url ?? (conv.username ? `https://instagram.com/${conv.username}` : null)}
        showInfo={showInfo}
        onBack={onBack}
        onToggleInfo={onToggleInfo}
        onBase={onBase}
      >
        <StageBar value={person.contact?.stage} onChange={onStage} />
      </ThreadHeader>
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-3 py-3 sm:px-6">
        <div className="flex flex-col">
          {messages === null && !error && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            </div>
          )}
          {error && <p className="text-center text-sm text-muted-foreground">Переписка не загрузилась: {error}</p>}
          {lines}
        </div>
      </div>
      <Composer placeholder="Сообщение" sending={sending} onSend={send} draft={draft} setDraft={setDraft} />
    </>
  )
}

function CommentsThread({
  post,
  selectedAuthor,
  showInfo,
  onBack,
  onToggleInfo,
  onAuthor,
  onExpired,
}: {
  post: Post
  selectedAuthor: string | null
  showInfo: boolean
  onBack: () => void
  onToggleInfo: () => void
  onAuthor: (p: Person) => void
  onExpired: () => void
}) {
  const [comments, setComments] = React.useState<Comment[] | null>(null)
  const [contacts, setContacts] = React.useState<Record<string, IgContact>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [target, setTarget] = React.useState<Comment | null>(null)
  const [replyMode, setReplyMode] = React.useState<'public' | 'private'>('public')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const expiredRef = React.useRef(onExpired)
  React.useEffect(() => {
    expiredRef.current = onExpired
  })
  const load = React.useCallback(async () => {
    try {
      const r = await api<{ data: Comment[]; contacts: Record<string, IgContact> }>(`/api/crm/instagram/comments/${encodeURIComponent(post.id)}`)
      setComments(r.data)
      setContacts(r.contacts)
      setError(null)
    } catch (e) {
      if ((e as ApiError).code === 'TOKEN_EXPIRED') expiredRef.current()
      setError((e as Error).message)
    }
  }, [post.id])
  React.useEffect(() => {
    load()
  }, [load])

  const asPerson = (c: Comment): Person | null =>
    c.authorId ? { igId: c.authorId, name: c.authorName, username: c.authorUsername, picture: c.authorPicture, source: 'comment', contact: contacts[c.authorId] ?? null } : null

  const pick = (c: Comment, mode: 'public' | 'private') => {
    setTarget(c)
    setReplyMode(mode)
    const p = asPerson(c)
    if (p) onAuthor(p)
    if (mode === 'public' && c.authorUsername && !draft) setDraft(`@${c.authorUsername} `)
  }

  const send = async () => {
    const text = fieldText(draft)
    if (!text || sending || !target) return
    setSending(true)
    try {
      await api(`/api/crm/instagram/comments/${encodeURIComponent(post.id)}`, {
        method: 'POST',
        body: JSON.stringify({ commentId: target.id, text, mode: replyMode, authorId: target.authorId, username: target.authorUsername, name: target.authorName, picture: target.authorPicture }),
      })
      toast.success(replyMode === 'public' ? 'Ответ опубликован под постом' : `Отправлено в директ ${target.authorName}`)
      setDraft('')
      setTarget(null)
      load()
    } catch (e) {
      toast.error('Ответ не отправлен', { description: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const row = (c: Comment, nested = false) => {
    const contact = c.authorId ? contacts[c.authorId] : null
    const chosen = !c.mine && !!c.authorId && c.authorId === selectedAuthor
    return (
      <div key={c.id} className={cn('flex items-start gap-2.5', nested && 'ml-11')}>
        <button type="button" onClick={() => !c.mine && pick(c, replyMode)} className="shrink-0 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30" aria-label={`Карточка: ${c.authorName}`} disabled={c.mine}>
          <PersonAvatar name={c.mine ? 'Год в деле' : c.authorName} picture={c.authorPicture} seed={c.authorId ?? c.id} size="sm" />
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn('inline-block max-w-full rounded-[4px_16px_16px_16px] px-3 py-1.5 shadow-xs', c.mine ? 'bg-primary-soft' : 'bg-card', chosen && 'ring-2 ring-primary/40')}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              {c.mine ? 'god_v_dele' : c.authorUsername || c.authorName}
              {contact?.participant_id && <UserCheck className="size-3.5 text-success" aria-label="В базе" />}
            </span>
            <span className="text-[15px] leading-snug whitespace-pre-wrap">{c.text}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 pl-1 text-xs text-muted-foreground">
            <span className="num">{c.createdTime ? `${dayLabel(c.createdTime).toLowerCase()}, ${clock(c.createdTime)}` : ''}</span>
            {!c.mine && c.canReply && (
              <>
                <button type="button" className="py-1 font-semibold hover:text-foreground" onClick={() => pick(c, 'public')}>
                  Ответить
                </button>
                <button type="button" className="py-1 font-semibold hover:text-foreground" onClick={() => pick(c, 'private')}>
                  В директ
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b bg-card px-3 py-2.5 sm:px-4">
        <Button type="button" variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="Назад к постам" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <PostThumb post={post} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold">{post.caption || 'Без подписи'}</p>
          <p className="num mt-0.5 text-xs text-muted-foreground">
            {post.commentCount} комментариев · {post.likeCount} отметок{post.createdTime ? ` · ${formatDate(post.createdTime)}` : ''}
          </p>
        </div>
        {post.permalink && (
          <Button asChild variant="outline" size="sm">
            <a href={post.permalink} target="_blank" rel="noreferrer">
              <ExternalLink /> Пост
            </a>
          </Button>
        )}
        <Button type="button" variant={showInfo ? 'soft' : 'ghost'} size="icon" className="max-xl:hidden" aria-label="Карточка клиента" aria-pressed={showInfo} onClick={onToggleInfo}>
          <PanelRight />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6">
        {comments === null && !error && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
            <Skeleton className="h-12 w-1/2 rounded-2xl" />
          </div>
        )}
        {error && <p className="text-center text-sm text-muted-foreground">Комментарии не загрузились: {error}</p>}
        {comments?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Под постом нет комментариев</p>}
        {comments?.map(c => (
          <div key={c.id} className="space-y-2">
            {row(c)}
            {c.replies.map(r => row(r, true))}
          </div>
        ))}
      </div>
      {target ? (
        <Composer
          placeholder={replyMode === 'public' ? 'Ответ под постом' : 'Сообщение в директ'}
          sending={sending}
          onSend={send}
          draft={draft}
          setDraft={setDraft}
          above={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ответ {target.authorUsername ? `@${target.authorUsername}` : target.authorName}:</span>
              <Segmented
                size="sm"
                aria-label="Куда ответить"
                value={replyMode}
                onChange={setReplyMode}
                options={[
                  { value: 'public', label: 'Под постом' },
                  { value: 'private', label: 'В директ' },
                ]}
              />
              <span className="text-muted-foreground">{replyMode === 'public' ? 'увидят все' : 'придёт личным сообщением'}</span>
              <button type="button" className="ml-auto py-1 font-medium text-muted-foreground hover:text-foreground" onClick={() => setTarget(null)}>
                Отмена
              </button>
            </div>
          }
        />
      ) : (
        <p className="px-4 py-4 text-center text-sm text-muted-foreground">Нажмите «Ответить» или «В директ» под комментарием</p>
      )}
    </>
  )
}

function ClientCard({
  person,
  onStage,
  onNote,
  onBase,
  onCalls,
}: {
  person: Person
  onStage: (s: IgStage) => void
  onNote: (note: string) => void
  onBase: () => void
  onCalls: () => void
}) {
  const [note, setNote] = React.useState(person.contact?.note ?? '')
  const saved = person.contact?.note ?? ''
  const inBase = !!person.contact?.participant_id
  return (
    <aside aria-label="Карточка клиента" className="hidden w-80 shrink-0 overflow-y-auto border-l bg-card xl:block">
      <div className="flex flex-col items-center gap-2.5 px-5 pt-6 pb-4 text-center">
        <PersonAvatar name={person.name} picture={person.picture} seed={person.igId} size="lg" />
        <div>
          <p className="text-lg font-bold">{person.name}</p>
          {person.username && (
            <a href={`https://instagram.com/${person.username}`} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary">
              @{person.username}
            </a>
          )}
        </div>
      </div>
      <div className="px-5 pb-4">
        {inBase ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-success-soft p-3">
            <UserCheck className="size-5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-success">В базе клиентов</p>
              <p className="truncate text-xs text-muted-foreground">{person.contact?.participant_name || 'Гость'}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={onBase}>
              Пригласить
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5 rounded-xl border border-dashed p-3.5">
            <p className="text-sm text-foreground/80">Этого человека ещё нет в базе клиентов.</p>
            <Button type="button" className="w-full" onClick={onBase}>
              <UserPlus /> Завести в базу
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2 border-t px-5 py-4">
        <p className="text-xs font-semibold text-muted-foreground">Этап</p>
        <div className="flex flex-col gap-1">
          {IG_STAGE_INFO.map(s => {
            const on = (person.contact?.stage ?? 'new') === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => !on && onStage(s.value)}
                aria-pressed={on}
                className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30', on ? cn(PILL[s.variant], 'font-semibold') : 'hover:bg-muted')}
              >
                {s.label}
                <span className="text-xs font-normal text-muted-foreground">{s.hint}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-2 border-t px-5 py-4">
        <label htmlFor="ig-note" className="text-xs font-semibold text-muted-foreground">
          Заметка
        </label>
        <Textarea
          id="ig-note"
          value={note}
          maxLength={IG_NOTE_MAX}
          onChange={e => setNote(e.target.value)}
          onBlur={() => note.trim() !== saved.trim() && onNote(note)}
          placeholder="Что важно знать о клиенте"
          className="min-h-24"
        />
        <p className="text-xs text-muted-foreground">Сохраняется, когда вы уходите из поля</p>
      </div>
      {inBase && (
        <div className="border-t px-5 py-4">
          <Button type="button" variant="outline" className="w-full" onClick={onCalls}>
            Открыть «Обзвон»
          </Button>
        </div>
      )}
    </aside>
  )
}

interface CallEvent {
  id: string
  name: string
  event_date: string
}

const CURRENCY_OPTIONS = ['TJS', 'USD', 'RUB', 'UZS', 'KZT', 'EUR'] as const

/** «Завести в базу»: a guest in the participants list with what we know about the business, optionally invited to an event. */
function BaseDialog({ person, phoneHint, onClose, onSaved }: { person: Person | null; phoneHint: string; onClose: () => void; onSaved: (igId: string, contact: IgContact) => void }) {
  const [f, setF] = React.useState({ name: '', phone: '', city: '', source: '', activity: '', business_name: '', monthly_turnover: '', currency: 'TJS', note: '' })
  const [eventId, setEventId] = React.useState('none')
  const [events, setEvents] = React.useState<CallEvent[]>([])
  const [busy, setBusy] = React.useState(false)
  const inBase = !!person?.contact?.participant_id
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))

  React.useEffect(() => {
    if (!person) return
    const split = splitInstagramName(person.name)
    setF({
      name: person.contact?.participant_name || split.name,
      phone: phoneHint,
      city: '',
      source: person.source === 'comment' ? 'Instagram — комментарий' : 'Instagram — директ',
      activity: split.activity,
      business_name: '',
      monthly_turnover: '',
      currency: 'TJS',
      note: person.contact?.note ?? '',
    })
    setEventId('none')
    api<{ data: CallEvent[] }>('/api/calls')
      .then(r => {
        const today = todayISO()
        setEvents((r.data ?? []).filter(e => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date)))
      })
      .catch(() => setEvents([]))
  }, [person])

  const save = async () => {
    if (!person || !f.name.trim() || busy) return
    if (inBase && eventId === 'none') return onClose()
    setBusy(true)
    try {
      const r = await api<{ data: { contact: IgContact; participant_id: string } }>(`/api/crm/instagram/contacts/${encodeURIComponent(person.igId)}/base`, {
        method: 'POST',
        body: JSON.stringify({
          name: f.name,
          phone: f.phone,
          note: f.note,
          event_id: eventId === 'none' ? null : eventId,
          username: person.username,
          picture: person.picture,
          source: person.source,
          profile: inBase
            ? undefined
            : { city: f.city, source: f.source, activity: f.activity, business_name: f.business_name, monthly_turnover: f.monthly_turnover, ...(f.monthly_turnover ? { currency: f.currency } : {}) },
        }),
      })
      const ev = events.find(e => e.id === eventId)
      toast.success(inBase ? `${f.name} приглашён(а) на «${ev?.name}»` : `${f.name} в базе клиентов`, { description: ev ? 'Человек появился в «Обзвоне», вы — хантер' : undefined })
      onSaved(person.igId, { ...r.data.contact, participant_name: f.name })
    } catch (e) {
      toast.error('Не удалось сохранить', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!person} onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{inBase ? 'Пригласить на мероприятие' : 'Завести в базу клиентов'}</DialogTitle>
          <DialogDescription>
            {person?.username ? `@${person.username} · ` : ''}
            {inBase ? 'Человек уже в базе' : 'Появится в «Участниках» как гость; данные о бизнесе — в его профиле'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!inBase && (
            <>
              <Field label="Имя и фамилия" htmlFor="base-name" required className="sm:col-span-2">
                <Input id="base-name" value={f.name} onChange={set('name')} autoComplete="off" />
              </Field>
              <Field label="Телефон" htmlFor="base-phone" hint={phoneHint && f.phone === phoneHint ? 'Взят из переписки' : undefined}>
                <Input id="base-phone" type="tel" inputMode="tel" placeholder="+992" value={f.phone} onChange={set('phone')} autoComplete="off" />
              </Field>
              <Field label="Город" htmlFor="base-city">
                <Input id="base-city" value={f.city} onChange={set('city')} placeholder="Например: Душанбе" maxLength={100} />
              </Field>
              <Field label="Откуда пришёл" htmlFor="base-source" className="sm:col-span-2">
                <Select value={f.source} onValueChange={v => setF(x => ({ ...x, source: v }))}>
                  <SelectTrigger id="base-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map(s => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Чем занимается" htmlFor="base-activity" hint={f.activity ? 'Подставлено из имени в Instagram' : undefined}>
                <Input id="base-activity" value={f.activity} onChange={set('activity')} placeholder="Например: товарный бизнес" maxLength={200} />
              </Field>
              <Field label="Название бизнеса" htmlFor="base-business">
                <Input id="base-business" value={f.business_name} onChange={set('business_name')} placeholder="Необязательно" maxLength={150} />
              </Field>
              <Field label="Оборот в месяц, примерно" htmlFor="base-turnover" className="sm:col-span-2">
                <div className="flex gap-2">
                  <Input id="base-turnover" type="number" inputMode="decimal" min={0} value={f.monthly_turnover} onChange={set('monthly_turnover')} placeholder="Например: 50000" className="num" />
                  <Select value={f.currency} onValueChange={v => setF(x => ({ ...x, currency: v }))}>
                    <SelectTrigger className="w-24" aria-label="Валюта">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Field>
            </>
          )}
          <Field label="Пригласить на мероприятие" hint="Человек попадёт в «Обзвон» на этап «Не звонили», хантером будете вы" className="sm:col-span-2">
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full" aria-label="Мероприятие">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не приглашать</SelectItem>
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                    <span className="num ml-1 text-xs text-muted-foreground">{formatDate(e.event_date)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!inBase && (
            <Field label="Заметка" htmlFor="base-note" className="sm:col-span-2">
              <Textarea id="base-note" value={f.note} maxLength={IG_NOTE_MAX} onChange={set('note')} placeholder="Что важно знать о клиенте" />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={save} disabled={busy || !f.name.trim() || (inBase && eventId === 'none')}>
            {busy ? 'Сохраняем…' : inBase ? 'Пригласить' : 'Сохранить в базу'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
