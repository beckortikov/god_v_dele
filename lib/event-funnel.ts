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

export interface AttendeeComment {
  id: string
  attendee_id: string
  body: string
  author_name: string | null
  created_at: string
}

/** Newest comment and count per attendee, from rows in any order. */
export function summarizeComments(rows: Pick<AttendeeComment, 'attendee_id' | 'body' | 'author_name' | 'created_at'>[]) {
  const out = new Map<string, { last: { body: string; author_name: string | null; created_at: string }; count: number }>()
  for (const r of rows) {
    const cur = out.get(r.attendee_id)
    if (!cur) out.set(r.attendee_id, { last: { body: r.body, author_name: r.author_name, created_at: r.created_at }, count: 1 })
    else {
      cur.count++
      if (r.created_at > cur.last.created_at) cur.last = { body: r.body, author_name: r.author_name, created_at: r.created_at }
    }
  }
  return out
}
