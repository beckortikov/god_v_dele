import { describe, expect, it } from 'vitest'
import { MAX_REMINDERS, planReminders, reminderId } from '@/lib/native-reminders'
import type { MyTask } from '@/lib/sprints'

const lesson = (id: string, start: Date, minutes = 120) => ({
  id,
  title: `Урок ${id}`,
  starts_at: start.toISOString(),
  ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
  format: 'online' as const,
  location: null,
})

const task = (id: string, due: string | null, status: MyTask['assignment']['status'] = 'todo') =>
  ({
    task: { id: `t-${id}`, title: `Задача ${id}`, due_date: due },
    assignment: { id, status, due_date: null },
    events: [],
  }) as unknown as MyTask

describe('lesson and deadline reminders', () => {
  const now = new Date(2026, 10, 13, 12, 0) // 13 Nov, 12:00 local

  it('reminds of a lesson the evening before and an hour before', () => {
    const r = planReminders([lesson('a', new Date(2026, 10, 15, 18, 0))], [], now)
    expect(r.map(x => [x.title, x.at.getDate(), x.at.getHours()])).toEqual([
      ['Завтра урок', 14, 19],
      ['Урок через час', 15, 17],
    ])
    expect(r[0].body).toContain('Урок a · 18:00–20:00, онлайн')
    expect(r.every(x => x.page === 'my-today')).toBe(true)
  })

  it('skips moments already past', () => {
    // today 18:00: the evening before was yesterday, only the hour before is left
    const r = planReminders([lesson('b', new Date(2026, 10, 13, 18, 0))], [], now)
    expect(r.map(x => x.title)).toEqual(['Урок через час'])
  })

  it('reminds of open tasks only, the evening before and the morning of the deadline', () => {
    const r = planReminders([], [task('1', '2026-11-16'), task('2', '2026-11-16', 'review'), task('3', '2026-11-16', 'done'), task('4', null)], now)
    expect(r.map(x => [x.title, x.at.getDate(), x.at.getHours(), x.page])).toEqual([
      ['Завтра срок задачи', 15, 19, 'my-sprint'],
      ['Сегодня срок задачи', 16, 10, 'my-sprint'],
    ])
  })

  it('keeps the nearest ones within the iOS limit, with stable ids', () => {
    const many = Array.from({ length: 50 }, (_, i) => lesson(`l${i}`, new Date(2026, 10, 14 + i, 18, 0)))
    const r = planReminders(many, [], now)
    expect(r).toHaveLength(MAX_REMINDERS)
    expect(r[0].at.getTime()).toBeLessThanOrEqual(r[r.length - 1].at.getTime())
    expect(new Set(r.map(x => x.id)).size).toBe(r.length)
    expect(planReminders(many, [], now)[0].id).toBe(r[0].id)
    expect(reminderId('x')).toBeGreaterThan(0)
    expect(reminderId('x')).toBeLessThan(2 ** 31)
  })
})
