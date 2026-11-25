'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CalendarDays, CalendarPlus, Contact, Instagram, Pencil, Phone, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { Field } from '@/components/erp/field'
import { CURRENCIES, LEAD_SOURCES } from '@/lib/participant-profile'
import { CrmSearch, PersonAvatar } from '@/components/crm/parts'
import { useNav } from '@/components/app-shell/nav-context'
import { describeMark, funnelOf, type FunnelStage, type HistoryKind } from '@/lib/event-funnel'

interface Client {
  id: string
  name: string
  phone: string | null
  created_at: string
  kind: 'guest' | 'member' | 'archived'
  program: string | null
  city: string | null
  source: string | null
  activity: string | null
  business_name: string | null
  monthly_turnover: number | null
  currency: string
  instagram: string | null
}

interface CallEvent {
  id: string
  name: string
  event_date: string
}

type Kind = 'all' | 'guest' | 'member'

const KIND_LABEL = { guest: 'Гость', member: 'Участник', archived: 'Архив' } as const

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.error) {
    const e = new Error(body.error || `Ошибка ${res.status}`) as Error & { status?: number; existing?: { id: string; name: string } }
    e.status = res.status
    e.existing = body.existing
    throw e
  }
  return body as T
}

/** Upcoming events to invite to, nearest first. */
function useUpcomingEvents(on: boolean) {
  const [events, setEvents] = React.useState<CallEvent[]>([])
  React.useEffect(() => {
    if (!on) return
    api<{ data: CallEvent[] }>('/api/calls')
      .then(r => {
        const today = todayISO()
        setEvents((r.data ?? []).filter(e => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date)))
      })
      .catch(() => setEvents([]))
  }, [on])
  return events
}

const money = (n: number, currency: string) => `${formatNumber(n)} ${currency}`

interface ClientCardData {
  id: string
  name: string
  phone: string | null
  email: string | null
  created_at: string
  kind: 'guest' | 'member' | 'archived'
  program: string | null
  profile: { city: string | null; source: string | null; activity: string | null; business_name: string | null; monthly_turnover: number | null; currency: string; instagram: string | null }
  instagram: { username: string | null; stage: string; note: string | null } | null
  events: { attendee_id: string; event_id: string; name: string; event_date: string | null; stage: FunnelStage; hunter: string | null; next_contact_on: string | null }[]
  history: { id: string; kind: string | null; body: string; author_name: string | null; created_at: string; event: string | null }[]
}

/**
 * CRM → «Клиенты»: the client base like a chat list — search and filters on the left, the client's
 * card on the right (call, invite, contacts and business editable in place, events with their
 * «Обзвон» stage, the call history). «Новый клиент» adds people from the street, a call or a referral.
 */
