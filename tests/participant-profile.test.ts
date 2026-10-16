import { describe, expect, it } from 'vitest'
import { ProfileInputError, completeness, parseProfile, parseYear, percentChange, scanProblem, yearlyDynamics } from '@/lib/participant-profile'

const TODAY = '2026-10-16'

describe('parseProfile', () => {
  it('trims text, turns blanks into null and keeps only known fields', () => {
    const out = parseProfile({ city: '  Душанбе ', address: '   ', activity: 'Розничная торговля', hacker: 'x', participant_id: 'other' }, TODAY)
    expect(out).toEqual({ city: 'Душанбе', address: null, activity: 'Розничная торговля' })
  })
  it('leaves absent fields absent, so a partial save does not wipe the rest', () => {
    expect(parseProfile({ city: 'Худжанд' }, TODAY)).toEqual({ city: 'Худжанд' })
  })
  it('checks the birth date', () => {
    expect(parseProfile({ birth_date: '1990-05-17' }, TODAY).birth_date).toBe('1990-05-17')
    expect(parseProfile({ birth_date: '' }, TODAY).birth_date).toBeNull()
    expect(() => parseProfile({ birth_date: '2030-01-01' }, TODAY)).toThrow(ProfileInputError)
    expect(() => parseProfile({ birth_date: '17.05.1990' }, TODAY)).toThrow(/ГГГГ/)
    expect(() => parseProfile({ birth_date: '1800-01-01' }, TODAY)).toThrow(/неверно/)
  })
  it('refuses over-long text and unknown currencies', () => {
    expect(() => parseProfile({ city: 'x'.repeat(101) }, TODAY)).toThrow(/Город/)
    expect(() => parseProfile({ currency: 'BTC' }, TODAY)).toThrow(/валют/i)
    expect(parseProfile({ currency: 'USD' }, TODAY).currency).toBe('USD')
    expect(() => parseProfile({ city: 5 }, TODAY)).toThrow(/текст/)
    expect(() => parseProfile(null, TODAY)).toThrow()
  })
})

describe('parseYear', () => {
  it('accepts numbers typed with spaces and a comma, and rounds to cents', () => {
    expect(parseYear({ year: 2024, turnover: '1 250 000,555', net_profit: '-4000' }, 2026)).toEqual({
      year: 2024,
      turnover: 1250000.56,
      net_profit: -4000,
      notes: null,
    })
  })
  it('needs a sensible year and at least one number', () => {
    expect(() => parseYear({ year: 1985, turnover: 1 }, 2026)).toThrow(/Год/)
    expect(() => parseYear({ year: 2028, turnover: 1 }, 2026)).toThrow(/Год/)
    expect(() => parseYear({ year: 2024 }, 2026)).toThrow(/оборот/i)
    expect(() => parseYear({ year: 2024, turnover: 'abc' }, 2026)).toThrow(/число/)
    expect(() => parseYear({ year: 2024, turnover: -5 }, 2026)).toThrow(/отрицательным/)
  })
  it('allows a loss and a year with only the profit', () => {
    expect(parseYear({ year: 2025, net_profit: -100 }, 2026).turnover).toBeNull()
    expect(parseYear({ year: 2025, turnover: 0, net_profit: 0 }, 2026).turnover).toBe(0)
  })
})

describe('year-over-year dynamics', () => {
  it('computes percentage change and refuses to divide by nothing', () => {
    expect(percentChange(100, 150)).toBe(50)
    expect(percentChange(200, 150)).toBe(-25)
    expect(percentChange(0, 10)).toBeNull()
    expect(percentChange(null, 10)).toBeNull()
    expect(percentChange(-100, -50)).toBe(50)
  })
  it('orders the years and compares each with the previous recorded one', () => {
    const base = { participant_id: 'p', notes: null }
    const rows = yearlyDynamics([
      { ...base, year: 2025, turnover: 1500, net_profit: 300 },
      { ...base, year: 2023, turnover: 1000, net_profit: 100 },
      { ...base, year: 2024, turnover: 1200, net_profit: 0 },
    ])
    expect(rows.map(r => r.year)).toEqual([2023, 2024, 2025])
    expect(rows[0]).toMatchObject({ margin: 10, turnover_change: null, profit_change: null })
    expect(rows[1]).toMatchObject({ margin: 0, turnover_change: 20, profit_change: -100 })
    // previous profit is 0: no percentage to show
    expect(rows[2]).toMatchObject({ margin: 20, turnover_change: 25, profit_change: null })
  })
  it('has no margin without turnover', () => {
    const [r] = yearlyDynamics([{ participant_id: 'p', year: 2024, turnover: null, net_profit: 50, notes: null }])
    expect(r.margin).toBeNull()
    const [z] = yearlyDynamics([{ participant_id: 'p', year: 2024, turnover: 0, net_profit: 0, notes: null }])
    expect(z.margin).toBeNull()
  })
})

describe('completeness', () => {
  it('counts what is filled and names what is missing', () => {
    const r = completeness({ birth_date: '1990-01-01', city: 'Душанбе', activity: 'Торговля' }, 0, 0)
    expect(r.done).toBe(3)
    expect(r.total).toBe(6)
    expect(r.missing).toEqual(['Паспортные данные', 'Скан паспорта', 'Оборот и прибыль за год'])
  })
  it('is complete only with every part', () => {
    const full = completeness({ birth_date: '1990-01-01', address: 'ул. Рудаки 1', passport_number: 'A1234567', activity: 'Торговля' }, 2, 1)
    expect(full).toMatchObject({ done: 6, total: 6, missing: [] })
    expect(completeness(null, 0, 0).done).toBe(0)
  })
})

describe('scanProblem', () => {
  const ok = { name: 'passport.jpg', size: 2_000_000, type: 'image/jpeg' }
  it('takes photos and PDF', () => {
    expect(scanProblem(ok, 0)).toBeNull()
    expect(scanProblem({ ...ok, type: 'application/pdf' }, 5)).toBeNull()
  })
  it('refuses documents, empty, huge files and too many', () => {
    expect(scanProblem({ ...ok, type: 'application/msword' }, 0)).toMatch(/фото или PDF/)
    expect(scanProblem({ ...ok, type: 'text/plain' }, 0)).toMatch(/фото или PDF/)
    expect(scanProblem({ ...ok, size: 0 }, 0)).toMatch(/пустой/)
    expect(scanProblem({ ...ok, size: 11 * 1024 * 1024 }, 0)).toMatch(/больше/)
    expect(scanProblem(ok, 6)).toMatch(/до 6/)
    expect(scanProblem({ ...ok, name: ' ' }, 0)).toMatch(/нет имени/)
  })
})
