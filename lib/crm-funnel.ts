/**
 * «Воронка» in the CRM: how far people got. For «Обзвон» the steps are cumulative —
 * someone who paid also counts as reached, interested and going.
 */
import { FUNNEL_STAGES, type FunnelStage } from '@/lib/event-funnel'

export type StageCounts = Record<FunnelStage, number>

export const emptyCounts = (): StageCounts => Object.fromEntries(FUNNEL_STAGES.map(s => [s, 0])) as StageCounts

/** Each step: which stages have passed it. */
export const CALL_STEPS: { id: string; label: string; hint: string; stages: FunnelStage[] }[] = [
  { id: 'listed', label: 'В списке', hint: 'Все приглашённые', stages: [...FUNNEL_STAGES] },
  { id: 'reached', label: 'Дозвонились', hint: 'Поговорили, ответ любой', stages: ['thinking', 'going', 'paid', 'declined'] },
  { id: 'interested', label: 'Заинтересованы', hint: 'Думает, поедет или оплатил', stages: ['thinking', 'going', 'paid'] },
  { id: 'going', label: 'Поедут', hint: 'Поедет или уже оплатил', stages: ['going', 'paid'] },
  { id: 'paid', label: 'Оплатили', hint: 'Оплата получена', stages: ['paid'] },
]

export function stepCounts(c: StageCounts) {
  return CALL_STEPS.map(s => ({ ...s, count: s.stages.reduce((n, st) => n + (c[st] ?? 0), 0) }))
}

/** Share of `part` in `whole`, 0 when there is nobody. */
export const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

export interface FunnelAttendee {
  event_id: string
  funnel_stage?: string | null
  hunter_id?: string | null
}

export interface FunnelGroup {
  id: string | null
  name: string
  counts: StageCounts
  total: number
}

function add(c: StageCounts, stage: string | null | undefined) {
  const st = (stage || 'new') as FunnelStage
  if (st in c) c[st]++
}

/** Counts per event and per hunter («Без хантера» last), busiest hunter first. */
export function funnelSummary(
  attendees: FunnelAttendee[],
  events: { id: string; name: string }[],
  staffName: (id: string) => string | undefined
) {
  const byEvent = new Map<string, StageCounts>(events.map(e => [e.id, emptyCounts()]))
  const byHunter = new Map<string | null, StageCounts>()
  const total = emptyCounts()
  for (const a of attendees) {
    const ev = byEvent.get(a.event_id)
    if (!ev) continue
    add(ev, a.funnel_stage)
    add(total, a.funnel_stage)
    const h = a.hunter_id ?? null
    if (!byHunter.has(h)) byHunter.set(h, emptyCounts())
    add(byHunter.get(h)!, a.funnel_stage)
  }
  const sum = (c: StageCounts) => Object.values(c).reduce((n, v) => n + v, 0)
  const hunters: FunnelGroup[] = [...byHunter.entries()]
    .map(([id, counts]) => ({ id, name: id ? staffName(id) ?? 'Бывший сотрудник' : 'Без хантера', counts, total: sum(counts) }))
    .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || b.total - a.total || a.name.localeCompare(b.name, 'ru'))
  return {
    total,
    events: events.map(e => ({ id: e.id, name: e.name, counts: byEvent.get(e.id)!, total: sum(byEvent.get(e.id)!) })),
    hunters,
  }
}
