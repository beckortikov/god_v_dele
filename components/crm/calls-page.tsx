'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Columns3, List, Pencil, Phone, PhoneCall, SearchX, SendHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, todayISO } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchInput } from '@/components/erp/search-input'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { CrmSearch, enterSends, useTouchKeyboard } from '@/components/crm/parts'
import { readPref, writePref } from '@/components/finance/types'
import { funnelDot, type StageFilter } from '@/components/events/funnel-strip'
import { commentTime, postComment } from '@/components/events/attendee-comments'
import { attendeeContact, attendeeName, telHref, type Attendee } from '@/components/events/types'
import { BoardCard, CallbackPicker, HunterPicker, StageStepper, addDaysISO, type AttendeePatch, type StaffMember } from '@/components/calls/call-parts'
import {
  COMMENT_MAX,
  FUNNEL,
  FUNNEL_STAGES,
  contactDue,
  describeMark,
  funnelOf,
  splitChange,
  type AttendeeComment,
  type FunnelStage,
  type FunnelVariant,
  type TeamRow,
} from '@/lib/event-funnel'

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
const STATS_PREF = 'calls-stats'

const QUICK_NOTES = ['Не берёт трубку', 'Попросил(а) перезвонить вечером', 'Думает, обсудит с партнёром', 'Отправили программу в Telegram', 'Подтвердил(а) участие']

/** Stage pill colours, by the stage's badge variant. */
const PILL: Record<FunnelVariant, string> = {
  secondary: 'bg-muted text-muted-foreground',
  warning: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
  default: 'bg-primary-soft text-primary-soft-foreground',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  destructive: 'bg-destructive-soft text-destructive',
}

const AVATAR_TONES = ['bg-[oklch(0.62_0.15_45)]', 'bg-[oklch(0.55_0.15_255)]', 'bg-[oklch(0.52_0.17_295)]', 'bg-[oklch(0.5_0.09_185)]', 'bg-[oklch(0.55_0.16_350)]', 'bg-[oklch(0.56_0.12_75)]']

const attendeeUrl = (eventId: string, attendeeId: string) => `/api/calls/${eventId}/attendees/${attendeeId}`
const stageOf = (a: Attendee) => (a.funnel_stage || 'new') as FunnelStage
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || '·'
const toneOf = (id: string) => AVATAR_TONES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length]
const firstName = (n: string | null | undefined) => (n || '').split(' ')[0]

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

const isDue = (a: Attendee, today: string) => {
  const d = contactDue(a.next_contact_on, today)
  return d === 'overdue' || d === 'today'
}
const byName = (x: Attendee, y: Attendee) => attendeeName(x).localeCompare(attendeeName(y), 'ru')

/** «Перезвонить» first (oldest date first), then each stage in funnel order. */
function groupQueue(rows: Attendee[], today: string) {
  const due = rows.filter(a => isDue(a, today)).sort((x, y) => (x.next_contact_on || '').localeCompare(y.next_contact_on || '') || byName(x, y))
  const groups: { id: string; title: string; urgent?: boolean; items: Attendee[] }[] = []
  if (due.length) groups.push({ id: 'due', title: 'Перезвонить', urgent: true, items: due })
  for (const s of FUNNEL) {
    const items = rows.filter(a => !isDue(a, today) && stageOf(a) === s.value).sort(byName)
    if (items.length) groups.push({ id: s.value, title: s.label, items })
  }
  return groups
}

/** Change the stage with the page's rules: nothing to chase after «Оплатил» / «Не поедет»; no answer → tomorrow. */
function stagePatch(a: Attendee, s: FunnelStage, today: string): AttendeePatch {
  const p: AttendeePatch = { funnel_stage: s }
  if ((s === 'paid' || s === 'declined') && a.next_contact_on) p.next_contact_on = null
  if (s === 'no_answer' && !a.next_contact_on) p.next_contact_on = addDaysISO(today, 1)
  return p
}

