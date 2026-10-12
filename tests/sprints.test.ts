import { describe, expect, it } from 'vitest'
import {
  ActionError,
  addDays,
  applyAction,
  dateRange,
  daysBetween,
  effectiveDue,
  focusTasks,
  isOverdue,
  nextSprintDates,
  percent,
  pickCurrentSprint,
  relativeDue,
  shortDate,
  sprintProgress,
  tally,
  unfinishedTasks,
} from '@/lib/sprints'

const sprint = (start: string, end: string) => ({ start_date: start, end_date: end })

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-10-19', 1)).toBe('2026-10-20')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-06', 13)).toBe('2026-10-19')
  })

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-08', '2026-10-12')).toBe(4)
    expect(daysBetween('2026-10-08', '2026-10-07')).toBe(-1)
  })

  it('formats short dates and ranges', () => {
    expect(shortDate('2026-10-07')).toBe('7 окт')
    expect(dateRange('2026-10-06', '2026-10-19')).toBe('6–19 окт')
    expect(dateRange('2026-09-22', '2026-10-05')).toBe('22 сен – 5 окт')
  })

  it('describes deadlines in words', () => {
    const today = '2026-10-08'
    expect(relativeDue('2026-10-08', today)).toBe('Сегодня')
    expect(relativeDue('2026-10-09', today)).toBe('Завтра')
    expect(relativeDue('2026-10-10', today)).toBe('Через 2 дня')
    expect(relativeDue('2026-10-13', today)).toBe('Через 5 дней')
    expect(relativeDue('2026-10-19', today)).toBe('19 окт')
    expect(relativeDue('2026-10-07', today)).toBe('Срок был 7 окт')
    expect(relativeDue(null, today)).toBe('')
  })
})

describe('sprints', () => {
  it('reports the day of the sprint and days left', () => {
    expect(sprintProgress(sprint('2026-10-06', '2026-10-19'), '2026-10-08')).toEqual({
      day: 3,
      total: 14,
      left: 11,
      started: true,
      finished: false,
    })
    expect(sprintProgress(sprint('2026-10-20', '2026-11-02'), '2026-10-08')).toMatchObject({ day: 0, started: false, left: 14 })
    expect(sprintProgress(sprint('2026-09-22', '2026-10-05'), '2026-10-08')).toMatchObject({ day: 14, finished: true, left: 0 })
  })

  it('picks the running sprint, then the next, then the latest', () => {
    const s1 = sprint('2026-09-08', '2026-09-21')
    const s2 = sprint('2026-09-22', '2026-10-05')
    const s3 = sprint('2026-10-06', '2026-10-19')
    const s4 = sprint('2026-10-20', '2026-11-02')
    expect(pickCurrentSprint([s4, s1, s3, s2], '2026-10-08')).toBe(s3)
    expect(pickCurrentSprint([s1, s4], '2026-10-08')).toBe(s4)
    expect(pickCurrentSprint([s1, s2], '2026-10-08')).toBe(s2)
    expect(pickCurrentSprint([], '2026-10-08')).toBeNull()
  })

  it('suggests dates for the next sprint', () => {
    expect(nextSprintDates(sprint('2026-10-06', '2026-10-19'), '2026-10-08')).toEqual({
      start_date: '2026-10-20',
      end_date: '2026-11-02',
    })
    expect(nextSprintDates(null, '2026-10-08', 7)).toEqual({ start_date: '2026-10-08', end_date: '2026-10-14' })
  })
})

