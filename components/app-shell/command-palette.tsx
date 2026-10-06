'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { defaultFilter } from 'cmdk'
import {
  ArrowUpRight,
  CalendarDays,
  Loader2,
  Moon,
  Plus,
  Receipt,
  SearchX,
  Sun,
  UserSquare2,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { formatDate, formatMoney, MONTHS_RU } from '@/lib/format'
import { PAGES, type NavSection, type PageType, type UserRole } from '@/lib/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import type { CreateAction } from '@/components/app-shell/app-shell'

// ---------- Search API types ----------

interface SearchResults {
  q: string
  participants: { id: string; name: string; phone: string | null; email: string | null; status: string; program: string | null }[]
  employees: { id: string; name: string; position: string | null; department: string | null; status: string }[]
  events: { id: string; name: string; location: string | null; date: string | null; status: string }[]
  expenses: { id: string; name: string; category: string | null; amount: number; date: string | null }[]
  payments: {
    id: string
    participantId: string
    participantName: string
    month: number
    year: number
    plan: number
    fact: number
    status: string
    paidDate: string | null
  }[]
}

interface RecordHit {
  key: string
  title: string
  subtitle: string
  icon: LucideIcon
  page: PageType
  action: string
  id: string
}

interface RecordGroup {
  id: string
  heading: string
  hits: RecordHit[]
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 200
const RECORD_PREFIX = 'record:'

const PARTICIPANT_STATUS_LABEL: Record<string, string> = { archived: 'Архив', completed: 'Завершил обучение' }
const EVENT_STATUS_LABEL: Record<string, string> = { completed: 'Завершено', cancelled: 'Отменено' }

function paymentStatusLabel(p: SearchResults['payments'][number]) {
  if (p.plan > 0 && p.fact >= p.plan - 0.01) return 'Оплачен'
  if (p.fact > 0) return 'Частично'
  if (p.status === 'overdue') return 'Просрочен'
  return 'Ожидается'
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

function toGroups(r: SearchResults): RecordGroup[] {
  const groups: RecordGroup[] = [
    {
      id: 'participants',
      heading: 'Участники',
      hits: r.participants.map(p => ({
        key: `participant:${p.id}`,
        title: p.name,
        subtitle: join('Участник', p.program, p.phone || p.email, PARTICIPANT_STATUS_LABEL[p.status]),
        icon: Users,
        page: 'participants',
        action: 'open-participant',
        id: p.id,
      })),
    },
    {
      id: 'payments',
      heading: 'Платежи участников',
      hits: r.payments.map(p => ({
        key: `payment:${p.id}`,
        title: p.participantName,
        subtitle: join(
          `Платёж за ${(MONTHS_RU[p.month - 1] ?? '').toLowerCase()} ${p.year}`,
          `${formatMoney(p.fact)} из ${formatMoney(p.plan)}`,
          paymentStatusLabel(p)
        ),
        icon: Receipt,
        page: 'participants',
        action: 'open-participant',
        id: p.participantId,
      })),
    },
    {
      id: 'employees',
      heading: 'Сотрудники',
      hits: r.employees.map(e => ({
        key: `employee:${e.id}`,
        title: e.name,
        subtitle: join('Сотрудник', e.position, e.department, e.status !== 'active' && 'Не работает'),
        icon: UserSquare2,
        page: 'employees',
        action: 'open-employee',
        id: e.id,
      })),
    },
    {
      id: 'events',
      heading: 'Мероприятия',
      hits: r.events.map(e => ({
        key: `event:${e.id}`,
        title: e.name,
        subtitle: join('Мероприятие', e.date && formatDate(e.date), e.location, EVENT_STATUS_LABEL[e.status]),
        icon: CalendarDays,
        page: 'offline',
        action: 'open-event',
        id: e.id,
      })),
    },
    {
      id: 'expenses',
      heading: 'Расходы',
      hits: r.expenses.map(e => ({
        key: `expense:${e.id}`,
        title: e.name,
        subtitle: join('Расход', formatMoney(e.amount), e.date && formatDate(e.date), e.category),
        icon: ArrowUpRight,
        page: 'income',
        action: 'open-expense',
        id: e.id,
      })),
    },
  ]
  return groups.filter(g => g.hits.length > 0)
}

/** Debounced record search; stale requests are aborted. */
function useRecordSearch(query: string, role: UserRole) {
  const [state, setState] = React.useState<{ groups: RecordGroup[]; loading: boolean; error: boolean; settledQuery: string }>({
    groups: [],
    loading: false,
    error: false,
    settledQuery: '',
  })

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) {
      setState({ groups: [], loading: false, error: false, settledQuery: '' })
      return
    }
    // Keep the previous results on screen while the next ones load
    setState(s => ({ ...s, loading: true, error: false }))
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, role })
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal })
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
        setState({ groups: toGroups(json as SearchResults), loading: false, error: false, settledQuery: q })
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setState({ groups: [], loading: false, error: true, settledQuery: q })
      }
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, role])

  return state
}