/**
 * «Обзвон» in the CRM: a call queue on the left (who to call back first, then by stage),
 * the person on the right with a big «Позвонить», the funnel as steps and the history as a chat.
 * A board with a column per stage and the event's totals are one click away. No event money.
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
  const [showStats, setShowStatsState] = React.useState(() => readPref(STATS_PREF) !== 'off')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  // Phones: the queue and the person take turns on screen
  const [personOpen, setPersonOpen] = React.useState(false)
  const [feedKey, setFeedKey] = React.useState(0)

  const setView = (v: View) => {
    writePref(VIEW_PREF, v)
    setViewState(v)
  }
  const setHunter = (h: HunterFilter) => {
    writePref(HUNTER_PREF, h)
    setHunterState(h)
  }
  const setShowStats = (on: boolean) => {
    writePref(STATS_PREF, on ? 'on' : 'off')
    setShowStatsState(on)
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
    setSelectedId(null)
    setPersonOpen(false)
    setEventId(id)
  }

  /** Applied at once, saved in the background, rolled back on error. */
  const patch = async (a: Attendee, p: AttendeePatch) => {
    if (!eventId) return
    // Whoever is being worked on stays on screen even if the change moves them out of the filter
    setSelectedId(a.id)
    const prev = rows
    const hunterName = 'hunter_id' in p ? (p.hunter_id ? staff.find(s => s.id === p.hunter_id)?.name ?? null : null) : a.hunter_name
    setRows(list => (list ?? []).map(x => (x.id === a.id ? { ...x, ...p, hunter_name: hunterName } : x)))
    try {
      const res = await fetch(attendeeUrl(eventId, a.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || result.error) throw new Error(result.error || `Ошибка ${res.status}`)
      if (p.funnel_stage === 'no_answer' && p.next_contact_on) toast.info(`${attendeeName(a)}: перезвонить завтра`)
      setFeedKey(k => k + 1)
      load(eventId)
    } catch (err: any) {
      setRows(prev)
      toast.error('Не удалось сохранить', { description: err.message })
    }
  }

  const today = todayISO()
  const all = rows ?? []
  const mineCount = me ? all.filter(a => a.hunter_id === me).length : 0
  const hunterFilter: HunterFilter =
    hunter ??
    (() => {
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
    ...staff.filter(s => hunterCounts.has(s.id) && s.id !== me).map(s => ({ value: s.id, label: firstName(s.name), count: hunterCounts.get(s.id) })),
    ...(noHunter ? [{ value: 'none', label: 'Без хантера', count: noHunter }] : []),
  ]

  const ofHunter = all.filter(a =>
    hunterFilter === 'all' ? true : hunterFilter === 'mine' ? a.hunter_id === me : hunterFilter === 'none' ? !a.hunter_id : a.hunter_id === hunterFilter
  )
  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const matches = (a: Attendee) => {
    if (!q) return true
    const contact = attendeeContact(a)
    if (qDigits.length >= 3 && contact.replace(/\D/g, '').includes(qDigits)) return true
    return [attendeeName(a), contact, a.hunter_name, a.last_comment?.body].some(v => v?.toLowerCase().includes(q))
  }
  const searched = ofHunter.filter(matches)
  const visible = searched.filter(a => (stageFilter === 'due' ? isDue(a, today) : stageFilter === 'all' || stageOf(a) === stageFilter))
  const groups = groupQueue(visible, today)
  const flat = groups.flatMap(g => g.items)
  // The chosen person stays open even when a stage change takes them out of the list or filter
  const current = (selectedId ? all.find(a => a.id === selectedId) : null) ?? flat[0] ?? null
  const outOfList = !!current && !flat.some(a => a.id === current.id)

  const counts = Object.fromEntries(FUNNEL_STAGES.map(st => [st, ofHunter.filter(a => stageOf(a) === st).length])) as Record<FunnelStage, number>
  const dueCount = ofHunter.filter(a => isDue(a, today)).length
  const stageChips: { value: StageFilter; label: string; dot: string; count: number }[] = [
    { value: 'all', label: 'Все', dot: 'bg-foreground', count: ofHunter.length },
    { value: 'due', label: 'Перезвонить', dot: 'bg-destructive', count: dueCount },
    ...FUNNEL.map(s => ({ value: s.value as StageFilter, label: s.label, dot: funnelDot[s.variant], count: counts[s.value] })),
  ]

  const open = (a: Attendee) => {
    setSelectedId(a.id)
    setPersonOpen(true)
  }
  const next = () => {
    if (!current || !flat.length || (flat.length < 2 && !outOfList)) return
    const i = flat.findIndex(a => a.id === current.id)
    setSelectedId(flat[i < 0 ? 0 : (i + 1) % flat.length].id)
  }

  const loading = events === null || (eventId && rows === null)
  const nothing = !loading && (!events?.length || !all.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Event, search, view */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2.5 sm:px-4">
        {events && events.length > 0 && (
          <Select value={eventId ?? undefined} onValueChange={chooseEvent}>
            <SelectTrigger className="h-10 w-full min-w-0 gap-2 font-semibold sm:w-auto sm:min-w-72 [&>span]:truncate" aria-label="Мероприятие">
              <CalendarDays className="size-4 text-muted-foreground" />
              <SelectValue placeholder="Мероприятие" />
            </SelectTrigger>
            <SelectContent align="start">
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
        )}
        {view === 'board' && (
          <SearchInput value={query} onChange={v => { setQuery(v); setSelectedId(null) }} placeholder="Имя, телефон или комментарий" className="min-w-0 flex-[1_1_12rem] sm:max-w-80" />
        )}
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            aria-label="Вид"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: (<><List className="size-3.5" />Список</>) },
              { value: 'board', label: (<><Columns3 className="size-3.5" />Доска</>) },
            ]}
          />
          <Button type="button" variant={showStats ? 'soft' : 'outline'} size="sm" className="hidden xl:inline-flex" aria-pressed={showStats} onClick={() => setShowStats(!showStats)}>
            <BarChart3 /> Итоги
          </Button>
        </div>
      </div>

      {/* Whose and which stage */}
      {!loading && !nothing && (
        <div className="flex flex-col gap-2 border-b bg-card px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="w-10 shrink-0 text-xs text-muted-foreground">Чьи</span>
            <Segmented size="sm" aria-label="Хантер" value={hunterFilter} onChange={v => { setHunter(v); setSelectedId(null) }} options={hunterOptions} />
          </div>
          <div role="radiogroup" aria-label="Этап" className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="w-10 shrink-0 text-xs text-muted-foreground">Этап</span>
            {stageChips.map(c => {
              const on = stageFilter === c.value
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setStageFilter(on && c.value !== 'all' ? 'all' : c.value)
                    setSelectedId(null)
                  }}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                    on ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground/80 hover:bg-muted'
                  )}
                >
                  <span className={cn('size-2 rounded-full', on && c.value === 'all' ? 'bg-background' : c.dot)} />
                  {c.label}
                  <span className={cn('num', on ? 'opacity-80' : 'text-muted-foreground')}>{c.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {loading ? (
          <div className="flex-1 space-y-2 p-4">
            {[0, 1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full max-w-md rounded-xl" />
            ))}
          </div>
        ) : error && !all.length ? (
          <EmptyState className="flex-1" icon={SearchX} title="Не удалось загрузить" description={error} />
        ) : nothing ? (
          <EmptyState
            className="flex-1"
            icon={PhoneCall}
            title={events?.length ? 'В списке пока никого' : 'Мероприятий пока нет'}
            description="Людей в мероприятие добавляет финансист или администратор на странице «Оффлайн-события»"
          />
        ) : view === 'board' ? (
          <Board
            rows={searched}
            staff={staff}
            me={me}
            today={today}
            onPatch={patch}
            onOpen={a => {
              setStageFilter('all')
              setView('list')
              open(a)
            }}
          />
        ) : (
          <>
            <Queue
              search={
                <div className="space-y-1.5">
                  <CrmSearch value={query} onChange={v => { setQuery(v); setSelectedId(null) }} placeholder="Поиск: имя, телефон, комментарий" />
                  {query.trim() && (
                    <p className="num px-1 text-xs text-muted-foreground">
                      {flat.length ? `Найдено: ${flat.length}` : 'Никого не нашлось'}
                    </p>
                  )}
                </div>
              }
              groups={groups}
              current={current}
              me={me}
              today={today}
              onPick={open}
              hidden={personOpen && !!current}
              onReset={() => {
                setStageFilter('all')
                setHunter('all')
                setQuery('')
              }}
            />
            {current && eventId && (
              <PersonPane
                key={current.id}
                a={current}
                base={attendeeUrl(eventId, current.id)}
                staff={staff}
                me={me}
                today={today}
                feedKey={feedKey}
                hidden={!personOpen}
                hasNext={flat.length > 1 || (outOfList && flat.length > 0)}
                outOfList={outOfList}
                onPin={() => setSelectedId(current.id)}
                onBack={() => setPersonOpen(false)}
                onNext={next}
                onPatch={patch}
                onNoted={() => eventId && load(eventId)}
              />
            )}
          </>
        )}

        {showStats && !loading && !nothing && <StatsPanel rows={all} team={team} onStage={s => { setStageFilter(s); setHunter('all'); setView('list'); setSelectedId(null) }} />}
      </div>
    </div>
  )
}

