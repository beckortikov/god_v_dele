import { describe, expect, it } from 'vitest'
import { formatDate, formatMoney, formatNumber, plural, todayISO, MONTHS_RU, MONTHS_SHORT_RU } from '@/lib/format'

/** ICU uses NBSP / narrow NBSP as the group separator; compare with plain spaces. */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const money = (...args: Parameters<typeof formatMoney>) => sp(formatMoney(...args))

describe('formatMoney', () => {
  it('formats USD with the symbol before and thousands grouped', () => {
    expect(money(12400)).toBe('$12 400')
    expect(money(12400, 'USD')).toBe('$12 400')
    expect(money(0)).toBe('$0')
  })

  it('places symbols for each known currency', () => {
    expect(money(8500, 'TJS')).toBe('8 500 TJS')
    expect(money(1000, 'RUB')).toBe('1 000 ₽')
    expect(money(1000, 'EUR')).toBe('€1 000')
  })

  it('falls back to the currency code after the amount for unknown currencies', () => {
    expect(money(250, 'KZT')).toBe('250 KZT')
  })

  it('keeps two fraction digits only when there are cents', () => {
    expect(money(1234.5)).toBe('$1 234,50')
    expect(money(0.1 + 0.2)).toBe('$0,30')
    expect(money(99.99, 'TJS')).toBe('99,99 TJS')
    expect(money(100.0)).toBe('$100')
  })

  it('treats float noise below a cent as a whole number', () => {
    expect(money(999.9999999999999)).toBe('$1 000')
    expect(money(12.001)).toBe('$12')
  })

  it('uses a typographic minus for negatives, never a plus', () => {
    expect(money(-500)).toBe('−$500')
    expect(money(-500, 'TJS')).toBe('−500 TJS')
    expect(money(-500, 'USD', { sign: true })).toBe('−$500')
    expect(money(-1234.5, 'RUB')).toBe('−1 234,50 ₽')
  })

  it('adds a plus only when sign is requested and the value is positive', () => {
    expect(money(500, 'USD', { sign: true })).toBe('+$500')
    expect(money(500, 'USD', { sign: false })).toBe('$500')
    expect(money(0, 'USD', { sign: true })).toBe('$0')
  })

  it('accepts numeric strings and treats empty / invalid values as zero', () => {
    expect(money('1500.25', 'TJS')).toBe('1 500,25 TJS')
    expect(money(null)).toBe('$0')
    expect(money(undefined)).toBe('$0')
    expect(money('abc')).toBe('$0')
    expect(money(Number.NaN)).toBe('$0')
  })
})

describe('formatNumber', () => {
  it('groups thousands and drops fractions', () => {
    expect(sp(formatNumber(1234567))).toBe('1 234 567')
    expect(sp(formatNumber(12.6))).toBe('13')
  })
})

describe('formatDate', () => {
  it('formats short dates as dd.mm.yyyy', () => {
    expect(formatDate('2026-03-05')).toBe('05.03.2026')
    expect(formatDate(new Date(2026, 11, 31))).toBe('31.12.2026')
  })

  it('formats long dates with the genitive month name', () => {
    expect(sp(formatDate('2026-03-05', 'long'))).toMatch(/^5 марта 2026/)
    expect(sp(formatDate(new Date(2026, 0, 1), 'long'))).toMatch(/^1 января 2026/)
  })

  it('returns a dash for empty or invalid input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not a date')).toBe('—')
    expect(formatDate(new Date('invalid'))).toBe('—')
  })
})

describe('plural', () => {
  const forms: [string, string, string] = ['платёж', 'платежа', 'платежей']
  it.each([
    [0, 'платежей'],
    [1, 'платёж'],
    [2, 'платежа'],
    [4, 'платежа'],
    [5, 'платежей'],
    [11, 'платежей'],
    [12, 'платежей'],
    [14, 'платежей'],
    [19, 'платежей'],
    [21, 'платёж'],
    [22, 'платежа'],
    [25, 'платежей'],
    [101, 'платёж'],
    [111, 'платежей'],
    [112, 'платежей'],
    [1001, 'платёж'],
    [-1, 'платёж'],
    [-3, 'платежа'],
  ])('%i → %s', (n, expected) => {
    expect(plural(n, forms)).toBe(expected)
  })
})

describe('constants and helpers', () => {
  it('has twelve month names', () => {
    expect(MONTHS_RU).toHaveLength(12)
    expect(MONTHS_SHORT_RU).toHaveLength(12)
    expect(MONTHS_RU[0]).toBe('Январь')
  })

  it('todayISO returns the local date as YYYY-MM-DD', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})
