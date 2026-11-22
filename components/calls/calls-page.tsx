'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { CalendarDays, Columns3, List, Phone, PhoneCall, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, plural, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { SearchInput } from '@/components/erp/search-input'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { TableSkeleton } from '@/components/erp/table-parts'
import { Field, FieldGroup } from '@/components/erp/field'
import { readPref, writePref } from '@/components/finance/types'
import { FunnelStrip, funnelDot, type StageFilter } from '@/components/events/funnel-strip'
import { TeamPanel } from '@/components/events/funnel-parts'
import { AttendeeComments, postComment } from '@/components/events/attendee-comments'
import { attendeeContact, attendeeName, telHref, type Attendee } from '@/components/events/types'
import { FUNNEL, FUNNEL_STAGES, contactDue, type FunnelStage, type TeamRow } from '@/lib/event-funnel'
import {
  BoardCard,
  CallCard,
  CallbackPicker,
  HunterPicker,
  StageStepper,
  addDaysISO,
  type AttendeePatch,
  type StaffMember,
} from '@/components/calls/call-parts'

interface CallEvent {
  id: string
  name: string
  event_date: string
  location?: string | null
  status: string
  total: number
  counts: Record<FunnelStage, number>
}

type HunterFilter = 'all' | 'mine' | 'none' | string
type View = 'list' | 'board'

const LAST_EVENT = 'calls-event'
const VIEW_PREF = 'calls-view'
const HUNTER_PREF = 'calls-hunter'

const attendeeUrl = (eventId: string, attendeeId: string) => `/api/calls/${eventId}/attendees/${attendeeId}`
const stageOf = (a: Attendee) => (a.funnel_stage || 'new') as FunnelStage

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

/** Work order: callbacks that are due, then by stage (new first), then by name. */
function workOrder(today: string) {
  const rank = (a: Attendee) => {
    const d = contactDue(a.next_contact_on, today)
    return d === 'overdue' ? 0 : d === 'today' ? 1 : 2
  }
  return (x: Attendee, y: Attendee) =>
    rank(x) - rank(y) ||
    (rank(x) < 2 ? (x.next_contact_on || '').localeCompare(y.next_contact_on || '') : 0) ||
    FUNNEL_STAGES.indexOf(stageOf(x)) - FUNNEL_STAGES.indexOf(stageOf(y)) ||
    attendeeName(x).localeCompare(attendeeName(y), 'ru')
}

/**
 * «Обзвон»: the people invited to an event for the staff who call them (from their own phones).
 * Filter «Мои» / by hunter, the funnel as steps on every card, a comment box right under each
 * person, history unfolding in place, and a board with a column per stage. No event money here.
 */
