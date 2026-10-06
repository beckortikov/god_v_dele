import { describe, expect, it } from 'vitest'
import { roundMoney, roundRate } from '@/lib/money'

describe('roundMoney', () => {
  it('rounds to cents', () => {
    expect(roundMoney(12.344)).toBe(12.34)
    expect(roundMoney(12.345)).toBe(12.35)
    expect(roundMoney(100)).toBe(100)
  })

  it('absorbs floating point noise', () => {
    expect(roundMoney(999.9999999999999)).toBe(1000)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(2.675)).toBe(2.68)
    expect(roundMoney(1.1 * 3)).toBe(3.3)
  })

  it('keeps sums of rounded values exact to the cent', () => {
    const parts = [0.1, 0.2, 0.3, 0.4]
    expect(roundMoney(parts.reduce((a, b) => a + b, 0))).toBe(1)
    expect(roundMoney(10.5 * 3.3)).toBe(34.65)
  })

  it('handles negative amounts', () => {
    expect(roundMoney(-12.344)).toBe(-12.34)
    expect(roundMoney(-0.1 - 0.2)).toBe(-0.3)
    expect(roundMoney(-1000)).toBe(-1000)
  })

  it('parses numeric strings', () => {
    expect(roundMoney('1500.456')).toBe(1500.46)
    expect(roundMoney(' 42 ')).toBe(42)
  })

  it('returns 0 for non-finite or empty input', () => {
    expect(roundMoney(Number.NaN)).toBe(0)
    expect(roundMoney(Infinity)).toBe(0)
    expect(roundMoney(-Infinity)).toBe(0)
    expect(roundMoney('abc')).toBe(0)
    expect(roundMoney(undefined)).toBe(0)
    expect(roundMoney(null)).toBe(0)
    expect(roundMoney('')).toBe(0)
  })
})

describe('roundRate', () => {
  it('rounds exchange rates to 4 decimals', () => {
    expect(roundRate(10.93456)).toBe(10.9346)
    expect(roundRate(10.5)).toBe(10.5)
    expect(roundRate(1 / 3)).toBe(0.3333)
  })

  it('absorbs floating point noise', () => {
    expect(roundRate(0.1 + 0.2)).toBe(0.3)
    expect(roundRate(9.99999999999999)).toBe(10)
  })

  it('returns 0 for invalid input', () => {
    expect(roundRate('x')).toBe(0)
    expect(roundRate(Number.NaN)).toBe(0)
  })
})
