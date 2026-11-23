import { describe, expect, it } from 'vitest'
import { emptyCounts, funnelSummary, share, stepCounts } from '@/lib/crm-funnel'

describe('crm funnel', () => {
  it('counts steps cumulatively: who paid is also reached, interested and going', () => {
    const c = { ...emptyCounts(), new: 4, no_answer: 2, thinking: 3, going: 2, paid: 1, declined: 1 }
    expect(stepCounts(c).map(s => [s.id, s.count])).toEqual([
      ['listed', 13],
      ['reached', 7],
      ['interested', 6],
      ['going', 3],
      ['paid', 1],
    ])
  })

  it('groups by event and by hunter, «Без хантера» last, and skips people of other events', () => {
    const s = funnelSummary(
      [
        { event_id: 'e1', funnel_stage: 'paid', hunter_id: 'h1' },
        { event_id: 'e1', funnel_stage: null, hunter_id: null },
        { event_id: 'e1', funnel_stage: 'going', hunter_id: 'h2' },
        { event_id: 'e1', funnel_stage: 'thinking', hunter_id: 'h2' },
        { event_id: 'e2', funnel_stage: 'going', hunter_id: 'h1' },
        { event_id: 'gone', funnel_stage: 'paid', hunter_id: 'h1' },
      ],
      [
        { id: 'e1', name: 'Мастермайнд' },
        { id: 'e2', name: 'Встреча' },
      ],
      id => ({ h1: 'Насиба', h2: 'Шабо' })[id]
    )
    expect(s.total.paid).toBe(1)
    expect(s.total.new).toBe(1)
    expect(s.events.map(e => [e.name, e.total])).toEqual([
      ['Мастермайнд', 4],
      ['Встреча', 1],
    ])
    expect(s.hunters.map(h => [h.name, h.total])).toEqual([
      ['Насиба', 2],
      ['Шабо', 2],
      ['Без хантера', 1],
    ])
    expect(share(1, 0)).toBe(0)
  })
})
