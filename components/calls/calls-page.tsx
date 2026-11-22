'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarDays, Phone, PhoneCall, SearchX } from 'lucide-react'
import { formatDate, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer, PageHeader, Panel, PanelToolbar } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton, TotalsBar } from '@/components/erp/table-parts'
import { Field, FieldGroup } from '@/components/erp/field'
import { readPref, writePref } from '@/components/finance/types'
import { ChipGroup } from '@/components/events/parts'
import { FunnelStrip, type StageFilter } from '@/components/events/funnel-strip'
import { CallbackCell, PersonCell, StageCell, TeamPanel } from '@/components/events/funnel-parts'
import { AttendeeComments, postComment } from '@/components/events/attendee-comments'
import { attendeeContact, attendeeName, telHref, type Attendee } from '@/components/events/types'
import { FUNNEL, FUNNEL_STAGES, contactDue, type FunnelStage, type TeamRow } from '@/lib/event-funnel'

interface CallEvent {
  id: string
  name: string
  event_date: string
  location?: string | null
  status: string
  total: number
  counts: Record<FunnelStage, number>
}

const LAST_EVENT = 'calls-event'

const attendeeUrl = (eventId: string, attendeeId: string) => `/api/calls/${eventId}/attendees/${attendeeId}`

/** The nearest upcoming event, else the latest one. */
function pickDefault(events: CallEvent[]) {
  const saved = readPref(LAST_EVENT)
  if (saved && events.some(e => e.id === saved)) return saved
  const today = todayISO()
  const upcoming = events.filter(e => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))
  return (upcoming[0] ?? events[0])?.id ?? null
}

async function getJson(url: string) {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) throw new Error(body.message || body.error || `Ошибка ${res.status}`)
  return body
}

/**
 * «Обзвон»: the people invited to an event, their phones, funnel stage, callback date and notes.
 * For employees and managers who make the calls (from their own phones); no event money here.
 * Every mark is saved with who made it, so the administrator sees who did what.
 */
