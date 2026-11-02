import { describe, expect, it } from 'vitest'
import { PlanInputError, actionState, byDeadline, parseAction, parseResult, planSummary, suggestionsFor, type OpAction, type OpExcuse } from '@/lib/op-plan'

const T = '2026-11-02'
const act = (id: string, over: Partial<OpAction> = {}): OpAction => ({
  id,
  plan_id: 'p',
  goal_id: 'g',
  title: id,
  indicator: null,
  due_date: null,
  owners: [],
  priority: 'B',
  price: 1000,
  status: 'open',
  result_note: null,
  result_link: null,
  done_at: null,
  position: 0,
  ...over,
})
const excuse = (action_id: string, price = 1000): OpExcuse => ({ id: `e-${action_id}`, plan_id: 'p', action_id, reason: 'r', price, missed_due: null, new_due: null, created_at: `${T}T10:00:00Z` })

describe('actionState', () => {
  it('done, waiting for a result, after an excuse, in work', () => {
    expect(actionState(act('a', { status: 'done', due_date: '2026-10-01' }), [], T)).toBe('done')
    expect(actionState(act('a', { due_date: '2026-11-01' }), [], T)).toBe('waiting')
    expect(actionState(act('a', { due_date: '2026-11-09' }), [excuse('a')], T)).toBe('excuse')
    // the new deadline passed again: a result is due again
    expect(actionState(act('a', { due_date: '2026-11-01' }), [excuse('a')], T)).toBe('waiting')
    expect(actionState(act('a', { due_date: T }), [], T)).toBe('work')
    expect(actionState(act('a'), [], T)).toBe('work')
  })
})

describe('planSummary', () => {
  it('counts states, money given up and still at stake, and this week', () => {
    const actions = [
      act('done', { status: 'done', price: 500 }),
      act('late', { due_date: '2026-10-30' }),
      act('again', { due_date: '2026-11-05', price: 300 }),
      act('later', { due_date: '2026-12-01', price: 200 }),
    ]
    const s = planSummary({ actions, excuses: [excuse('again', 300), excuse('again', 300)] }, T)
    expect(s).toMatchObject({ total: 4, done: 1, waiting: 1, excuse: 1, work: 1, excuses: 2, paid: 600, atStake: 1500, thisWeek: 1 })
  })
})

describe('byDeadline', () => {
  it('keeps open actions, nearest first, without a deadline last', () => {
    const list = byDeadline([act('x'), act('b', { due_date: '2026-11-10' }), act('a', { due_date: '2026-10-01' }), act('d', { status: 'done', due_date: '2026-09-01' })])
    expect(list.map(a => a.id)).toEqual(['a', 'b', 'x'])
  })
})

describe('parseAction', () => {
  it('cleans a new action', () => {
    expect(parseAction({ title: '  CJM ', owners: ['Амир', ' ', 'Амир', 'Далер'], price: '$1 500,5' }, false)).toEqual({
      title: 'CJM',
      indicator: null,
      due_date: null,
      owners: ['Амир', 'Далер'],
      priority: 'B',
      price: 1500.5,
    })
  })

  it('takes only the sent fields of an edit', () => {
    expect(parseAction({ priority: 'A' }, true)).toEqual({ priority: 'A' })
  })

  it('refuses an empty title, a bad priority, date or price', () => {
    expect(() => parseAction({ title: ' ' }, false)).toThrow(PlanInputError)
    expect(() => parseAction({ title: 'x', priority: 'D' }, false)).toThrow(PlanInputError)
    expect(() => parseAction({ title: 'x', due_date: '1.12.2026' }, false)).toThrow(PlanInputError)
    expect(() => parseAction({ title: 'x', price: -5 }, false)).toThrow(PlanInputError)
  })
})

describe('parseResult', () => {
  it('needs a reason for an excuse and no past deadline', () => {
    expect(parseResult({ type: 'excuse', reason: 'Заболел', new_due: '2026-11-09' }, T)).toEqual({ type: 'excuse', reason: 'Заболел', new_due: '2026-11-09' })
    expect(() => parseResult({ type: 'excuse', reason: '' }, T)).toThrow(PlanInputError)
    expect(() => parseResult({ type: 'excuse', reason: 'x', new_due: '2026-11-01' }, T)).toThrow(PlanInputError)
    expect(() => parseResult({ type: 'what' }, T)).toThrow(PlanInputError)
  })
})

describe('suggestionsFor', () => {
  it('matches a direction regardless of case', () => {
    expect(suggestionsFor(' продажи ')).toContain('Скрипты продаж')
    expect(suggestionsFor('Своё')).toEqual([])
  })
})