export function ClientsPage() {
  const { navigate } = useNav()
  const [items, setItems] = React.useState<Client[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<Kind>('all')
  const [adding, setAdding] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [cardOpen, setCardOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await api<{ data: Client[] }>('/api/crm/clients')
      setItems(r.data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      setItems(i => i ?? [])
    }
  }, [])
  React.useEffect(() => {
    load()
  }, [load])

  const all = (items ?? []).filter(c => c.kind !== 'archived')
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const visible = all.filter(
    c =>
      (kind === 'all' || c.kind === kind) &&
      (!q ||
        [c.name, c.city, c.source, c.activity, c.business_name, c.instagram].some(v => v?.toLowerCase().includes(q)) ||
        (qDigits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(qDigits)))
  )
  const count = (k: Kind) => (k === 'all' ? all.length : all.filter(c => c.kind === k).length)
  const selected = visible.find(c => c.id === selectedId) ?? visible[0] ?? null

  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-r bg-card lg:flex lg:w-[22.5rem]', cardOpen && selected && 'max-lg:hidden')}>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <Contact className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold">Клиенты</h1>
            <p className="num text-xs text-muted-foreground">{items ? `${formatNumber(all.length)} ${plural(all.length, ['человек', 'человека', 'человек'])} в базе` : 'Загружаем…'}</p>
          </div>
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <UserPlus /> Новый
          </Button>
        </div>
        <div className="space-y-2 px-3 pb-2">
          <CrmSearch value={query} onChange={setQuery} placeholder="Имя, телефон, город или бизнес" />
          <Segmented
            size="sm"
            aria-label="Кто"
            className="grid w-full grid-cols-3"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'Все', count: count('all') },
              { value: 'guest', label: 'Гости', count: count('guest') },
              { value: 'member', label: 'Участники', count: count('member') },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t p-1.5">
          {items === null ? (
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
          ) : error && !all.length ? (
            <EmptyState icon={Contact} title="База не загрузилась" description={error} action={<Button size="sm" variant="outline" onClick={load}>Повторить</Button>} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Contact}
              title={all.length ? 'Никого не найдено' : 'В базе пока никого'}
              description={all.length ? 'Измените поиск или фильтр' : 'Добавьте первого клиента: с улицы, по звонку или рекомендации'}
            />
          ) : (
            visible.map(c => {
              const on = selected?.id === c.id
              const sub = [c.activity || c.business_name, c.city].filter(Boolean).join(' · ') || c.phone || 'нет телефона'
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id)
                    setCardOpen(true)
                  }}
                  aria-current={on || undefined}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30', on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                >
                  <PersonAvatar name={c.name} seed={c.id} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{c.name}</span>
                      <span className={cn('num shrink-0 text-xs', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{formatDate(c.created_at).slice(0, 5)}</span>
                    </span>
                    <span className={cn('truncate text-sm', on ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{sub}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', on ? 'bg-primary-foreground/20' : c.kind === 'guest' ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary-soft-foreground')}>{KIND_LABEL[c.kind]}</span>
                      {c.source && <span className={cn('rounded-md border px-1.5 text-[11px]', on ? 'border-primary-foreground/40' : 'text-muted-foreground')}>{c.source}</span>}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40 lg:flex', !cardOpen && 'max-lg:hidden')}>
        {selected ? (
          <ClientCard key={selected.id} id={selected.id} onBack={() => setCardOpen(false)} onChanged={load} onCalls={() => navigate('calls')} />
        ) : (
          <EmptyState className="m-auto" icon={Contact} title="Выберите клиента" description="Или добавьте нового: с улицы, по звонку, по рекомендации" />
        )}
      </section>

      <NewClientDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={id => {
          load()
          setSelectedId(id)
          setCardOpen(true)
        }}
      />
    </div>
  )
}

const STAGE_PILL: Record<string, string> = {
  secondary: 'bg-muted text-muted-foreground',
  warning: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
  default: 'bg-primary-soft text-primary-soft-foreground',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  destructive: 'bg-destructive-soft text-destructive',
}