export function CallsPage() {
  const [events, setEvents] = React.useState<CallEvent[] | null>(null)
  const [eventId, setEventId] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<Attendee[] | null>(null)
  const [team, setTeam] = React.useState<TeamRow[] | undefined>(undefined)
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [me, setMe] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [stageFilter, setStageFilter] = React.useState<StageFilter>('all')
  const [hunter, setHunterState] = React.useState<HunterFilter | null>(null)
  const [view, setViewState] = React.useState<View>(() => (readPref(VIEW_PREF) === 'board' ? 'board' : 'list'))
  const [sheetFor, setSheetFor] = React.useState<Attendee | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const setView = (v: View) => {
    writePref(VIEW_PREF, v)
    setViewState(v)
  }
  const setHunter = (h: HunterFilter) => {
    writePref(HUNTER_PREF, h)
    setHunterState(h)
  }

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
      setStaff(b.staff ?? [])
      setMe(b.me ?? null)
      setError(null)
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

  /** Applied at once, saved in the background, rolled back on error. */
  const patch = async (a: Attendee, p: AttendeePatch) => {
    if (!eventId) return
    const prev = rows
    const hunterName = 'hunter_id' in p ? (p.hunter_id ? staff.find(s => s.id === p.hunter_id)?.name ?? null : null) : a.hunter_name
    setRows(list => (list ?? []).map(x => (x.id === a.id ? { ...x, ...p, hunter_name: hunterName } : x)))
    setSheetFor(s => (s?.id === a.id ? { ...s, ...p, hunter_name: hunterName } : s))
    try {
      const res = await fetch(attendeeUrl(eventId, a.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      if (p.funnel_stage === 'no_answer' && p.next_contact_on) toast.info(`${attendeeName(a)}: перезвонить завтра`)
      load(eventId)
    } catch (err: any) {
      setRows(prev)
      toast.error('Не удалось сохранить', { description: err.message })
    }
  }

  const today = todayISO()
  const all = rows ?? []
  const mineCount = me ? all.filter(a => a.hunter_id === me).length : 0
  // «Мои» by default when the caller has people; otherwise everyone
  const hunterFilter: HunterFilter = hunter ?? (() => {
    const saved = readPref(HUNTER_PREF)
    if (saved && (saved === 'all' || saved === 'none' || saved === 'mine' || staff.some(s => s.id === saved))) return saved === 'mine' && !mineCount ? 'all' : saved
    return mineCount ? 'mine' : 'all'
  })()

  const hunterCounts = new Map<string, number>()
  for (const a of all) if (a.hunter_id) hunterCounts.set(a.hunter_id, (hunterCounts.get(a.hunter_id) ?? 0) + 1)
  const noHunter = all.filter(a => !a.hunter_id).length
  const hunterOptions: { value: HunterFilter; label: React.ReactNode; count?: number }[] = [
    ...(me && mineCount ? [{ value: 'mine', label: 'Мои', count: mineCount }] : []),
    { value: 'all', label: 'Все', count: all.length },
    ...staff.filter(s => hunterCounts.has(s.id) && s.id !== me).map(s => ({ value: s.id, label: s.name.split(' ')[0], count: hunterCounts.get(s.id) })),
    ...(noHunter ? [{ value: 'none', label: 'Без хантера', count: noHunter }] : []),
  ]

  const ofHunter = all.filter(a =>
    hunterFilter === 'all' ? true : hunterFilter === 'mine' ? a.hunter_id === me : hunterFilter === 'none' ? !a.hunter_id : a.hunter_id === hunterFilter
  )
  const isDue = (a: Attendee) => {
    const d = contactDue(a.next_contact_on, today)
    return d === 'overdue' || d === 'today'
  }
  const counts = Object.fromEntries(FUNNEL_STAGES.map(st => [st, ofHunter.filter(a => stageOf(a) === st).length])) as Record<FunnelStage, number>
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const matches = (a: Attendee) => {
    if (!q) return true
    const contact = attendeeContact(a)
    if (qDigits.length >= 3 && contact.replace(/\D/g, '').includes(qDigits)) return true
    return [attendeeName(a), contact, a.hunter_name, a.last_comment?.body].some(v => v?.toLowerCase().includes(q))
  }
  const searched = ofHunter.filter(matches)
  const visible = searched
    .filter(a => (stageFilter === 'due' ? isDue(a) : stageFilter === 'all' || stageOf(a) === stageFilter))
    .sort(workOrder(today))

  const current = events?.find(e => e.id === eventId)
  const openSheet = (a: Attendee) => {
    setSheetFor(a)
    setSheetOpen(true)
  }

  return (
    <PageContainer>
      <PageHeader
        title="Обзвон"
        description="Отмечайте этап одним нажатием и пишите, что сказал человек. Каждая отметка сохраняется с вашим именем."
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
            {formatNumber(all.length)} {plural(all.length, ['человек', 'человека', 'человек'])} в списке
          </span>
        </div>
      )}

      {events === null || (eventId && rows === null) ? (
        <TableSkeleton rows={6} />
      ) : error && !all.length ? (
        <Panel>
          <EmptyState icon={SearchX} title="Не удалось загрузить" description={error} />
        </Panel>
      ) : !events.length || !all.length ? (
        <Panel>
          <EmptyState
            icon={PhoneCall}
            title={events.length ? 'В списке пока никого' : 'Мероприятий пока нет'}
            description="Людей в мероприятие добавляет финансист или администратор на странице «Оффлайн-события»"
          />
        </Panel>
      ) : (
        <>
          {/* Whose people: mine, a hunter, nobody's */}
          <div className="-mx-3 mb-3 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented aria-label="Хантер" value={hunterFilter} onChange={setHunter} options={hunterOptions} />
          </div>

          <FunnelStrip counts={counts} due={ofHunter.filter(isDue).length} total={ofHunter.length} value={stageFilter} onChange={setStageFilter} />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Имя, телефон, хантер или комментарий" className="min-w-0 flex-1 sm:max-w-80" />
            <Segmented
              size="sm"
              aria-label="Вид"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: (<><List className="size-3.5" />Список</>) },
                { value: 'board', label: (<><Columns3 className="size-3.5" />Доска</>) },
              ]}
            />
          </div>

          {view === 'list' ? (
            visible.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={PhoneCall}
                  title="Никого не найдено"
                  description="Измените поиск, этап или хантера"
                  action={
                    stageFilter !== 'all' ? (
                      <Button size="sm" variant="outline" onClick={() => setStageFilter('all')}>
                        Показать все этапы
                      </Button>
                    ) : undefined
                  }
                />
              </Panel>
            ) : (
              <div className="grid gap-2.5 xl:grid-cols-2">
                {visible.map(a => (
                  <CallCard
                    key={a.id}
                    a={a}
                    base={attendeeUrl(eventId!, a.id)}
                    staff={staff}
                    me={me}
                    today={today}
                    onPatch={patch}
                    onNoted={() => eventId && load(eventId)}
                  />
                ))}
              </div>
            )
          ) : (
            <Board rows={searched} staff={staff} me={me} today={today} onPatch={patch} onOpen={openSheet} />
          )}

          <TeamPanel team={team} />
        </>
      )}

      {eventId && (
        <CallSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          base={sheetFor ? attendeeUrl(eventId, sheetFor.id) : ''}
          attendee={sheetFor}
          staff={staff}
          me={me}
          today={today}
          onPatch={patch}
          onNoted={() => load(eventId)}
        />
      )}
    </PageContainer>
  )
}

