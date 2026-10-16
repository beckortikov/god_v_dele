/**
 * Sprints for participants: shared types and pure helpers used by the API
 * routes, the curator page and the participant cabinet.
 * Dates are ISO strings ('2026-10-08'); all date math is done in UTC so the
 * result does not depend on the device's time zone.
 */
import { MONTHS_SHORT_RU, plural } from '@/lib/format'

export type SubmissionType = 'mark' | 'text' | 'link'
export type Audience = 'all' | 'selected'
export type AssignmentStatus = 'todo' | 'review' | 'rework' | 'done'
export type EventKind = 'submitted' | 'returned' | 'accepted' | 'marked' | 'unmarked'

export interface Sprint {
  id: string
  program_id: string
  number: number
  title: string
  goal: string | null
  start_date: string
  end_date: string
  /** Group the sprint is for; null/absent — the whole program (every sprint made before groups existed). */
  group_id?: string | null
  created_at?: string
}

/** Group of participants inside a program, as listed by GET /api/sprints/groups. */
export interface SprintGroup {
  id: string
  program_id: string
  name: string
  /** Active participants in the group. */
  members: number
}

export interface SprintTask {
  id: string
  program_id: string
  sprint_id: string | null
  title: string
  description: string | null
  due_date: string | null
  submission_type: SubmissionType
  requires_review: boolean
  remind: boolean
  audience: Audience
  created_by?: string | null
  created_at?: string
}

export interface Assignment {
  id: string
  task_id: string
  participant_id: string
  status: AssignmentStatus
  due_date: string | null
  report_text: string | null
  report_link: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_comment: string | null
  reviewed_by: string | null
  updated_at?: string
}

export interface TaskEvent {
  id: string
  assignment_id: string
  kind: EventKind
  comment: string | null
  due_date: string | null
  actor_name: string | null
  created_at: string
}

export interface ParticipantLite {
  id: string
  name: string
  phone?: string | null
  status?: string | null
}

/** Sprint with counters, as listed by GET /api/sprints. */
export interface SprintSummary extends Sprint {
  task_count: number
  assigned: number
  done: number
  review: number
}

/** GET /api/sprints/[id]/board */
export interface BoardData {
  sprint: Sprint
  tasks: SprintTask[]
  participants: ParticipantLite[]
  assignments: Assignment[]
}

/** One task as the participant sees it. */
export interface MyTask {
  task: SprintTask
  assignment: Assignment
  events: TaskEvent[]
}

export interface MySprintSummary extends Sprint {
  total: number
  done: number
}

/** GET /api/my-sprint */
export interface MySprintData {
  participant: { id: string; name: string; program_id: string | null }
  program: { id: string; name: string } | null
  sprints: MySprintSummary[]
  current: Sprint | null
  tasks: MyTask[]
}

// ---------------------------------------------------------------------------
// Dictionaries

export const STATUS: Record<AssignmentStatus, { label: string; variant: 'secondary' | 'info' | 'warning' | 'success' }> = {
  todo: { label: 'Не сдано', variant: 'secondary' },
  review: { label: 'На проверке', variant: 'info' },
  rework: { label: 'На доработке', variant: 'warning' },
  done: { label: 'Выполнено', variant: 'success' },
}

export const SUBMISSION: Record<SubmissionType, { label: string; hint: string }> = {
  mark: { label: 'Отметка', hint: 'Участник просто ставит галочку' },
  text: { label: 'Текстовый отчёт', hint: 'Пишет, что сделал и что понял' },
  link: { label: 'Ссылка или файл', hint: 'Таблица, документ, видео' },
}

// ---------------------------------------------------------------------------
// Dates

const DAY = 86_400_000

function utc(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number) {
  return new Date(utc(iso) + days * DAY).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string) {
  return Math.round((utc(to) - utc(from)) / DAY)
}

