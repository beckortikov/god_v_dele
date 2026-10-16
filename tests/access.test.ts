import { describe, expect, it } from 'vitest'
import { generatePassword, isEmployeeAccountRole, loginProblem, passwordProblem, suggestLogin, transliterate, credentialsText } from '@/lib/access'

describe('suggestLogin', () => {
  it('turns a Russian name into a Latin login', () => {
    expect(suggestLogin('Алиев Ахмад')).toBe('aliev.ahmad')
    expect(suggestLogin('Щербакова Юлия')).toBe('scherbakova.yuliya')
  })
  it('handles Tajik letters, extra spaces and a middle name', () => {
    expect(transliterate('Ҷӯраев Қодир')).toBe('juraev qodir')
    expect(suggestLogin('  Ёрова   Нигина  Баходуровна ')).toBe('erova.nigina')
  })
  it('keeps only letters and digits, and stays short', () => {
    expect(suggestLogin("O'Neil, John")).toBe('oneil.john')
    expect(suggestLogin('Аааааааааааааааааааа Бббббббббббббббббббб').length).toBeLessThanOrEqual(30)
    expect(suggestLogin('')).toBe('')
  })
})

describe('loginProblem / passwordProblem', () => {
  it('accepts normal logins', () => {
    for (const l of ['aliev.ahmad', 'hamid', 'a_b-c@d', 'user123']) expect(loginProblem(l)).toBeNull()
  })
  it('refuses empty, short, long and non-Latin logins', () => {
    expect(loginProblem('')).toMatch(/логин/i)
    expect(loginProblem('ab')).toMatch(/короче/)
    expect(loginProblem('x'.repeat(41))).toMatch(/длиннее/)
    expect(loginProblem('алиев')).toMatch(/латинские/)
    expect(loginProblem('with space')).toMatch(/латинские/)
    expect(loginProblem(42)).toMatch(/логин/i)
  })
  it('wants a password of at least 8 characters', () => {
    expect(passwordProblem('')).toMatch(/пароль/i)
    expect(passwordProblem('short')).toMatch(/короче/)
    expect(passwordProblem('longenough1')).toBeNull()
    expect(passwordProblem(undefined)).toMatch(/пароль/i)
  })
})

describe('generatePassword', () => {
  const seeded = (seed: number) => {
    let s = seed
    return (max: number) => {
      s = (s * 1664525 + 1013904223) % 0x1_0000_0000
      return s % max
    }
  }
  it('makes 10 characters with a capital, a small letter and a digit, never an ambiguous one', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = generatePassword(seeded(seed))
      expect(p).toHaveLength(10)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).not.toMatch(/[01OlI]/)
      expect(passwordProblem(p)).toBeNull()
    }
  })
  it('works with the real random source and differs between calls', () => {
    const a = generatePassword()
    const b = generatePassword()
    expect(a).toHaveLength(10)
    expect(a).not.toBe(b)
  })
})

describe('credentialsText and roles', () => {
  it('writes the message to hand over', () => {
    expect(credentialsText({ url: 'https://x.tj', username: 'aliev', password: 'Abcd2345ef' })).toBe('Вход: https://x.tj\nЛогин: aliev\nПароль: Abcd2345ef')
  })
  it('offers employees every role except participant', () => {
    for (const r of ['employee', 'manager', 'finance', 'wheels_manager', 'admin']) expect(isEmployeeAccountRole(r)).toBe(true)
    expect(isEmployeeAccountRole('participant')).toBe(false)
    expect(isEmployeeAccountRole('root')).toBe(false)
  })
})
