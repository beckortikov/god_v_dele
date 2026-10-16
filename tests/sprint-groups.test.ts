import { describe, expect, it } from 'vitest'
import { NO_GROUP, defaultGroupSelection, nextSprintNumber, sprintsForParticipant, sprintsOfGroup } from '@/lib/sprints'

const s = (number: number, group_id: string | null = null) => ({ number, group_id })

describe('sprintsOfGroup', () => {
  const all = [s(1), s(2), s(1, 'a'), s(2, 'b')]
  it('shows program-wide sprints for «none»', () => {
    expect(sprintsOfGroup(all, NO_GROUP)).toEqual([s(1), s(2)])
  })
  it('shows only the sprints of the chosen group', () => {
    expect(sprintsOfGroup(all, 'a')).toEqual([s(1, 'a')])
    expect(sprintsOfGroup(all, 'c')).toEqual([])
  })
  it('treats sprints that predate groups (no group_id) as program-wide', () => {
    expect(sprintsOfGroup([{ number: 1 }, { number: 2, group_id: undefined }], NO_GROUP)).toHaveLength(2)
  })
})

describe('nextSprintNumber', () => {
  it('starts at 1', () => {
    expect(nextSprintNumber([], null)).toBe(1)
    expect(nextSprintNumber([], 'a')).toBe(1)
  })
  it('continues the program-wide numbering inside a group, so a participant never sees two #4', () => {
    const all = [s(1), s(2), s(3)]
    expect(nextSprintNumber(all, 'a')).toBe(4)
    expect(nextSprintNumber([...all, s(4, 'a')], 'a')).toBe(5)
  })
  it('does not count sprints of other groups for a group', () => {
    expect(nextSprintNumber([s(1), s(7, 'b')], 'a')).toBe(2)
  })
  it('takes the next number over every group for a program-wide sprint', () => {
    expect(nextSprintNumber([s(1), s(7, 'b')], null)).toBe(8)
  })
})

describe('sprintsForParticipant', () => {
  const all = [s(1), s(2, 'a'), s(3, 'b')]
  it('gives program-wide sprints plus the participant\'s own group', () => {
    expect(sprintsForParticipant(all, 'a')).toEqual([s(1), s(2, 'a')])
  })
  it('gives only program-wide sprints to someone without a group', () => {
    expect(sprintsForParticipant(all, null)).toEqual([s(1)])
    expect(sprintsForParticipant(all, undefined)).toEqual([s(1)])
  })
})

describe('defaultGroupSelection', () => {
  const groups = [{ id: 'a' }, { id: 'b' }]
  it('opens the program-wide sprints when groups are new and nothing is grouped yet', () => {
    expect(defaultGroupSelection(groups, [s(1), s(2)])).toBe(NO_GROUP)
  })
  it('opens the first group that has sprints when there are no program-wide ones', () => {
    expect(defaultGroupSelection(groups, [s(1, 'b')])).toBe('b')
  })
  it('opens the first group when there are no sprints at all', () => {
    expect(defaultGroupSelection(groups, [])).toBe('a')
  })
  it('falls back to program-wide when there are no groups', () => {
    expect(defaultGroupSelection([], [])).toBe(NO_GROUP)
  })
})
