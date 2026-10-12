import { describe, expect, it } from 'vitest'
import { participantSprintNotices, reviewQueueNotices, type OpenAssignment } from '@/lib/sprint-notices'

const TODAY = '2026-10-12'
const row = (id: string, status: 'todo' | 'rework', taskDue: string | null, over: Partial<OpenAssignment> = {}): OpenAssignment => ({
  id,
  status,
  due_date: null,
  review_comment: null,
  reviewed_at: null,
  task: { id: `t-${id}`, title: `Задача ${id}`, due_date: taskDue },
  ...over,
})

describe('participantSprintNotices', () => {
  it('says nothing when there is nothing to do soon', () => {
    expect(participantSprintNotices([], TODAY)).toEqual([])
    expect(participantSprintNotices([row('a', 'todo', null), row('b', 'todo', '2026-10-30')], TODAY)).toEqual([])
  })

  it('announces work returned for rework with the curator comment, highest priority first', () => {
    const rows = [
      row('soon', 'todo', '2026-10-13'),
      row('late', 'todo', '2026-10-09'),
      row('back', 'rework', '2026-10-07', { due_date: '2026-10-14', review_comment: 'Добавьте, где искать клиентов', reviewed_at: '2026-10-11T18:05:00Z' }),
    ]
    const n = participantSprintNotices(rows, TODAY)
    expect(n.map(x => x.key.split(':')[0])).toEqual(['sprint-rework', 'sprint-overdue', 'sprint-soon'])
    expect(n[0]).toMatchObject({
      kind: 'sprint-rework',
      priority: 'high',
      title: 'Вернули на доработку «Задача back»',
      subtitle: 'Добавьте, где искать клиентов',
      time: 'до 14 окт',
      page: 'my-sprint',
    })
    expect(n[1]).toMatchObject({ kind: 'overdue-tasks', priority: 'high', title: 'Просрочена задача «Задача late»', subtitle: 'Срок был 9 окт' })
    expect(n[2]).toMatchObject({ priority: 'normal', title: 'Скоро срок: «Задача soon»', subtitle: 'Завтра' })
  })

  it('a returned task is not also reported as overdue', () => {
    const n = participantSprintNotices([row('back', 'rework', '2026-10-07')], TODAY)
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('sprint-rework')
  })

  it('groups several tasks into one notice and pluralises', () => {
    const late = participantSprintNotices([row('a', 'todo', '2026-10-01'), row('b', 'todo', '2026-10-05'), row('c', 'todo', '2026-10-08')], TODAY)
    expect(late[0].title).toBe('3 задачи просрочены')
    expect(late[0].time).toBe('с 1 окт')
    expect(late[0].subtitle).toBe('«Задача a», «Задача b»…')
    const back = participantSprintNotices([row('a', 'rework', null), row('b', 'rework', null)], TODAY)
    expect(back[0].title).toBe('На доработке 2 задачи')
  })

  it('«скоро» covers today and the next two days only; a personal deadline wins over the task one', () => {
    const n = participantSprintNotices(
      [row('today', 'todo', '2026-10-12'), row('edge', 'todo', '2026-10-14'), row('far', 'todo', '2026-10-15'), row('moved', 'todo', '2026-10-01', { due_date: '2026-10-13' })],
      TODAY
    )
    const soon = n.find(x => x.key.startsWith('sprint-soon'))!
    expect(soon.title).toBe('3 задачи со сроком в ближайшие дни')
    expect(soon.time).toBe('сегодня')
    expect(n.some(x => x.key.startsWith('sprint-overdue'))).toBe(false)
  })

  it('keeps the key stable while nothing changes and changes it with the set', () => {
    const a = participantSprintNotices([row('a', 'todo', '2026-10-01')], TODAY)[0].key
    expect(participantSprintNotices([row('a', 'todo', '2026-10-01')], TODAY)[0].key).toBe(a)
    expect(participantSprintNotices([row('a', 'todo', '2026-10-01'), row('b', 'todo', '2026-10-02')], TODAY)[0].key).not.toBe(a)
    // returned again after a new review = new notice
    const k1 = participantSprintNotices([row('a', 'rework', null, { reviewed_at: '2026-10-10T10:00:00Z' })], TODAY)[0].key
    const k2 = participantSprintNotices([row('a', 'rework', null, { reviewed_at: '2026-10-11T10:00:00Z' })], TODAY)[0].key
    expect(k1).not.toBe(k2)
  })
})

describe('reviewQueueNotices', () => {
  const r = (id: string, p: string, at: string | null) => ({ id, participant_id: p, submitted_at: at })

  it('is empty when nothing waits', () => {
    expect(reviewQueueNotices([], TODAY)).toEqual([])
  })

  it('counts reports and people, and points at the sprints page', () => {
    const n = reviewQueueNotices([r('1', 'p1', '2026-10-12T08:00:00Z'), r('2', 'p1', '2026-10-12T09:00:00Z'), r('3', 'p2', '2026-10-11T09:00:00Z')], TODAY)
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ kind: 'sprint-review', title: '3 отчёта ждут проверки', subtitle: 'от 2 участников', time: 'с 11 окт', page: 'sprints', priority: 'normal' })
  })

  it('a single report reads naturally', () => {
    const n = reviewQueueNotices([r('1', 'p1', '2026-10-12T08:00:00Z')], TODAY)
    expect(n[0]).toMatchObject({ title: 'Отчёт ждёт проверки', subtitle: 'от 1 участника' })
  })

  it('becomes urgent when the oldest report has waited two days', () => {
    expect(reviewQueueNotices([r('1', 'p1', '2026-10-10T08:00:00Z')], TODAY)[0].priority).toBe('high')
    expect(reviewQueueNotices([r('1', 'p1', '2026-10-11T08:00:00Z')], TODAY)[0].priority).toBe('normal')
  })

  it('copes with reports that have no submit date', () => {
    const n = reviewQueueNotices([r('1', 'p1', null)], TODAY)
    expect(n[0].time).toBe('')
    expect(n[0].priority).toBe('normal')
  })
})
