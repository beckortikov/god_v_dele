/**
 * Sprint events for the bell (/api/notifications): what a participant must do
 * next, and what waits for a curator. Pure, so it is covered by tests; the
 * route only fetches the rows.
 */
import { plural } from '@/lib/format'
import { addDays, daysBetween, relativeDue, shortDate } from '@/lib/sprints'

/** `overdue-tasks` is the bell's existing red «просрочено» look, shared with employee tasks. */
export type SprintNoticeKind = 'sprint-rework' | 'sprint-due' | 'sprint-review' | 'overdue-tasks'

export interface SprintNotice {
  key: string
  kind: SprintNoticeKind
  priority: 'high' | 'normal' | 'low'
  title: string
  subtitle: string
  time: string
  page: string
}

/** An open assignment of the participant with the data of its task. */
export interface OpenAssignment {
  id: string
  status: 'todo' | 'rework'
  /** Personal deadline (set when the work is returned). */
  due_date: string | null
  review_comment: string | null
  reviewed_at: string | null
  task: { id: string; title: string; due_date: string | null }
}

/** Days before a deadline when «скоро срок» appears. */
export const SOON_DAYS = 2
/** A report waiting longer than this makes the curator's notice urgent. */
export const STALE_REVIEW_DAYS = 2

/** Small stable hash so a notice reads as new again when its set of records changes. */
function hash(parts: string[]) {
  let h = 5381
  for (const ch of [...parts].sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

const quoted = (titles: string[]) => titles.slice(0, 2).map(t => `«${t}»`).join(', ') + (titles.length > 2 ? '…' : '')
const clip = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
const due = (a: OpenAssignment) => a.due_date || a.task.due_date || null

/**
 * For a participant: work returned for rework, then overdue work, then work due
 * in the next few days. Work with no deadline, or due later, is not news.
 */
export function participantSprintNotices(rows: OpenAssignment[], today: string): SprintNotice[] {
  const out: SprintNotice[] = []

  const rework = rows.filter(r => r.status === 'rework')
  if (rework.length) {
    const first = rework[0]
    const when = due(first)
    out.push({
      key: `sprint-rework:${hash(rework.map(r => `${r.id}@${r.reviewed_at ?? ''}`))}`,
      kind: 'sprint-rework',
      priority: 'high',
      title: rework.length === 1 ? `Вернули на доработку «${first.task.title}»` : `На доработке ${rework.length} ${plural(rework.length, ['задача', 'задачи', 'задач'])}`,
      subtitle: rework.length === 1 ? (first.review_comment ? clip(first.review_comment) : 'Откройте задачу, там комментарий куратора') : quoted(rework.map(r => r.task.title)),
      time: rework.length === 1 && when ? `до ${shortDate(when)}` : '',
      page: 'my-sprint',
    })
  }

  const todo = rows.filter(r => r.status === 'todo' && due(r))
  const overdue = todo.filter(r => due(r)! < today).sort((a, b) => due(a)!.localeCompare(due(b)!))
  if (overdue.length) {
    const oldest = due(overdue[0])!
    out.push({
      key: `sprint-overdue:${hash(overdue.map(r => r.id))}`,
      kind: 'overdue-tasks',
      priority: 'high',
      title: overdue.length === 1 ? `Просрочена задача «${overdue[0].task.title}»` : `${overdue.length} ${plural(overdue.length, ['задача просрочена', 'задачи просрочены', 'задач просрочено'])}`,
      subtitle: overdue.length === 1 ? `Срок был ${shortDate(oldest)}` : quoted(overdue.map(r => r.task.title)),
      time: `с ${shortDate(oldest)}`,
      page: 'my-sprint',
    })
  }

  const limit = addDays(today, SOON_DAYS)
  const soon = todo.filter(r => due(r)! >= today && due(r)! <= limit).sort((a, b) => due(a)!.localeCompare(due(b)!))
  if (soon.length) {
    const nearest = due(soon[0])!
    out.push({
      key: `sprint-soon:${hash(soon.map(r => r.id))}`,
      kind: 'sprint-due',
      priority: 'normal',
      title: soon.length === 1 ? `Скоро срок: «${soon[0].task.title}»` : `${soon.length} ${plural(soon.length, ['задача', 'задачи', 'задач'])} со сроком в ближайшие дни`,
      subtitle: soon.length === 1 ? relativeDue(nearest, today) : quoted(soon.map(r => r.task.title)),
      time: relativeDue(nearest, today).toLowerCase(),
      page: 'my-sprint',
    })
  }

  return out
}

/** For a curator: reports that wait for review. Urgent when the oldest has waited too long. */
export function reviewQueueNotices(rows: { id: string; participant_id: string; submitted_at: string | null }[], today: string): SprintNotice[] {
  if (!rows.length) return []
  const people = new Set(rows.map(r => r.participant_id)).size
  const dates = rows.map(r => r.submitted_at?.slice(0, 10)).filter((d): d is string => !!d).sort()
  const oldest = dates[0]
  const stale = !!oldest && daysBetween(oldest, today) >= STALE_REVIEW_DAYS
  return [
    {
      key: `sprint-review:${hash(rows.map(r => r.id))}`,
      kind: 'sprint-review',
      priority: stale ? 'high' : 'normal',
      title: rows.length === 1 ? 'Отчёт ждёт проверки' : `${rows.length} ${plural(rows.length, ['отчёт ждёт', 'отчёта ждут', 'отчётов ждут'])} проверки`,
      subtitle: `от ${people} ${plural(people, ['участника', 'участников', 'участников'])}`,
      time: oldest ? `с ${shortDate(oldest)}` : '',
      page: 'sprints',
    },
  ]
}