function ClientCard({ id, onBack, onChanged, onCalls }: { id: string; onBack: () => void; onChanged: () => void; onCalls: () => void }) {
  const [data, setData] = React.useState<ClientCardData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const r = await api<{ data: ClientCardData }>(`/api/crm/clients/${id}`)
      setData(r.data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  React.useEffect(() => {
    load()
  }, [load])

  if (error) return <EmptyState className="m-auto" icon={Contact} title="Карточка не загрузилась" description={error} />
  if (!data) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }
  const p = data.profile
  const tel = data.phone ? `tel:${data.phone.replace(/[^\d+]/g, '')}` : null
  const facts: [string, React.ReactNode][] = [
    ['Телефон', data.phone],
    ['Город', p.city],
    ['Откуда пришёл', p.source],
    ['Чем занимается', p.activity],
    ['Название бизнеса', p.business_name],
    ['Оборот в месяц', p.monthly_turnover != null ? money(p.monthly_turnover, p.currency) : null],
    ['Instagram', p.instagram ? <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">@{p.instagram}</a> : null],
    ['Программа', data.program],
  ]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="К списку" onClick={onBack}>
            <ArrowLeft />
          </Button>
          <PersonAvatar name={data.name} seed={data.id} size="lg" />
          <div className="min-w-0 flex-[1_1_14rem]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{data.name}</h2>
              <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', data.kind === 'guest' ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary-soft-foreground')}>{KIND_LABEL[data.kind]}</span>
            </div>
            <p className="num mt-0.5 text-sm text-muted-foreground">В базе с {formatDate(data.created_at, 'long')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tel && (
              <a href={tel} className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white shadow-xs outline-none hover:bg-success/90 focus-visible:ring-[3px] focus-visible:ring-success/40">
                <Phone className="size-4" /> Позвонить
              </a>
            )}
            <Button type="button" variant="outline" className="h-10" onClick={() => setInviting(true)}>
              <CalendarPlus /> Пригласить
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Контакты и бизнес</h3>
            {!editing && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil /> Изменить
              </Button>
            )}
          </div>
          {editing ? (
            <EditClient
              data={data}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                load()
                onChanged()
              }}
            />
          ) : (
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={cn('mt-0.5 truncate text-sm', !value && 'text-muted-foreground/70')}>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Мероприятия</h3>
            {data.events.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={onCalls}>
                Открыть «Обзвон»
              </Button>
            )}
          </div>
          {data.events.length === 0 ? (
            <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Ещё никуда не приглашён(а).{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setInviting(true)}>
                Пригласить
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.events.map(e => {
                const st = funnelOf(e.stage)
                return (
                  <li key={e.attendee_id} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                    <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.name}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {e.event_date ? formatDate(e.event_date) : ''}
                        {e.hunter ? ` · хантер ${e.hunter}` : ''}
                        {e.next_contact_on ? ` · перезвонить ${formatDate(e.next_contact_on).slice(0, 5)}` : ''}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold', STAGE_PILL[st.variant])}>{st.label}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-xs xl:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">История</h3>
          {data.history.length === 0 && !data.instagram?.note ? (
            <p className="text-sm text-muted-foreground">Пока пусто: здесь появятся заметки из «Обзвона» и смена этапов</p>
          ) : (
            <ol className="space-y-2.5">
              {data.instagram?.note && (
                <li className="flex gap-3">
                  <Instagram className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm">
                    <p className="whitespace-pre-wrap">{data.instagram.note}</p>
                    <p className="text-xs text-muted-foreground">Заметка из Instagram</p>
                  </div>
                </li>
              )}
              {data.history.map(h => (
                <li key={h.id} className="flex gap-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', (h.kind || 'note') === 'note' ? 'bg-primary' : 'bg-muted-foreground/50')} />
                  <div className="min-w-0 text-sm">
                    <p className={cn('whitespace-pre-wrap', (h.kind || 'note') !== 'note' && 'text-muted-foreground')}>{describeMark({ kind: (h.kind || 'note') as HistoryKind, body: h.body })}</p>
                    <p className="num text-xs text-muted-foreground">
                      {h.author_name || 'Без имени'} · {formatDate(h.created_at)}
                      {h.event ? ` · ${h.event}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <InviteDialog
        client={inviting ? { id: data.id, name: data.name } : null}
        onClose={() => setInviting(false)}
        onDone={() => {
          setInviting(false)
          load()
        }}
      />
    </div>
  )
}

function EditClient({ data, onCancel, onSaved }: { data: ClientCardData; onCancel: () => void; onSaved: () => void }) {
  const p = data.profile
  const [f, setF] = React.useState({
    name: data.name,
    phone: data.phone ?? '',
    city: p.city ?? '',
    source: p.source ?? '',
    activity: p.activity ?? '',
    business_name: p.business_name ?? '',
    monthly_turnover: p.monthly_turnover == null ? '' : String(p.monthly_turnover),
    currency: p.currency || 'TJS',
    instagram: p.instagram ?? '',
  })
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  const save = async () => {
    if (!f.name.trim() || busy) return
    setBusy(true)
    try {
      await api(`/api/crm/clients/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: f.name,
          phone: f.phone,
          profile: { city: f.city, source: f.source, activity: f.activity, business_name: f.business_name, monthly_turnover: f.monthly_turnover, currency: f.currency, instagram: f.instagram },
        }),
      })
      toast.success('Сохранено')
      onSaved()
    } catch (e) {
      toast.error('Не удалось сохранить', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={e => {
        e.preventDefault()
        save()
      }}
    >
      <Field label="Имя и фамилия" htmlFor="ec-name" required className="sm:col-span-2">
        <Input id="ec-name" value={f.name} onChange={set('name')} />
      </Field>
      <Field label="Телефон" htmlFor="ec-phone">
        <Input id="ec-phone" type="tel" value={f.phone} onChange={set('phone')} />
      </Field>
      <Field label="Город" htmlFor="ec-city">
        <Input id="ec-city" value={f.city} onChange={set('city')} maxLength={100} />
      </Field>
      <Field label="Откуда пришёл" htmlFor="ec-source">
        <Input id="ec-source" list="ec-sources" value={f.source} onChange={set('source')} maxLength={100} />
        <datalist id="ec-sources">
          {LEAD_SOURCES.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Instagram" htmlFor="ec-instagram">
        <Input id="ec-instagram" value={f.instagram} onChange={set('instagram')} placeholder="ник" maxLength={100} />
      </Field>
      <Field label="Чем занимается" htmlFor="ec-activity">
        <Input id="ec-activity" value={f.activity} onChange={set('activity')} maxLength={200} />
      </Field>
      <Field label="Название бизнеса" htmlFor="ec-business">
        <Input id="ec-business" value={f.business_name} onChange={set('business_name')} maxLength={150} />
      </Field>
      <Field label="Оборот в месяц, примерно" htmlFor="ec-turnover" className="sm:col-span-2">
        <div className="flex gap-2">
          <Input id="ec-turnover" type="number" inputMode="decimal" min={0} value={f.monthly_turnover} onChange={set('monthly_turnover')} className="num" />
          <Select value={f.currency} onValueChange={v => setF(x => ({ ...x, currency: v }))}>
            <SelectTrigger className="w-24" aria-label="Валюта">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy || !f.name.trim()}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

const EMPTY = { name: '', phone: '', city: '', source: 'С улицы', activity: '', business_name: '', monthly_turnover: '', currency: 'TJS', instagram: '', note: '' }

/**
 * «Новый клиент»: someone who came in person, called or was referred. Saved as a guest with what is
 * known about the business; «Сохранить и ещё» keeps the form open for the next person.
 */
export function NewClientDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const [f, setF] = React.useState(EMPTY)
  const [eventId, setEventId] = React.useState('none')
  const [busy, setBusy] = React.useState(false)
  const [duplicate, setDuplicate] = React.useState<{ id: string; name: string } | null>(null)
  const events = useUpcomingEvents(open)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF(x => ({ ...x, [k]: e.target.value }))
    if (k === 'phone') setDuplicate(null)
  }

  React.useEffect(() => {
    if (open) {
      setF(EMPTY)
      setEventId('none')
      setDuplicate(null)
    }
  }, [open])

  const save = async (more: boolean, force = false) => {
    if (!f.name.trim() || busy) return
    setBusy(true)
    try {
      const r = await api<{ data: { id: string } }>('/api/crm/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: f.name,
          phone: f.phone,
          force,
          event_id: eventId === 'none' ? null : eventId,
          note: f.note,
          profile: {
            city: f.city,
            source: f.source,
            activity: f.activity,
            business_name: f.business_name,
            instagram: f.instagram,
            monthly_turnover: f.monthly_turnover,
            ...(f.monthly_turnover ? { currency: f.currency } : {}),
          },
        }),
      })
      const ev = events.find(e => e.id === eventId)
      toast.success(`${f.name.trim()} в базе клиентов`, { description: ev ? `Приглашён(а) на «${ev.name}», вы — хантер в «Обзвоне»` : undefined })
      onSaved?.(r.data.id)
      if (more) {
        setF(x => ({ ...EMPTY, source: x.source }))
        setDuplicate(null)
        nameRef.current?.focus()
      } else onClose()
    } catch (e) {
      const err = e as Error & { status?: number; existing?: { id: string; name: string } }
      if (err.status === 409 && err.existing) setDuplicate(err.existing)
      else toast.error('Не удалось сохранить', { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый клиент</DialogTitle>
          <DialogDescription>Пришёл сам, позвонил или по рекомендации. Появится в «Участниках» как гость</DialogDescription>
        </DialogHeader>
        <form
          id="new-client"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={e => {
            e.preventDefault()
            save(false)
          }}
        >
          <Field label="Имя и фамилия" htmlFor="nc-name" required className="sm:col-span-2">
            <Input id="nc-name" ref={nameRef} value={f.name} onChange={set('name')} autoComplete="off" autoFocus />
          </Field>
          <Field label="Телефон" htmlFor="nc-phone">
            <Input id="nc-phone" type="tel" inputMode="tel" placeholder="+992" value={f.phone} onChange={set('phone')} autoComplete="off" />
          </Field>
          <Field label="Город" htmlFor="nc-city">
            <Input id="nc-city" value={f.city} onChange={set('city')} placeholder="Например: Душанбе" maxLength={100} />
          </Field>
          {duplicate && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:col-span-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p>
                  С этим номером уже есть клиент: <b>{duplicate.name}</b>
                </p>
                <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => save(false, true)}>
                  Всё равно добавить нового
                </Button>
              </div>
            </div>
          )}
          <Field label="Откуда пришёл" htmlFor="nc-source">
            <Select value={f.source} onValueChange={v => setF(x => ({ ...x, source: v }))}>
              <SelectTrigger id="nc-source" className="w-full">
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
          <Field label="Instagram" htmlFor="nc-instagram">
            <Input id="nc-instagram" value={f.instagram} onChange={set('instagram')} placeholder="ник, если есть" maxLength={100} autoComplete="off" />
          </Field>
          <Field label="Чем занимается" htmlFor="nc-activity">
            <Input id="nc-activity" value={f.activity} onChange={set('activity')} placeholder="Например: кафе, стройматериалы" maxLength={200} />
          </Field>
          <Field label="Название бизнеса" htmlFor="nc-business">
            <Input id="nc-business" value={f.business_name} onChange={set('business_name')} placeholder="Необязательно" maxLength={150} />
          </Field>
          <Field label="Оборот в месяц, примерно" htmlFor="nc-turnover" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input id="nc-turnover" type="number" inputMode="decimal" min={0} value={f.monthly_turnover} onChange={set('monthly_turnover')} placeholder="Например: 50000" className="num" />
              <Select value={f.currency} onValueChange={v => setF(x => ({ ...x, currency: v }))}>
                <SelectTrigger className="w-24" aria-label="Валюта">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
          <EventPicker events={events} value={eventId} onChange={setEventId} />
          {eventId !== 'none' && (
            <Field label="Комментарий для обзвона" htmlFor="nc-note" className="sm:col-span-2">
              <Textarea id="nc-note" value={f.note} onChange={set('note')} placeholder="Что важно знать перед звонком" maxLength={2000} />
            </Field>
          )}
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !f.name.trim()} onClick={() => save(true)}>
              Сохранить и ещё
            </Button>
            <Button type="submit" form="new-client" disabled={busy || !f.name.trim()}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EventPicker({ events, value, onChange }: { events: CallEvent[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Пригласить на мероприятие" hint="Человек попадёт в «Обзвон» на этап «Не звонили», хантером будете вы" className="sm:col-span-2">
      <Select value={value} onValueChange={onChange}>
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
  )
}

function InviteDialog({ client, onClose, onDone }: { client: { id: string; name: string } | null; onClose: () => void; onDone?: () => void }) {
  const [eventId, setEventId] = React.useState('none')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const events = useUpcomingEvents(!!client)
  React.useEffect(() => {
    setEventId('none')
    setNote('')
  }, [client])

  const save = async () => {
    if (!client || eventId === 'none' || busy) return
    setBusy(true)
    try {
      await api(`/api/crm/clients/${client.id}/invite`, { method: 'POST', body: JSON.stringify({ event_id: eventId, note }) })
      toast.success(`${client.name} приглашён(а) на «${events.find(e => e.id === eventId)?.name}»`, { description: 'Человек появился в «Обзвоне», вы — хантер' })
      if (onDone) onDone()
      else onClose()
    } catch (e) {
      toast.error('Не удалось пригласить', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Пригласить на мероприятие</DialogTitle>
          <DialogDescription>{client?.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <EventPicker events={events} value={eventId} onChange={setEventId} />
          <Field label="Комментарий для обзвона" htmlFor="inv-note">
            <Textarea id="inv-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Необязательно" maxLength={2000} />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" onClick={save} disabled={busy || eventId === 'none'}>
            {busy ? 'Приглашаем…' : 'Пригласить'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