function Avatar({ a, size = 'md' }: { a: Attendee; size?: 'md' | 'lg' }) {
  const guest = a.attendee_type === 'guest'
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'lg' ? 'size-14 text-lg' : 'size-11 text-sm',
        guest ? 'border-2 border-info bg-card text-info' : cn(toneOf(a.id), 'text-white')
      )}
    >
      {initials(attendeeName(a))}
    </span>
  )
}

function DueTag({ a, today, onDark }: { a: Attendee; today: string; onDark?: boolean }) {
  const d = contactDue(a.next_contact_on, today)
  if (!d || !a.next_contact_on) return null
  const label = d === 'overdue' ? `просрочено · ${formatDate(a.next_contact_on).slice(0, 5)}` : d === 'today' ? 'сегодня' : formatDate(a.next_contact_on).slice(0, 5)
  return (
    <span
      className={cn(
        'num rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        onDark
          ? 'bg-primary-foreground/20 text-primary-foreground'
          : d === 'overdue'
            ? 'bg-destructive-soft text-destructive'
            : d === 'today'
              ? 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]'
              : 'bg-muted text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}

function Queue({
  groups,
  current,
  me,
  today,
  onPick,
  onReset,
  hidden,
  search,
}: {
  search: React.ReactNode
  groups: ReturnType<typeof groupQueue>
  current: Attendee | null
  me: string | null
  today: string
  onPick: (a: Attendee) => void
  onReset: () => void
  hidden: boolean
}) {
  return (
    <aside className={cn('flex min-h-0 w-full shrink-0 flex-col border-r bg-card lg:flex lg:w-[22.5rem]', hidden && 'hidden')}>
      <div className="border-b p-2.5">{search}</div>
      <nav aria-label="Очередь звонков" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.length === 0 && (
          <EmptyState
            icon={PhoneCall}
            title="Никого не найдено"
            description="Измените поиск, этап или хантера"
            action={
              <Button size="sm" variant="outline" onClick={onReset}>
                Сбросить фильтры
              </Button>
            }
          />
        )}
        {groups.map(g => (
          <section key={g.id} aria-label={g.title}>
            <h2 className={cn('flex items-center px-2.5 pt-3 pb-1.5 text-xs font-semibold', g.urgent ? 'text-destructive' : 'text-muted-foreground')}>
              {g.title}
              <span className="num ml-auto font-medium">{g.items.length}</span>
            </h2>
            {g.items.map(a => {
              const on = current?.id === a.id
              const stage = funnelOf(a.funnel_stage)
              const sub = a.last_comment?.body || attendeeContact(a) || 'нет телефона'
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onPick(a)}
                  aria-current={on || undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                    on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  <Avatar a={a} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{attendeeName(a)}</span>
                      {a.hunter_name && (
                        <span
                          title={`Хантер: ${a.hunter_name}`}
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                            on ? 'bg-primary-foreground/25 text-primary-foreground' : a.hunter_id === me ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {initials(a.hunter_name)}
                        </span>
                      )}
                    </span>
                    <span className={cn('truncate text-[13px]', on ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{sub}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', on ? 'bg-primary-foreground/20 text-primary-foreground' : PILL[stage.variant])}>{stage.label}</span>
                      <DueTag a={a} today={today} onDark={on} />
                      {a.attendee_type === 'guest' && (
                        <span className={cn('rounded-md border px-1.5 text-[11px]', on ? 'border-primary-foreground/40' : 'text-muted-foreground')}>гость</span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </section>
        ))}
      </nav>
    </aside>
  )
}

function PersonPane({
  a,
  base,
  staff,
  me,
  today,
  feedKey,
  hidden,
  hasNext,
  outOfList,
  onPin,
  onBack,
  onNext,
  onPatch,
  onNoted,
}: {
  a: Attendee
  base: string
  staff: StaffMember[]
  me: string | null
  today: string
  feedKey: number
  hidden: boolean
  hasNext: boolean
  outOfList: boolean
  onPin: () => void
  onBack: () => void
  onNext: () => void
  onPatch: (a: Attendee, p: AttendeePatch) => void
  onNoted: () => void
}) {
  const name = attendeeName(a)
  const contact = attendeeContact(a)
  const tel = telHref(contact)
  const stage = stageOf(a)
  const myName = staff.find(s => s.id === me)?.name ?? null
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [reload, setReload] = React.useState(0)
  const noteRef = React.useRef<HTMLTextAreaElement>(null)
  const touch = useTouchKeyboard()

  const save = async () => {
    // What is in the field right now, not the last rendered state: a keyboard may still be finishing a word
    const t = (noteRef.current?.value ?? draft).trim()
    if (!t || sending) return
    onPin()
    setSending(true)
    try {
      await postComment(base, t)
      setDraft('')
      setReload(k => k + 1)
      onNoted()
    } catch (err: any) {
      toast.error('Не удалось сохранить комментарий', { description: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-label={name} className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-muted/50 lg:flex', hidden && 'hidden')}>
      <header className="space-y-3 border-b bg-card px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="К очереди" onClick={onBack}>
            <ArrowLeft />
          </Button>
          <Avatar a={a} size="lg" />
          <div className="min-w-0 flex-[1_1_12rem]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold">{name}</h1>
              <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', a.attendee_type === 'guest' ? 'bg-info-soft text-info' : 'bg-primary-soft text-primary-soft-foreground')}>
                {a.attendee_type === 'guest' ? 'Гость' : 'Участник программы'}
              </span>
            </div>
            <p className="num mt-0.5 text-[15px] text-foreground/80">{contact || 'Телефона нет'}</p>
          </div>
          {tel && (
            <a
              href={tel}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white shadow-xs transition-colors outline-none hover:bg-success/90 focus-visible:ring-[3px] focus-visible:ring-success/40"
            >
              <Phone className="size-4" /> Позвонить
            </a>
          )}
        </div>

        <StageStepper value={stage} onChange={s => onPatch(a, stagePatch(a, s, today))} name={name} />

        <div className="flex flex-wrap items-center gap-2">
          <HunterPicker value={a.hunter_id} staff={staff} me={me} onChange={id => onPatch(a, { hunter_id: id })} />
          {stage !== 'paid' && stage !== 'declined' && <CallbackPicker value={a.next_contact_on} today={today} onChange={d => onPatch(a, { next_contact_on: d })} />}
          {a.last_mark && (
            <span className="truncate text-xs text-muted-foreground">
              Этап поставил(а) {a.last_mark.author_name || 'без имени'} · <span className="num">{commentTime(a.last_mark.created_at)}</span>
            </span>
          )}
          {hasNext && (
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onNext}>
              Следующий <ArrowRight />
            </Button>
          )}
        </div>
      </header>

      {outOfList && (
        <p className="border-b bg-info-soft px-4 py-2 text-xs text-info">Человек больше не подходит под фильтр, но остаётся открытым, пока вы не выберете другого</p>
      )}
      <Feed base={base} myName={myName} reloadKey={reload + feedKey} onChanged={onNoted} />

      <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 scrollbar-none sm:px-4">
        {QUICK_NOTES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setDraft(t)}
            className="h-8 shrink-0 rounded-full border bg-card px-3 text-xs font-medium text-foreground/80 transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {t}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2 px-3 pt-2 pb-3 sm:px-4"
        onSubmit={e => {
          e.preventDefault()
          save()
        }}
      >
        <label htmlFor="call-note" className="sr-only">
          Что сказал(а) {name}
        </label>
        <textarea
          id="call-note"
          ref={noteRef}
          rows={1}
          value={draft}
          maxLength={COMMENT_MAX}
          onFocus={onPin}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (enterSends(e)) {
              e.preventDefault()
              save()
            }
          }}
          placeholder={touch ? 'Что сказал…' : 'Что сказал… Enter — сохранить'}
          className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none rounded-3xl border bg-card px-4 py-2.5 text-[15px] shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Сохранить комментарий" className="size-11 shrink-0 rounded-full">
          <SendHorizontal />
        </Button>
      </form>
    </section>
  )
}

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = (x: Date) => x.toDateString()
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (day(d) === day(today)) return 'Сегодня'
  if (day(d) === day(yesterday)) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** The person's history as a chat: notes as bubbles (yours on the right), actions as service lines. */
function Feed({ base, myName, reloadKey, onChanged }: { base: string; myName: string | null; reloadKey: number; onChanged: () => void }) {
  const [items, setItems] = React.useState<AttendeeComment[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<{ id: string; text: string } | null>(null)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const confirm = useConfirm()

  const saveEdit = async () => {
    if (!editing || savingEdit) return
    const text = editing.text.trim()
    if (!text) return
    setSavingEdit(true)
    try {
      const res = await fetch(`${base}/comments/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b.error) throw new Error(b.error || `Ошибка ${res.status}`)
      setItems(list => (list ?? []).map(x => (x.id === editing.id ? { ...x, body: b.data?.body ?? text, edited_at: b.data?.edited_at ?? new Date().toISOString() } : x)))
      setEditing(null)
      onChanged()
    } catch (err: any) {
      toast.error('Не удалось изменить', { description: err.message })
    } finally {
      setSavingEdit(false)
    }
  }

  React.useEffect(() => {
    let live = true
    getJson(`${base}/comments`)
      .then(b => live && (setItems(b.data ?? []), setError(null)))
      .catch(e => live && setError(e.message))
    return () => {
      live = false
    }
  }, [base, reloadKey])

  const remove = async (c: AttendeeComment) => {
    const ok = await confirm({ title: 'Удалить комментарий?', description: c.body.slice(0, 140), confirmText: 'Удалить', destructive: true })
    if (!ok) return
    try {
      const res = await fetch(`${base}/comments/${c.id}`, { method: 'DELETE' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b.error) throw new Error(b.error || `Ошибка ${res.status}`)
      setItems(list => (list ?? []).filter(x => x.id !== c.id))
      onChanged()
    } catch (err: any) {
      toast.error('Не удалось удалить', { description: err.message })
    }
  }

  // Oldest first, a date line whenever the day changes
  const ordered = [...(items ?? [])].reverse()
  const lines: React.ReactNode[] = []
  let lastDay = ''
  ordered.forEach((c, i) => {
    const day = dayLabel(c.created_at)
    if (day !== lastDay) {
      lastDay = day
      lines.push(
        <div key={`d-${c.id}`} className="flex justify-center py-2">
          <span className="rounded-full bg-foreground/55 px-3 py-0.5 text-xs font-medium text-background">{day}</span>
        </div>
      )
    }
    const kind = c.kind || 'note'
    if (kind !== 'note') {
      const variant = kind === 'stage' ? funnelOf(splitChange(c.body).to).variant : 'secondary'
      lines.push(
        <div key={c.id} className="flex justify-center py-0.5">
          <span className={cn('max-w-[90%] rounded-full px-3 py-1 text-center text-xs font-medium', PILL[variant])}>
            {firstName(c.author_name) || 'Система'}: {describeMark(c)} · <span className="num">{clock(c.created_at)}</span>
          </span>
        </div>
      )
      return
    }
    const mine = !!myName && c.author_name === myName
    const prev = ordered[i - 1]
    const sameAuthor = prev && (prev.kind || 'note') === 'note' && prev.author_name === c.author_name && dayLabel(prev.created_at) === day
    const isEditing = editing?.id === c.id
    const actions = c.can_delete && !isEditing && (
      <span className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <button type="button" onClick={() => setEditing({ id: c.id, text: c.body })} aria-label="Изменить комментарий" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
          <Pencil className="size-3.5" />
        </button>
        <button type="button" onClick={() => remove(c)} aria-label="Удалить комментарий" className="rounded-md p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </span>
    )
    lines.push(
      <div key={c.id} className={cn('group flex items-end gap-1.5 py-0.5', mine ? 'justify-end' : 'justify-start')}>
        {mine && actions}
        {isEditing ? (
          <form
            className="flex w-full max-w-[min(36rem,90%)] flex-col gap-2 rounded-2xl border bg-card p-2 shadow-xs"
            onSubmit={e => {
              e.preventDefault()
              saveEdit()
            }}
          >
            <label htmlFor={`edit-${c.id}`} className="sr-only">
              Изменить комментарий
            </label>
            <textarea
              id={`edit-${c.id}`}
              autoFocus
              onFocus={e => {
                const end = e.currentTarget.value.length
                e.currentTarget.setSelectionRange(end, end)
              }}
              value={editing.text}
              maxLength={COMMENT_MAX}
              onChange={e => setEditing({ id: c.id, text: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Escape') setEditing(null)
                else if (enterSends(e)) {
                  e.preventDefault()
                  saveEdit()
                }
              }}
              className="field-sizing-content min-h-16 resize-none rounded-xl bg-muted/50 px-3 py-2 text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
            <span className="flex justify-end gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={savingEdit}>
                Отмена
              </Button>
              <Button type="submit" size="sm" disabled={savingEdit || !editing.text.trim()}>
                {savingEdit ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </span>
          </form>
        ) : (
          <div
            className={cn(
              'max-w-[min(36rem,80%)] px-3 pt-1.5 pb-1 text-[15px] leading-snug shadow-xs',
              mine ? 'rounded-[18px_18px_6px_18px] bg-primary text-primary-foreground' : 'rounded-[18px_18px_18px_6px] bg-card'
            )}
          >
            {!mine && !sameAuthor && <span className={cn('block text-[13px] font-semibold', c.author_name ? 'text-primary' : 'text-muted-foreground')}>{c.author_name || 'Импорт'}</span>}
            <span className="whitespace-pre-wrap">{c.body}</span>
            <span className={cn('num float-right mt-1.5 ml-2.5 text-[11px]', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {c.edited_at && <span title={`Изменено ${new Date(c.edited_at).toLocaleString('ru-RU')}`}>изменено · </span>}
              {clock(c.created_at)}
            </span>
          </div>
        )}
        {!mine && actions}
      </div>
    )
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-3 py-3 sm:px-6">
      <div className="flex flex-col">
        {items === null && !error && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
          </div>
        )}
        {error && <p className="text-center text-sm text-muted-foreground">История не загрузилась: {error}</p>}
        {items?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Пока никто не звонил. Напишите, что сказал человек.</p>}
        {lines}
      </div>
    </div>
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
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-3 sm:p-4">
      <div className="grid min-w-max auto-cols-[15rem] grid-flow-col items-start gap-2.5 2xl:min-w-0 2xl:auto-cols-auto 2xl:grid-flow-row 2xl:grid-cols-6">
        {FUNNEL.map(s => {
          const items = rows
            .filter(a => stageOf(a) === s.value)
            .sort((x, y) => Number(isDue(y, today)) - Number(isDue(x, today)) || byName(x, y))
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
                const a = rows.find(x => x.id === e.dataTransfer.getData('text/attendee'))
                if (a && stageOf(a) !== s.value) onPatch(a, stagePatch(a, s.value, today))
              }}
              className={cn('flex min-h-48 flex-col rounded-2xl border-2 border-transparent bg-muted p-2 transition-colors', over === s.value && 'border-primary bg-primary-soft/60')}
            >
              <header className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-semibold">
                <span className={cn('size-2.5 rounded-full', funnelDot[s.variant])} />
                {s.label}
                <span className="num ml-auto font-medium text-muted-foreground">{formatNumber(items.length)}</span>
              </header>
              <div className="flex flex-col gap-1.5">
                {items.map(a => (
                  <BoardCard key={a.id} a={a} staff={staff} me={me} today={today} onOpen={onOpen} onPatch={onPatch} />
                ))}
                {items.length === 0 && <p className="rounded-xl border border-dashed px-2 py-5 text-center text-xs text-muted-foreground">Перетащите сюда</p>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** The event at a glance: a bar per stage, and who did the calling (admin and finance only). */
function StatsPanel({ rows, team, onStage }: { rows: Attendee[]; team: TeamRow[] | undefined; onStage: (s: FunnelStage) => void }) {
  const total = rows.length
  const count = (s: FunnelStage) => rows.filter(a => stageOf(a) === s).length
  return (
    <aside aria-label="Итоги" className="hidden w-80 shrink-0 overflow-y-auto border-l bg-card xl:block">
      <div className="space-y-4 border-b p-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Воронка мероприятия</p>
          <p className="num mt-0.5 text-3xl font-bold">
            {formatNumber(total)} <span className="text-sm font-medium text-muted-foreground">в списке</span>
          </p>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={FUNNEL.map(s => `${s.label} ${count(s.value)}`).join(', ')}>
          {FUNNEL.map(s => (
            <span key={s.value} className={funnelDot[s.variant]} style={{ width: `${total ? (count(s.value) / total) * 100 : 0}%` }} />
          ))}
        </div>
        <ul className="space-y-0.5">
          {FUNNEL.map(s => {
            const n = count(s.value)
            return (
              <li key={s.value}>
                <button type="button" onClick={() => onStage(s.value)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30">
                  <span className={cn('size-2.5 rounded-full', funnelDot[s.variant])} />
                  <span className="flex-1">{s.label}</span>
                  <span className="num font-semibold">{n}</span>
                  <span className="num w-10 text-right text-muted-foreground">{total ? Math.round((n / total) * 100) : 0}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {team && (
        <div className="space-y-2.5 p-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Кто вёл обзвон</p>
            <p className="text-xs text-muted-foreground">Видят администратор и финансист</p>
          </div>
          {team.length === 0 && <p className="text-sm text-muted-foreground">Пока никто не отмечал</p>}
          {team.map(t => (
            <div key={t.name} className="space-y-2 rounded-xl bg-muted/60 p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-card text-[11px] font-bold">{initials(t.name)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                <span className="num text-xs text-muted-foreground">{t.people} чел.</span>
              </div>
              <dl className="grid grid-cols-4 gap-1 text-center text-[11px] text-muted-foreground">
                {[
                  ['заметок', t.notes, ''],
                  ['отметок', t.marks, ''],
                  ['поедут', t.going, 'text-info'],
                  ['оплатили', t.paid, 'text-success'],
                ].map(([label, n, tone]) => (
                  <div key={label as string} className="flex flex-col-reverse">
                    <dt>{label}</dt>
                    <dd className={cn('num text-[15px] font-bold text-foreground', tone as string)}>{n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