/** Record hits always pass cmdk's filter (the server already matched them) and sort first. */
function paletteFilter(value: string, search: string, keywords?: string[]) {
  if (value.startsWith(RECORD_PREFIX)) return 1
  return defaultFilter ? defaultFilter(value, search, keywords) : 1
}

export function CommandPalette({
  open,
  onOpenChange,
  role,
  sections,
  createActions,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  role: UserRole
  sections: NavSection[]
  createActions: CreateAction[]
  onNavigate: (p: PageType, action?: string, payload?: Record<string, unknown>) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[16%] sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">Поиск и команды</DialogTitle>
        {/* Mounted only while open, so the query resets every time */}
        <PaletteBody
          role={role}
          sections={sections}
          createActions={createActions}
          onNavigate={onNavigate}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function PaletteBody({
  role,
  sections,
  createActions,
  onNavigate,
  onClose,
}: {
  role: UserRole
  sections: NavSection[]
  createActions: CreateAction[]
  onNavigate: (p: PageType, action?: string, payload?: Record<string, unknown>) => void
  onClose: () => void
}) {
  const { setTheme } = useTheme()
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState('')
  const { groups, loading, error, settledQuery } = useRecordSearch(search, role)
  const q = search.trim()
  const searching = q.length >= MIN_QUERY
  const hasRecords = searching && groups.length > 0

  // When fresh results arrive, highlight the best record so Enter opens it
  const firstKey = hasRecords ? `${RECORD_PREFIX}${groups[0].hits[0].key}` : ''
  React.useEffect(() => {
    if (firstKey) setSelected(firstKey)
  }, [firstKey, settledQuery])

  const runRecord = (hit: RecordHit) => onNavigate(hit.page, hit.action, { id: hit.id })

  return (
    <Command loop filter={paletteFilter} value={selected} onValueChange={setSelected}>
      <div className="relative">
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Найти участника, сотрудника, расход или раздел"
          autoFocus
          className="pr-8"
        />
        {loading && (
          <Loader2
            className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-label="Ищем"
          />
        )}
      </div>
      <CommandList className="max-h-[min(440px,60dvh)]">
        <CommandEmpty>
          {searching && loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Ищем записи…
            </span>
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-6">
              <SearchX className="size-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Ничего не нашли по запросу «{q}»</span>
              <span className="text-xs">Ищите по имени, телефону, email, должности, названию события или расхода</span>
            </div>
          )}
        </CommandEmpty>

        {searching && error && (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            Не удалось найти записи. Проверьте соединение и попробуйте ещё раз.
          </p>
        )}

        {hasRecords &&
          groups.map(g => (
            <CommandGroup key={g.id} heading={g.heading} value={`${RECORD_PREFIX}group:${g.id}`}>
              {g.hits.map(hit => (
                <CommandItem
                  key={hit.key}
                  value={`${RECORD_PREFIX}${hit.key}`}
                  onSelect={() => runRecord(hit)}
                  className="py-1.5"
                >
                  <hit.icon />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{hit.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

        {createActions.length > 0 && (
          <CommandGroup heading="Создать">
            {createActions.map(a => (
              <CommandItem key={a.id} value={`создать ${a.label} ${a.hint}`} onSelect={() => onNavigate(a.page, a.id)}>
                <Plus />
                Новое: {a.label.toLowerCase()}
                <span className="text-muted-foreground max-sm:hidden">— {a.hint.toLowerCase()}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {sections.map(s => (
          <CommandGroup key={s.id} heading={s.label}>
            {s.pages.map(id => {
              const p = PAGES[id]
              return (
                <CommandItem key={id} value={`${p.label} ${p.title} ${s.label} ${p.description}`} onSelect={() => onNavigate(id)}>
                  <p.icon />
                  {p.label}
                  <CommandShortcut className="max-sm:hidden">{p.description}</CommandShortcut>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
        <CommandGroup heading="Оформление">
          <CommandItem value="тема светлая" onSelect={() => { setTheme('light'); onClose() }}>
            <Sun /> Светлая тема
          </CommandItem>
          <CommandItem value="тема тёмная темная" onSelect={() => { setTheme('dark'); onClose() }}>
            <Moon /> Тёмная тема
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-4 border-t px-3.5 py-2 text-xs text-muted-foreground max-sm:hidden">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> выбрать</span>
        <span><Kbd>Enter</Kbd> открыть</span>
        <span><Kbd>Esc</Kbd> закрыть</span>
        {!searching && <span className="ml-auto">Поиск по записям — от {MIN_QUERY} символов</span>}
      </div>
    </Command>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-card px-1.5 py-px font-sans text-[11px] text-muted-foreground">{children}</kbd>
}
