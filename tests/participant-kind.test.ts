import { describe, expect, it } from 'vitest'
import { countByKind, findGuestProgram, isGuestProgram, kindOf, kindPatch, memberPrograms } from '@/lib/participant-kind'

const programs = [
  { id: 'p1', name: 'Год в деле 1' },
  { id: 'p2', name: 'Год в деле 2' },
  { id: 'g', name: 'Гостевой' },
]

describe('kindOf', () => {
  it('tells a member, a guest and an archived person', () => {
    expect(kindOf({ status: 'active', program: { name: 'Год в деле 2' } })).toBe('member')
    expect(kindOf({ status: 'active', program: { name: 'Гостевой' } })).toBe('guest')
    expect(kindOf({ status: 'archived', program: { name: 'Год в деле 2' } })).toBe('archived')
  })
  it('archived wins over guest, and a finished participant is still a member', () => {
    expect(kindOf({ status: 'archived', program: { name: 'Гостевой' } })).toBe('archived')
    expect(kindOf({ status: 'completed', program: { name: 'Год в деле 1' } })).toBe('member')
  })
  it('copes with a missing program', () => {
    expect(kindOf({ status: 'active' })).toBe('member')
    expect(kindOf({ status: 'active', program: null })).toBe('member')
  })
})

describe('guest program', () => {
  it('is found by its name in any case', () => {
    expect(isGuestProgram({ name: 'Гостевой' })).toBe(true)
    expect(isGuestProgram({ name: 'гости' })).toBe(true)
    expect(isGuestProgram({ name: 'Год в деле 1' })).toBe(false)
    expect(findGuestProgram(programs)?.id).toBe('g')
    expect(memberPrograms(programs).map(p => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('kindPatch', () => {
  it('moves a person into a group and makes them active', () => {
    expect(kindPatch({ kind: 'member', programId: 'p2' }, programs)).toEqual({ program_id: 'p2', status: 'active' })
  })
  it('makes a guest by switching to the guest program', () => {
    expect(kindPatch({ kind: 'guest' }, programs)).toEqual({ program_id: 'g', status: 'active' })
  })
  it('archives without touching the program', () => {
    expect(kindPatch({ kind: 'archived' }, programs)).toEqual({ status: 'archived' })
  })
  it('cannot make a guest when there is no guest program', () => {
    expect(kindPatch({ kind: 'guest' }, programs.slice(0, 2))).toBeNull()
  })
})

describe('countByKind', () => {
  it('counts each kind', () => {
    const list = [
      { status: 'active', program: { name: 'Год в деле 1' } },
      { status: 'active', program: { name: 'Год в деле 2' } },
      { status: 'active', program: { name: 'Гостевой' } },
      { status: 'archived', program: { name: 'Год в деле 2' } },
      { status: 'archived', program: { name: 'Год в деле 2' } },
    ]
    expect(countByKind(list)).toEqual({ member: 2, guest: 1, archived: 2 })
  })
})
