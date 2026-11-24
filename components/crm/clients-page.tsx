'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CalendarPlus, Contact, Instagram, Phone, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchInput } from '@/components/erp/search-input'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { Field } from '@/components/erp/field'
import { CURRENCIES, LEAD_SOURCES } from '@/lib/participant-profile'
import { PersonAvatar } from '@/components/crm/parts'

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

/**
 * CRM → «Клиенты»: the whole client base in one list (guests and participants, from Instagram or
 * from the street), with a big «Новый клиент» for people who came in person, called or were referred.
 */
export function ClientsPage() {
  const [items, setItems] = React.useState<Client[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<Kind>('all')
  const [adding, setAdding] = React.useState(false)
  const [inviting, setInviting] = React.useState<Client | null>(null)

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2.5 sm:px-4">
        <div className="mr-2 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
            <Contact className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-bold">Клиенты</h1>
            <p className="num text-xs text-muted-foreground">
              {items ? `${formatNumber(all.length)} ${plural(all.length, ['человек', 'человека', 'человек'])} в базе` : 'Загружаем…'}
            </p>
          </div>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Имя, телефон, город или бизнес" className="min-w-0 flex-[1_1_14rem] sm:max-w-80" />
        <Segmented
          aria-label="Кто"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Все', count: count('all') },
            { value: 'guest', label: 'Гости', count: count('guest') },
            { value: 'member', label: 'Участники', count: count('member') },
          ]}
        />
        <Button type="button" className="ml-auto" onClick={() => setAdding(true)}>
          <UserPlus /> Новый клиент
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3 sm:p-4">
        {items === null ? (
          <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : error && !all.length ? (
          <EmptyState icon={Contact} title="База не загрузилась" description={error} action={<Button size="sm" variant="outline" onClick={load}>Повторить</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={all.length ? 'Никого не найдено' : 'В базе пока никого'}
            description={all.length ? 'Измените поиск или фильтр' : 'Добавьте первого клиента: с улицы, по звонку или рекомендации'}
            action={
              <Button size="sm" onClick={() => setAdding(true)}>
                <UserPlus /> Новый клиент
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {visible.map(c => (
              <li key={c.id} className="flex items-start gap-3 rounded-xl border bg-card p-3 shadow-xs">
                <PersonAvatar name={c.name} seed={c.id} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', c.kind === 'guest' ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary-soft-foreground')}>
                      {KIND_LABEL[c.kind]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                    {c.phone ? (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="num inline-flex items-center gap-1 text-foreground/85 hover:text-primary hover:underline">
                        <Phone className="size-3.5" /> {c.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">нет телефона</span>
                    )}
                    {c.instagram && (
                      <a href={`https://instagram.com/${c.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
                        <Instagram className="size-3.5" /> {c.instagram}
                      </a>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.activity || c.business_name, c.city, c.monthly_turnover != null ? `${money(c.monthly_turnover, c.currency)} в мес.` : null].filter(Boolean).join(' · ') || 'О бизнесе ещё ничего'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {c.source && <span className="rounded-md border px-1.5 text-[11px] text-muted-foreground">{c.source}</span>}
                    <span className="num text-[11px] text-muted-foreground">в базе с {formatDate(c.created_at)}</span>
                    <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => setInviting(c)}>
                      <CalendarPlus /> Пригласить
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewClientDialog open={adding} onClose={() => setAdding(false)} onSaved={load} />
      <InviteDialog client={inviting} onClose={() => setInviting(null)} />
    </div>
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

function InviteDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
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
      onClose()
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
