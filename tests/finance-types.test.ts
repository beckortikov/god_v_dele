import { describe, expect, it } from 'vitest'
import { accountsFor, pickAccount, type Account } from '@/components/finance/types'

const acc = (id: string, program_id: string | null, is_default = false, currency = 'TJS'): Account => ({
  id,
  name: id,
  currency,
  program_id,
  is_default,
})

const global1 = acc('global-1', null)
const globalDefault = acc('global-def', null, true)
const progA = acc('prog-a', 'A')
const progADefault = acc('prog-a-def', 'A', true)
const progB = acc('prog-b', 'B')
const all = [global1, globalDefault, progA, progADefault, progB]

describe('accountsFor', () => {
  it('returns every account when no program is given', () => {
    expect(accountsFor(all)).toEqual(all)
    expect(accountsFor(all, null)).toEqual(all)
    expect(accountsFor(all, '')).toEqual(all)
  })

  it("returns the program's own accounts plus global ones", () => {
    expect(accountsFor(all, 'A').map(a => a.id)).toEqual(['global-1', 'global-def', 'prog-a', 'prog-a-def'])
    expect(accountsFor(all, 'B').map(a => a.id)).toEqual(['global-1', 'global-def', 'prog-b'])
  })

  it('returns only global accounts for a program without its own', () => {
    expect(accountsFor(all, 'C').map(a => a.id)).toEqual(['global-1', 'global-def'])
  })

  it('handles an empty list', () => {
    expect(accountsFor([], 'A')).toEqual([])
  })

  it('does not mutate the input', () => {
    const copy = [...all]
    accountsFor(all, 'A')
    expect(all).toEqual(copy)
  })
})

describe('pickAccount', () => {
  it('prefers the remembered account when it is available', () => {
    expect(pickAccount(all, 'prog-b')).toBe('prog-b')
  })

  it('ignores a remembered account that is not among the options', () => {
    const options = accountsFor(all, 'A')
    expect(pickAccount(options, 'prog-b')).toBe('global-def')
  })

  it('falls back to the first default account', () => {
    expect(pickAccount([progA, progADefault, global1])).toBe('prog-a-def')
    expect(pickAccount([progA, progADefault], null)).toBe('prog-a-def')
  })

  it('picks the only option when there is no default', () => {
    expect(pickAccount([progB])).toBe('prog-b')
  })

  it('returns an empty string when the choice is ambiguous or impossible', () => {
    expect(pickAccount([progA, progB])).toBe('')
    expect(pickAccount([])).toBe('')
    expect(pickAccount([], 'prog-a')).toBe('')
  })
})