describe('assignment rules', () => {
  const textTask = { submission_type: 'text' as const, requires_review: true, due_date: '2026-10-07' }
  const markTask = { submission_type: 'mark' as const, requires_review: false, due_date: '2026-10-10' }

  it('uses the personal deadline first', () => {
    expect(effectiveDue(textTask, { due_date: '2026-10-11' })).toBe('2026-10-11')
    expect(effectiveDue(textTask, { due_date: null })).toBe('2026-10-07')
  })

  it('flags overdue only for open work', () => {
    expect(isOverdue(textTask, { due_date: null, status: 'todo' }, '2026-10-08')).toBe(true)
    expect(isOverdue(textTask, { due_date: null, status: 'review' }, '2026-10-08')).toBe(false)
    expect(isOverdue(textTask, { due_date: '2026-10-11', status: 'rework' }, '2026-10-08')).toBe(false)
  })

  it('sends a report to review, or straight to done without review', () => {
    expect(applyAction(textTask, { status: 'todo' }, { type: 'submit', report_text: 'Готово' })).toMatchObject({
      patch: { status: 'review', report_text: 'Готово' },
      event: 'submitted',
    })
    expect(
      applyAction({ ...textTask, requires_review: false }, { status: 'rework' }, { type: 'submit', report_text: 'Исправил' }).patch.status
    ).toBe('done')
  })

  it('validates reports', () => {
    expect(() => applyAction(textTask, { status: 'todo' }, { type: 'submit', report_text: '  ' })).toThrow(ActionError)
    const linkTask = { ...textTask, submission_type: 'link' as const }
    expect(() => applyAction(linkTask, { status: 'todo' }, { type: 'submit' })).toThrow('Добавьте ссылку')
    expect(() => applyAction(linkTask, { status: 'todo' }, { type: 'submit', report_link: 'docs.google.com' })).toThrow('http')
    expect(applyAction(linkTask, { status: 'todo' }, { type: 'submit', report_link: 'https://docs.google.com/x' }).patch.report_link).toBe(
      'https://docs.google.com/x'
    )
  })

  it('marks and unmarks simple tasks', () => {
    expect(applyAction(markTask, { status: 'todo' }, { type: 'mark' }).patch.status).toBe('done')
    expect(applyAction({ ...markTask, requires_review: true }, { status: 'todo' }, { type: 'mark' }).patch.status).toBe('review')
    expect(applyAction(markTask, { status: 'done' }, { type: 'unmark' }).patch.status).toBe('todo')
    expect(() => applyAction(textTask, { status: 'todo' }, { type: 'mark' })).toThrow(ActionError)
  })

  it('returns with a comment and a new deadline, accepts once', () => {
    const r = applyAction(textTask, { status: 'review' }, { type: 'return', comment: 'Добавьте цены', due_date: '2026-10-11' })
    expect(r).toMatchObject({ patch: { status: 'rework', review_comment: 'Добавьте цены', due_date: '2026-10-11' }, event: 'returned' })
    expect(() => applyAction(textTask, { status: 'review' }, { type: 'return', comment: '' })).toThrow('Напишите')
    expect(() => applyAction(textTask, { status: 'todo' }, { type: 'return', comment: 'x' })).toThrow(ActionError)
    expect(applyAction(textTask, { status: 'review' }, { type: 'accept' }).patch.status).toBe('done')
    expect(() => applyAction(textTask, { status: 'done' }, { type: 'accept' })).toThrow(ActionError)
  })
})

describe('counters', () => {
  it('tallies statuses and percents', () => {
    expect(tally([{ status: 'done' }, { status: 'review' }, { status: 'done' }, { status: 'todo' }])).toEqual({
      total: 4,
      todo: 1,
      review: 1,
      rework: 0,
      done: 2,
    })
    expect(percent(1, 3)).toBe(33)
    expect(percent(0, 0)).toBe(0)
  })
})

describe('focusTasks', () => {
  const mk = (id: string, status: 'todo' | 'review' | 'rework' | 'done', due: string | null, personal: string | null = null) => ({
    task: { id, title: id, due_date: due } as any,
    assignment: { id: `a-${id}`, status, due_date: personal } as any,
    events: [],
  })

  it('puts rework first, then overdue, then nearest deadline', () => {
    const today = '2026-10-08'
    const tasks = [mk('later', 'todo', '2026-10-19'), mk('soon', 'todo', '2026-10-10'), mk('late', 'todo', '2026-10-05'), mk('back', 'rework', '2026-10-07', '2026-10-11')]
    expect(focusTasks(tasks, today).items.map(t => t.task.id)).toEqual(['back', 'late', 'soon'])
  })

  it('skips done and reviewed tasks and counts the rest', () => {
    const tasks = [mk('a', 'done', '2026-10-09'), mk('b', 'review', '2026-10-09'), mk('c', 'todo', '2026-10-09'), mk('d', 'todo', '2026-10-10'), mk('e', 'todo', '2026-10-11')]
    const r = focusTasks(tasks, '2026-10-08', 2)
    expect(r.items.map(t => t.task.id)).toEqual(['c', 'd'])
    expect(r.rest).toBe(1)
  })

  it('is empty when everything is done', () => {
    expect(focusTasks([mk('a', 'done', null)], '2026-10-08')).toEqual({ items: [], rest: 0 })
  })
})

describe('unfinishedTasks', () => {
  const t = (id: string, title: string) => ({ id, title }) as never
  const a = (task_id: string, status: 'todo' | 'review' | 'rework' | 'done') => ({ task_id, status })

  it('keeps tasks that someone has not passed, most unfinished first', () => {
    const tasks = [t('1', 'Б'), t('2', 'А'), t('3', 'В'), t('4', 'Г')]
    const rows = [a('1', 'done'), a('1', 'todo'), a('2', 'todo'), a('2', 'review'), a('3', 'done'), a('3', 'done')]
    const r = unfinishedTasks(tasks, rows)
    expect(r.map(x => x.task.title)).toEqual(['А', 'Б'])
    expect(r[0]).toMatchObject({ open: 2, total: 2 })
    expect(r[1]).toMatchObject({ open: 1, total: 2 })
  })

  it('counts review and rework as not finished, and skips tasks nobody has', () => {
    const r = unfinishedTasks([t('1', 'А'), t('2', 'Б')], [a('1', 'rework')])
    expect(r.map(x => x.task.id)).toEqual(['1'])
  })

  it('breaks ties by title', () => {
    const r = unfinishedTasks([t('1', 'Я'), t('2', 'А')], [a('1', 'todo'), a('2', 'todo')])
    expect(r.map(x => x.task.title)).toEqual(['А', 'Я'])
  })
})
