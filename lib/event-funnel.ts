/**
 * Invitation funnel for an event (e.g. a mastermind): which stage each person is at,
 * when to contact them again, and call comments. Calls themselves happen on a phone;
 * the app only keeps track. Stored values are English, labels Russian (migration 025).
 */

export const FUNNEL_STAGES = ['new', 'no_answer', 'thinking', 'going', 'paid', 'declined'] as const
export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export type FunnelVariant = 'secondary' | 'warning' | 'default' | 'info' | 'success' | 'destructive'

export const FUNNEL: { value: FunnelStage; label: string; variant: FunnelVariant }[] = [
  { value: 'new', label: 'Не звонили', variant: 'secondary' },
  { value: 'no_answer', label: 'Не дозвонились', variant: 'warning' },
  { value: 'thinking', label: 'Думает', variant: 'default' },
  { value: 'going', label: 'Поедет', variant: 'info' },
  { value: 'paid', label: 'Оплатил', variant: 'success' },
  { value: 'declined', label: 'Не поедет', variant: 'destructive' },
]

export const isFunnelStage = (v: unknown): v is FunnelStage => typeof v === 'string' && (FUNNEL_STAGES as readonly string[]).includes(v)

export const funnelOf = (v: string | null | undefined) => FUNNEL.find(s => s.value === v) ?? FUNNEL[0]

/** A payment moves anyone still in the funnel to «Оплатил»; «Не поедет» stays as the user set it. */
export function stageAfterPayment(stage: FunnelStage, paidUsd: number): FunnelStage {
  if (paidUsd > 0 && (stage === 'new' || stage === 'no_answer' || stage === 'thinking' || stage === 'going')) return 'paid'
  return stage
}

export const COMMENT_MAX = 2000

/** Trimmed comment text, or null when empty or not a string. Longer text is cut to COMMENT_MAX. */
export function parseCommentBody(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, COMMENT_MAX) : null
}

/** 'YYYY-MM-DD' that is a real date, null for empty, undefined for garbage. */
export function parseContactDate(v: unknown): string | null | undefined {
  if (v === null || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

/** Whether a «перезвонить» date has come: overdue, today, or still ahead. */
export function contactDue(date: string | null | undefined, today: string): 'overdue' | 'today' | 'later' | null {
  if (!date) return null
  const d = date.slice(0, 10)
  return d < today ? 'overdue' : d === today ? 'today' : 'later'
}

export type HistoryKind = 'note' | 'stage' | 'payment' | 'added' | 'hunter'

/**
 * One line of a person's feed (migration 026): a call note, or an action someone took —
 * stage change ('old>new' codes), payment change ('old>new' USD), adding to the list (stage code)
 * or a new hunter ('old name>new name', either side may be empty).
 */
export interface AttendeeComment {
  id: string
  attendee_id: string
  kind?: HistoryKind
  body: string
  author_id?: string | null
  author_name: string | null
  created_at: string
  /** Set by the server: the caller wrote this note or is an admin (may also edit it). */
  can_delete?: boolean
  /** When the note was last corrected (migration 031). */
  edited_at?: string | null
}

type HistoryRow = Pick<AttendeeComment, 'attendee_id' | 'body' | 'author_name' | 'created_at'> & { kind?: HistoryKind | null; author_id?: string | null }

export interface Mark {
  kind: HistoryKind
  body: string
  author_name: string | null
  created_at: string
}

const kindOf = (r: { kind?: HistoryKind | null }): HistoryKind => r.kind || 'note'
const newer = <T extends { created_at: string }>(a: T | null, b: T) => (!a || b.created_at > a.created_at ? b : a)

/**
 * Per person: newest note and how many notes, and the newest mark (stage change or adding),
 * i.e. who put them on the stage they are on now.
 */
export function summarizeHistory(rows: HistoryRow[]) {
  const out = new Map<string, { last_comment: Mark | null; comments_count: number; last_mark: Mark | null }>()
  for (const r of rows) {
    const cur = out.get(r.attendee_id) ?? { last_comment: null, comments_count: 0, last_mark: null }
    const entry: Mark = { kind: kindOf(r), body: r.body, author_name: r.author_name, created_at: r.created_at }
    if (entry.kind === 'note') {
      cur.comments_count++
      cur.last_comment = newer(cur.last_comment, entry)
    } else if (entry.kind === 'stage' || entry.kind === 'added') {
      cur.last_mark = newer(cur.last_mark, entry)
    }
    out.set(r.attendee_id, cur)
  }
  return out
}

/** 'old>new' → { from, to }; for 'added' the body is just the stage. */
export function splitChange(body: string): { from: string | null; to: string } {
  const i = body.indexOf('>')
  return i < 0 ? { from: null, to: body } : { from: body.slice(0, i), to: body.slice(i + 1) }
}

export interface TeamRow {
  name: string
  /** call notes written */
  notes: number
  /** stage changes made */
  marks: number
  /** different people this employee moved to the stage */
  going: number
  paid: number
  declined: number
  /** people they touched at all (note or mark) */
  people: number
  last_at: string
}

/**
 * Who did the calling: per author, notes, stage changes and outcomes. Busiest first.
 * Lines with no author account (author_id null, e.g. an import from a spreadsheet) are not a person's work.
 */
export function teamSummary(rows: HistoryRow[]): TeamRow[] {
  type Acc = { notes: number; marks: number; going: Set<string>; paid: Set<string>; declined: Set<string>; people: Set<string>; last_at: string }
  const by = new Map<string, Acc>()
  for (const r of rows) {
    const kind = kindOf(r)
    if (kind === 'payment' || kind === 'hunter' || r.author_id === null) continue
    const name = r.author_name?.trim() || 'Без имени'
    const t: Acc = by.get(name) ?? { notes: 0, marks: 0, going: new Set(), paid: new Set(), declined: new Set(), people: new Set(), last_at: '' }
    t.people.add(r.attendee_id)
    if (r.created_at > t.last_at) t.last_at = r.created_at
    if (kind === 'note') t.notes++
    else if (kind === 'stage') {
      t.marks++
      const to = splitChange(r.body).to
      if (to === 'going') t.going.add(r.attendee_id)
      if (to === 'paid') t.paid.add(r.attendee_id)
      if (to === 'declined') t.declined.add(r.attendee_id)
    }
    by.set(name, t)
  }
  return [...by.entries()]
    .map(([name, t]) => ({ name, notes: t.notes, marks: t.marks, going: t.going.size, paid: t.paid.size, declined: t.declined.size, people: t.people.size, last_at: t.last_at }))
    .sort((a, b) => b.marks + b.notes - (a.marks + a.notes) || a.name.localeCompare(b.name, 'ru'))
}

const usd = (v: string) => '$' + (Number(v) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })

/** Human text for an action line: «Думает → Поедет», «Оплата $0 → $300», «Добавил в список». */
export function describeMark(m: { kind?: HistoryKind | null; body: string }): string {
  const kind = kindOf(m)
  if (kind === 'note') return m.body
  const { from, to } = splitChange(m.body)
  if (kind === 'stage') return `${from ? funnelOf(from).label : '—'} → ${funnelOf(to).label}`
  if (kind === 'payment') return `Оплата ${usd(from ?? '0')} → ${usd(to)}`
  if (kind === 'hunter') return to ? (from ? `Хантер: ${from} → ${to}` : `Назначил хантера: ${to}`) : `Убрал хантера${from ? ` (${from})` : ''}`
  return `Добавил в список · ${funnelOf(to).label}`
}
