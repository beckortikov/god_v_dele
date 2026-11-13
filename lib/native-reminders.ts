import type { Lesson } from '@/lib/lessons'
import { timeRange } from '@/lib/lessons'
import { effectiveDue, type MyTask } from '@/lib/sprints'

/**
 * Reminders the iOS app (god_v_dele/ios) puts on the phone itself, through the Capacitor Local Notifications
 * plugin: they arrive with the app closed and need no push server. The site plans them from the participant's
 * lessons and sprint tasks every time the app opens, replacing the previous set.
 */

export interface Reminder {
  /** Stable for the same lesson or task and moment, so planning again replaces rather than duplicates. */
  id: number
  title: string
  body: string
  at: Date
  /** The page a tap opens. */
  page: 'my-today' | 'my-sprint'
}

/** iOS keeps at most 64 pending local notifications per app; leave room for the system. */
export const MAX_REMINDERS = 60

/** 31-bit positive id from a string (the plugin wants a Java/Swift int). */
export function reminderId(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 1) || 1
}

/** A local moment on the day of a YYYY-MM-DD date. */
const onDay = (day: string, hours: number, minutes = 0) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, hours, minutes)
}

const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)

/**
 * For a lesson: the evening before (19:00) and an hour before the start.
 * For a task still to do: the evening before the deadline (19:00) and the morning of it (10:00).
 * Only moments still ahead; the nearest first, at most MAX_REMINDERS.
 */
export function planReminders(
  lessons: Pick<Lesson, 'id' | 'title' | 'starts_at' | 'ends_at' | 'format' | 'location'>[],
  tasks: MyTask[],
  now: Date = new Date()
): Reminder[] {
  const out: Reminder[] = []
  const add = (key: string, at: Date, title: string, body: string, page: Reminder['page']) => {
    if (at.getTime() > now.getTime() + 60_000) out.push({ id: reminderId(key), title, body, at, page })
  }

  for (const l of lessons) {
    const start = new Date(l.starts_at)
    const where = l.format === 'online' ? 'онлайн' : l.location || 'очно'
    const time = timeRange(l)
    const eve = dayBefore(start)
    add(`lesson:${l.id}:eve`, new Date(eve.getFullYear(), eve.getMonth(), eve.getDate(), 19), 'Завтра урок', `${l.title} · ${time}, ${where}`, 'my-today')
    add(`lesson:${l.id}:hour`, new Date(start.getTime() - 60 * 60_000), 'Урок через час', `${l.title} · ${time}, ${where}`, 'my-today')
  }

  for (const t of tasks) {
    if (t.assignment.status !== 'todo' && t.assignment.status !== 'rework') continue
    const due = effectiveDue(t.task, t.assignment)
    if (!due) continue
    const eve = dayBefore(onDay(due, 0))
    add(`task:${t.assignment.id}:${due}:eve`, new Date(eve.getFullYear(), eve.getMonth(), eve.getDate(), 19), 'Завтра срок задачи', t.task.title, 'my-sprint')
    add(`task:${t.assignment.id}:${due}:day`, onDay(due, 10), 'Сегодня срок задачи', t.task.title, 'my-sprint')
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS)
}