export function CallsPage() {
  const [events, setEvents] = React.useState<CallEvent[] | null>(null)
  const [eventId, setEventId] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<Attendee[] | null>(null)
  const [team, setTeam] = React.useState<TeamRow[] | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [stageFilter, setStageFilter] = React.useState<StageFilter>('all')
  const [open, setOpen] = React.useState<Attendee | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  React.useEffect(() => {
    getJson('/api/calls')
      .then(b => {
        setEvents(b.data ?? [])
        setEventId(pickDefault(b.data ?? []))
      })
      .catch(e => {
        setError(e.message)
        setEvents([])
      })
  }, [])

  const load = React.useCallback(async (id: string) => {
    try {
      const b = await getJson(`/api/calls/${id}`)
      setRows(b.data ?? [])
      setTeam(b.team)
    } catch (e: any) {
      setError(e.message)
      setRows([])
    }
  }, [])

  React.useEffect(() => {
    if (!eventId) return
    setRows(null)
    load(eventId)
  }, [eventId, load])

  const chooseEvent = (id: string) => {
    writePref(LAST_EVENT, id)
    setStageFilter('all')
    setQuery('')
    setEventId(id)
  }

  const changeStage = async (a: Attendee, stage: FunnelStage) => {
    if (!eventId || stage === (a.funnel_stage || 'new')) return
    const done = stage === 'paid' || stage === 'declined'
    const patch = { funnel_stage: stage, ...(done && a.next_contact_on ? { next_contact_on: null } : {}) }
    const prev = rows
    setRows(list => (list ?? []).map(x => (x.id === a.id ? { ...x, ...patch } : x)))
    try {
      const res = await fetch(attendeeUrl(eventId, a.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      load(eventId)
    } catch (err: any) {
      setRows(prev)
      toast.error('Не удалось изменить этап', { description: err.message })
    }
  }

  const today = todayISO()
  const list = rows ?? []
  const isDue = (a: Attendee) => {
    const d = contactDue(a.next_contact_on, today)
    return d === 'overdue' || d === 'today'
  }
  const counts = Object.fromEntries(FUNNEL_STAGES.map(st => [st, list.filter(a => (a.funnel_stage || 'new') === st).length])) as Record<FunnelStage, number>
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const visible = list
    .filter(a => {
      if (stageFilter === 'due' ? !isDue(a) : stageFilter !== 'all' && (a.funnel_stage || 'new') !== stageFilter) return false
      if (!q) return true
      const contact = attendeeContact(a)
      if (qDigits.length >= 3 && contact.replace(/\D/g, '').includes(qDigits)) return true
      return [attendeeName(a), contact, a.last_comment?.body].some(v => v?.toLowerCase().includes(q))
    })
    .sort((x, y) => (stageFilter === 'due' ? (x.next_contact_on || '').localeCompare(y.next_contact_on || '') : attendeeName(x).localeCompare(attendeeName(y), 'ru')))

  const current = events?.find(e => e.id === eventId)

  return (
    <PageContainer>
      <PageHeader
        title="Обзвон"
        description="Кого приглашаем на мероприятие: этап, когда перезвонить и что сказал. Каждая отметка сохраняется с именем того, кто её сделал."
        actions={
          events && events.length > 0 && (
            <Select value={eventId ?? undefined} onValueChange={chooseEvent}>
              <SelectTrigger size="sm" className="min-w-64" aria-label="Мероприятие">
                <SelectValue placeholder="Мероприятие" />
              </SelectTrigger>
              <SelectContent align="end">
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="truncate">{e.name}</span>
                    <span className="num ml-1 text-xs text-muted-foreground">
                      {formatDate(e.event_date)} · {formatNumber(e.total)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {current && (
        <div className="-mt-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {formatDate(current.event_date, 'long')}
          </span>
          {current.location && <span>{current.location}</span>}
          <span>
            {formatNumber(current.total)} {plural(current.total, ['человек', 'человека', 'человек'])} в списке
          </span>
        </div>
      )}

      {events === null || (eventId && rows === null) ? (
        <TableSkeleton rows={6} />
      ) : error && !list.length ? (
        <Panel>
          <EmptyState icon={SearchX} title="Не удалось загрузить" description={error} />
        </Panel>
      ) : !events.length ? (
        <Panel>
          <EmptyState
            icon={PhoneCall}
            title="Мероприятий пока нет"
            description="Когда финансист заведёт мероприятие и добавит в него людей, здесь появится список для обзвона"
          />
        </Panel>
      ) : (
        <>
          {list.length > 0 && <FunnelStrip counts={counts} due={list.filter(isDue).length} total={list.length} value={stageFilter} onChange={setStageFilter} />}
          <Panel>
            {list.length > 0 && (
              <PanelToolbar>
                <SearchInput value={query} onChange={setQuery} placeholder="Имя, телефон или комментарий" className="sm:w-72" />
              </PanelToolbar>
            )}
            {visible.length === 0 ? (
              <EmptyState
                icon={PhoneCall}
                title={list.length ? 'Никого не найдено' : 'В списке пока никого'}
                description={list.length ? 'Измените поиск или этап' : 'Людей в мероприятие добавляет финансист или администратор'}
                action={
                  list.length > 0 && stageFilter !== 'all' ? (
                    <Button size="sm" variant="outline" onClick={() => setStageFilter('all')}>
                      Показать все этапы
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Имя</TableHead>
                      <TableHead>Этап</TableHead>
                      <TableHead className="max-md:hidden">Перезвонить</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map(a => (
                      <TableRow
                        key={a.id}
                        className="group cursor-pointer"
                        onClick={() => {
                          setOpen(a)
                          setSheetOpen(true)
                        }}
                      >
                        <TableCell className="max-w-96 whitespace-normal">
                          <PersonCell a={a} />
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <StageCell a={a} onStage={changeStage} />
                        </TableCell>
                        <TableCell className="max-md:hidden">
                          <CallbackCell a={a} today={today} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TotalsBar
                  label={`${formatNumber(visible.length)} ${plural(visible.length, ['человек', 'человека', 'человек'])}`}
                  value={`оплатили ${formatNumber(visible.filter(a => a.funnel_stage === 'paid').length)}`}
                />
              </>
            )}
          </Panel>
          <TeamPanel team={team} />
        </>
      )}

      {eventId && (
        <CallSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          eventId={eventId}
          attendee={open}
          onSaved={() => load(eventId)}
        />
      )}
    </PageContainer>
  )
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const funnelOptions = FUNNEL.map(f => ({ value: f.value, label: f.label }))

/** One person: stage, when to call back, and the history of notes and marks. */
function CallSheet({
  open,
  onOpenChange,
  eventId,
  attendee,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  eventId: string
  attendee: Attendee | null
  onSaved: () => void
}) {
  const [stage, setStage] = React.useState<FunnelStage>('new')
  const [nextContact, setNextContact] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open || !attendee) return
    setStage(attendee.funnel_stage || 'new')
    setNextContact(attendee.next_contact_on?.slice(0, 10) || '')
    setDraft('')
  }, [open, attendee])

  if (!attendee) return null
  const base = attendeeUrl(eventId, attendee.id)
  const contact = attendeeContact(attendee)
  const tel = telHref(contact)
  const closing = stage === 'paid' || stage === 'declined'

  const submit = async () => {
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      if (stage !== (attendee.funnel_stage || 'new')) patch.funnel_stage = stage
      const nc = closing ? null : nextContact || null
      if (nc !== (attendee.next_contact_on?.slice(0, 10) || null)) patch.next_contact_on = nc
      if (Object.keys(patch).length) {
        const res = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      }
      if (draft.trim()) await postComment(base, draft.trim())
      toast.success('Сохранено', { description: attendeeName(attendee) })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      toast.error('Не удалось сохранить', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form
          className="flex h-full flex-col"
          onSubmit={e => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{attendeeName(attendee)}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{attendee.attendee_type === 'guest' ? 'Гость' : 'Участник программы'}</span>
              {contact && (
                <>
                  <span aria-hidden>·</span>
                  {tel ? (
                    <a href={tel} className="num inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
                      <Phone className="size-3.5" />
                      {contact}
                    </a>
                  ) : (
                    <span className="num">{contact}</span>
                  )}
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field label="Этап приглашения">
                <ChipGroup aria-label="Этап приглашения" value={stage} onChange={setStage} options={funnelOptions} />
              </Field>
              {!closing && (
                <Field
                  label="Перезвонить"
                  htmlFor="call-next"
                  aside={
                    nextContact && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setNextContact('')}>
                        Убрать
                      </button>
                    )
                  }
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input id="call-next" type="date" value={nextContact} onChange={e => setNextContact(e.target.value)} className="w-40" />
                    {[
                      { label: 'Завтра', days: 1 },
                      { label: 'Через 3 дня', days: 3 },
                      { label: 'Через неделю', days: 7 },
                    ].map(o => (
                      <Button key={o.days} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNextContact(addDaysISO(todayISO(), o.days))}>
                        {o.label}
                      </Button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="История и комментарии" htmlFor="att-comment">
                {open && <AttendeeComments base={base} draft={draft} setDraft={setDraft} onChanged={onSaved} />}
              </Field>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">⌘/Ctrl + Enter</span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
