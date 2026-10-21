import { describe, expect, it } from 'vitest'
import { pickBaseEntry, type BaseCandidate } from '@/lib/wheel-base'

const e = (type: 'weekly' | 'monthly', label: string, value = 10, updated = ''): BaseCandidate => ({ period_type: type, period_label: label, categories: [{ value }], updated_at: updated })

describe('pickBaseEntry', () => {
  it('nothing saved: no base, the template applies', () => {
    expect(pickBaseEntry([], 'monthly', '2026-09')).toBeNull()
  })

  it('takes the closest earlier month of the same kind', () => {
    const list = [e('monthly', '2026-05'), e('monthly', '2026-07'), e('monthly', '2026-10')]
    const r = pickBaseEntry(list, 'monthly', '2026-09')!
    expect(r.entry.period_label).toBe('2026-07')
    expect(r.sameType).toBe(true)
  })

  it('with only later months, takes the earliest of them', () => {
    const r = pickBaseEntry([e('monthly', '2026-12'), e('monthly', '2026-10')], 'monthly', '2026-06')!
    expect(r.entry.period_label).toBe('2026-10')
  })

  it('weeks compare as text across the year', () => {
    const r = pickBaseEntry([e('weekly', '2026-W09'), e('weekly', '2026-W30')], 'weekly', '2026-W31')!
    expect(r.entry.period_label).toBe('2026-W30')
  })

  it('a week without weeks falls back to the latest saved month, to be scaled', () => {
    const r = pickBaseEntry([e('monthly', '2026-05', 10, '2026-05-02'), e('monthly', '2026-07', 10, '2026-07-03')], 'weekly', '2026-W35')!
    expect(r.entry.period_label).toBe('2026-07')
    expect(r.sameType).toBe(false)
  })

  it('ignores empty, all-zero and template rows, and the period itself', () => {
    const list: BaseCandidate[] = [
      { period_type: 'monthly', period_label: '2026-06', categories: [] },
      e('monthly', '2026-07', 0),
      e('monthly', 'template'),
      e('monthly', '2026-09'),
    ]
    expect(pickBaseEntry(list, 'monthly', '2026-09')).toBeNull()
  })

  it('same kind wins over a newer entry of the other kind', () => {
    const r = pickBaseEntry([e('weekly', '2026-W20', 10, '2026-12-01'), e('monthly', '2026-04', 10, '2026-04-01')], 'monthly', '2026-08')!
    expect(r.entry.period_label).toBe('2026-04')
    expect(r.sameType).toBe(true)
  })
})
