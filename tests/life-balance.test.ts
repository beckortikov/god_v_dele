import { describe, expect, it } from 'vitest'
import { average, gapToIdeal, previousRatedMonth, ratedCount, stepScore, weakestSphere } from '@/lib/life-balance'

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр']

describe('life balance helpers', () => {
  it('counts and averages only rated spheres', () => {
    const cats = ['a', 'b', 'c']
    expect(ratedCount({ a: 4, c: 7 }, cats)).toBe(2)
    expect(average({ a: 4, c: 7 }, cats)).toBe(5.5)
    expect(average({ a: 0, b: 0 }, cats)).toBe(0)
    expect(average({}, cats)).toBeNull()
    expect(average(undefined, cats)).toBeNull()
  })

  it('ignores scores of categories that are no longer in the list', () => {
    expect(average({ a: 10, gone: 0 }, ['a'])).toBe(10)
  })

  it('finds the closest earlier month with ratings', () => {
    const monthly = { Янв: { a: 3 }, Фев: {}, Апр: { a: 6 } }
    expect(previousRatedMonth(monthly, MONTHS, 3)).toBe(0)
    expect(previousRatedMonth(monthly, MONTHS, 2)).toBe(0)
    expect(previousRatedMonth(monthly, MONTHS, 0)).toBeNull()
    expect(previousRatedMonth({}, MONTHS, 3)).toBeNull()
  })

  it('steps by one and stays within 0–10', () => {
    expect(stepScore(5, 1)).toBe(6)
    expect(stepScore(5, -1)).toBe(4)
    expect(stepScore(10, 1)).toBe(10)
    expect(stepScore(0, -1)).toBe(0)
  })

  it('first press on an empty sphere fills it from last month, else the middle', () => {
    expect(stepScore(undefined, 1, 7)).toBe(7)
    expect(stepScore(undefined, -1, 7)).toBe(7)
    expect(stepScore(undefined, 1)).toBe(5)
  })

  it('measures the gap to the ideal and picks the weakest sphere', () => {
    expect(gapToIdeal(6, 10)).toBe(4)
    expect(gapToIdeal(10, 8)).toBe(0)
    expect(gapToIdeal(undefined, 10)).toBeNull()
    expect(weakestSphere({ a: 8, b: 3, c: 9 }, { b: 6 }, ['a', 'b', 'c'])).toEqual({ category: 'b', gap: 3 })
    expect(weakestSphere({ a: 8, b: 3 }, {}, ['a', 'b'])).toEqual({ category: 'b', gap: 7 })
    expect(weakestSphere({ a: 10 }, {}, ['a'])).toBeNull()
    expect(weakestSphere({}, {}, ['a'])).toBeNull()
  })
})