/** '2026-10-07' → '7 окт' */
export function shortDate(iso: string | null | undefined) {
  if (!iso) return ''
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS_SHORT_RU[m - 1]}`
}

/** '6–19 окт', '22 сен – 5 окт', '28 дек – 10 янв' */
export function dateRange(start: string, end: string) {
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  if (ys === ye && ms === me) return `${ds}–${de} ${MONTHS_SHORT_RU[me - 1]}`
  return `${shortDate(start)} – ${shortDate(end)}`
}

/** Deadline in words relative to today: «Сегодня», «Завтра», «Через 4 дня», «12 окт». */
export function relativeDue(due: string | null | undefined, today: string) {
  if (!due) return ''
  const n = daysBetween(today, due)
  if (n < 0) return `Срок был ${shortDate(due)}`
  if (n === 0) return 'Сегодня'
  if (n === 1) return 'Завтра'
  if (n <= 6) return `Через ${n} ${plural(n, ['день', 'дня', 'дней'])}`
  return shortDate(due)
}

/** Day of the sprint (1-based), its length and days left, clamped to the sprint. */
export function sprintProgress(sprint: Pick<Sprint, 'start_date' | 'end_date'>, today: string) {
  const total = daysBetween(sprint.start_date, sprint.end_date) + 1
  const raw = daysBetween(sprint.start_date, today) + 1
  const day = Math.min(Math.max(raw, 0), total)
  return { day, total, left: Math.max(total - Math.max(raw, 0), 0), started: raw >= 1, finished: raw > total }
}

/** Which sprints a curator sees: a group's own, or the program-wide ones ('none'). */
export const NO_GROUP = 'none'

export function sprintsOfGroup<T extends Pick<Sprint, 'group_id'>>(sprints: T[], selection: string): T[] {
  return sprints.filter(s => (selection === NO_GROUP ? !s.group_id : s.group_id === selection))
}

/**
 * Number of the next sprint. A group's numbering continues the program-wide one
 * (so its participants never see two sprints with the same number); a program-wide
 * sprint takes the next number over all sprints of the program.
 */
export function nextSprintNumber(all: Pick<Sprint, 'number' | 'group_id'>[], groupId: string | null): number {
  const pool = groupId ? all.filter(s => !s.group_id || s.group_id === groupId) : all
  return pool.reduce((max, s) => Math.max(max, s.number), 0) + 1
}

/** Sprints a participant sees: program-wide ones and those of their own group. */
export function sprintsForParticipant<T extends Pick<Sprint, 'group_id'>>(sprints: T[], groupId: string | null | undefined): T[] {
  return sprints.filter(s => !s.group_id || s.group_id === groupId)
}

/**
 * The group to open first: where the sprints are. Groups with sprints win over the
 * program-wide ones only when no program-wide sprint exists, so nothing "disappears"
 * for a program that has been running before groups were introduced.
 */
export function defaultGroupSelection(groups: Pick<SprintGroup, 'id'>[], sprints: Pick<Sprint, 'group_id'>[]): string {
  if (!groups.length) return NO_GROUP
  if (sprints.some(s => !s.group_id)) return NO_GROUP
  return groups.find(g => sprints.some(s => s.group_id === g.id))?.id ?? groups[0].id
}

/** The running sprint; otherwise the next one; otherwise the latest. */
export function pickCurrentSprint<T extends Pick<Sprint, 'start_date' | 'end_date'>>(sprints: T[], today: string): T | null {
  if (!sprints.length) return null
  const sorted = [...sprints].sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (
    sorted.find(s => s.start_date <= today && today <= s.end_date) ??
    sorted.find(s => s.start_date > today) ??
    sorted[sorted.length - 1]
  )
}

/** Default dates for the next sprint: the day after the last one, same length (14 days by default). */
export function nextSprintDates(last: Pick<Sprint, 'start_date' | 'end_date'> | null, today: string, days = 14) {
  const start = last ? addDays(last.end_date, 1) : today
  return { start_date: start, end_date: addDays(start, days - 1) }
}

// ---------------------------------------------------------------------------
// Assignment rules

/** The deadline that applies to this participant. */
export function effectiveDue(task: Pick<SprintTask, 'due_date'>, a: Pick<Assignment, 'due_date'>) {
  return a.due_date || task.due_date || null
}

export function isOverdue(task: Pick<SprintTask, 'due_date'>, a: Pick<Assignment, 'due_date' | 'status'>, today: string) {
  const due = effectiveDue(task, a)
  return !!due && due < today && (a.status === 'todo' || a.status === 'rework')
}

export type AssignmentAction =
  | { type: 'submit'; report_text?: string | null; report_link?: string | null; /** Files already attached to the report. */ files?: number }
  | { type: 'mark' }
  | { type: 'unmark' }
  | { type: 'accept'; comment?: string | null }
  | { type: 'return'; comment?: string | null; due_date?: string | null }

export class ActionError extends Error {}

/**
 * Next state of an assignment after an action, or an ActionError with a
 * message for the user. Pure, so it is shared by the API and the tests.
 */
export function applyAction(
  task: Pick<SprintTask, 'submission_type' | 'requires_review'>,
  a: Pick<Assignment, 'status'>,
  action: AssignmentAction
): { patch: Partial<Assignment>; event: EventKind } {
  switch (action.type) {
    case 'mark': {
      if (task.submission_type !== 'mark') throw new ActionError('Эту задачу нужно сдать с отчётом')
      if (a.status === 'done') throw new ActionError('Задача уже отмечена')
      return { patch: { status: task.requires_review ? 'review' : 'done', submitted_at: now() }, event: 'marked' }
    }
    case 'unmark': {
      if (task.submission_type !== 'mark') throw new ActionError('Снять отметку можно только с задачи-отметки')
      if (a.status !== 'done' && a.status !== 'review') throw new ActionError('Задача не отмечена')
      return { patch: { status: 'todo', submitted_at: null }, event: 'unmarked' }
    }
    case 'submit': {
      if (a.status === 'done') throw new ActionError('Задача уже принята')
      const text = action.report_text?.trim() || null
      const link = action.report_link?.trim() || null
      if (task.submission_type === 'text' && !text) throw new ActionError('Напишите отчёт')
      if (task.submission_type === 'link' && !link && !text && !action.files) throw new ActionError('Добавьте ссылку или прикрепите файл')
      if (link && !/^https?:\/\//i.test(link)) throw new ActionError('Ссылка должна начинаться с http:// или https://')
      return {
        patch: { status: task.requires_review ? 'review' : 'done', report_text: text, report_link: link, submitted_at: now() },
        event: 'submitted',
      }
    }
    case 'accept': {
      if (a.status === 'done') throw new ActionError('Задача уже принята')
      return { patch: { status: 'done', reviewed_at: now(), review_comment: action.comment?.trim() || null }, event: 'accepted' }
    }
    case 'return': {
      if (a.status !== 'review' && a.status !== 'done') throw new ActionError('Вернуть можно только сданную задачу')
      const comment = action.comment?.trim()
      if (!comment) throw new ActionError('Напишите, что поправить')
      return {
        patch: { status: 'rework', reviewed_at: now(), review_comment: comment, ...(action.due_date ? { due_date: action.due_date } : {}) },
        event: 'returned',
      }
    }
  }
}

function now() {
  return new Date().toISOString()
}

/** Counters for a list of assignments. */
export function tally(assignments: Pick<Assignment, 'status'>[]) {
  const t = { total: assignments.length, todo: 0, review: 0, rework: 0, done: 0 }
  for (const a of assignments) t[a.status]++
  return t
}

/** A task of a finished sprint that someone has not closed yet. */
export interface UnfinishedTask {
  task: SprintTask
  /** Participants who have not passed it: not started, on review or returned. */
  open: number
  total: number
}

/** Tasks with at least one assignment that is not done, most unfinished first. Nobody assigned = nothing to carry. */
export function unfinishedTasks(tasks: SprintTask[], assignments: Pick<Assignment, 'task_id' | 'status'>[]): UnfinishedTask[] {
  const byTask = new Map<string, Pick<Assignment, 'status'>[]>()
  for (const a of assignments) byTask.set(a.task_id, [...(byTask.get(a.task_id) ?? []), a])
  return tasks
    .map(task => {
      const rows = byTask.get(task.id) ?? []
      return { task, open: rows.filter(r => r.status !== 'done').length, total: rows.length }
    })
    .filter(x => x.open > 0)
    .sort((a, b) => b.open - a.open || a.task.title.localeCompare(b.task.title, 'ru'))
}

/** Whole percent, 0 when there is nothing to count. */
export const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

// ---------------------------------------------------------------------------
// «Сегодня» in the participant cabinet

/**
 * The few tasks worth doing first: returned for rework, then overdue, then the
 * nearest deadlines. Done tasks and tasks waiting for review are left out.
 */
export function focusTasks(tasks: MyTask[], today: string, limit = 3) {
  const open = tasks.filter(t => t.assignment.status === 'todo' || t.assignment.status === 'rework')
  const rank = (t: MyTask) => (t.assignment.status === 'rework' ? 0 : isOverdue(t.task, t.assignment, today) ? 1 : 2)
  const sorted = [...open].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (effectiveDue(a.task, a.assignment) ?? '9999').localeCompare(effectiveDue(b.task, b.assignment) ?? '9999') ||
      a.task.title.localeCompare(b.task.title, 'ru')
  )
  return { items: sorted.slice(0, limit), rest: Math.max(sorted.length - limit, 0) }
}