/** A column per stage; drag a card to another column to move the person. */
function Board({
  rows,
  staff,
  me,
  today,
  onPatch,
  onOpen,
}: {
  rows: Attendee[]
  staff: StaffMember[]
  me: string | null
  today: string
  onPatch: (a: Attendee, p: AttendeePatch) => void
  onOpen: (a: Attendee) => void
}) {
  const [over, setOver] = React.useState<FunnelStage | null>(null)
  const sorted = [...rows].sort(workOrder(today))
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-max auto-cols-[16rem] grid-flow-col gap-2.5 xl:min-w-0 xl:auto-cols-auto xl:grid-flow-row xl:grid-cols-6">
        {FUNNEL.map(s => {
          const items = sorted.filter(a => stageOf(a) === s.value)
          return (
            <section
              key={s.value}
              aria-label={s.label}
              onDragOver={e => {
                e.preventDefault()
                setOver(s.value)
              }}
              onDragLeave={() => setOver(o => (o === s.value ? null : o))}
              onDrop={e => {
                e.preventDefault()
                setOver(null)
                const id = e.dataTransfer.getData('text/attendee')
                const a = rows.find(x => x.id === id)
                if (!a || stageOf(a) === s.value) return
                const p: AttendeePatch = { funnel_stage: s.value }
                if ((s.value === 'paid' || s.value === 'declined') && a.next_contact_on) p.next_contact_on = null
                if (s.value === 'no_answer' && !a.next_contact_on) p.next_contact_on = addDaysISO(today, 1)
                onPatch(a, p)
              }}
              className={cn('flex min-h-40 flex-col rounded-xl border bg-muted/40 p-2 transition-colors', over === s.value && 'border-primary bg-primary-soft/40')}
            >
              <header className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium">
                <span className={cn('size-2 rounded-full', funnelDot[s.variant])} />
                {s.label}
                <span className="num ml-auto text-muted-foreground">{formatNumber(items.length)}</span>
              </header>
              <div className="flex flex-col gap-1.5">
                {items.map(a => (
                  <BoardCard key={a.id} a={a} staff={staff} me={me} today={today} onOpen={onOpen} onPatch={onPatch} />
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">Перетащите сюда</p>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Board card opened: the same controls as a list card, in a side sheet. */
function CallSheet({
  open,
  onOpenChange,
  base,
  attendee,
  staff,
  me,
  today,
  onPatch,
  onNoted,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  base: string
  attendee: Attendee | null
  staff: StaffMember[]
  me: string | null
  today: string
  onPatch: (a: Attendee, p: AttendeePatch) => Promise<void>
  onNoted: () => void
}) {
  const [draft, setDraft] = React.useState('')
  const [reloadKey, setReloadKey] = React.useState(0)
  React.useEffect(() => {
    if (open) setDraft('')
  }, [open, attendee?.id])
  if (!attendee) return null
  const contact = attendeeContact(attendee)
  const tel = telHref(contact)
  const stage = stageOf(attendee)

  const changeStage = async (s: FunnelStage) => {
    const p: AttendeePatch = { funnel_stage: s }
    if ((s === 'paid' || s === 'declined') && attendee.next_contact_on) p.next_contact_on = null
    if (s === 'no_answer' && !attendee.next_contact_on) p.next_contact_on = addDaysISO(today, 1)
    await onPatch(attendee, p)
    setReloadKey(k => k + 1)
  }

  const close = async () => {
    if (draft.trim()) {
      try {
        await postComment(base, draft.trim())
        onNoted()
      } catch (err: any) {
        toast.error('Комментарий не сохранён', { description: err.message })
        return
      }
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={o => (o ? onOpenChange(true) : close())}>
      <SheetContent>
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
            <Field label="Хантер">
              <div>
                <HunterPicker value={attendee.hunter_id} staff={staff} me={me} onChange={id => onPatch(attendee, { hunter_id: id })} />
              </div>
            </Field>
            <Field label="Этап">
              <StageStepper value={stage} onChange={changeStage} name={attendeeName(attendee)} />
            </Field>
            {stage !== 'paid' && stage !== 'declined' && (
              <Field label="Когда перезвонить">
                <div>
                  <CallbackPicker value={attendee.next_contact_on} today={today} onChange={d => onPatch(attendee, { next_contact_on: d })} />
                </div>
              </Field>
            )}
            <Field label="История и комментарии" htmlFor="att-comment">
              <AttendeeComments base={base} draft={draft} setDraft={setDraft} onChanged={onNoted} reloadKey={reloadKey} />
            </Field>
          </FieldGroup>
        </SheetBody>
        <SheetFooter>
          <Button type="button" onClick={close}>
            Готово
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">Этап и хантер сохраняются сразу</span>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
