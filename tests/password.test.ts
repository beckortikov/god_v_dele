import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { hashPassword, isHashed, verifyPassword } from '@/lib/password'

describe('password hashing', () => {
  it('hashes to a salted scrypt string, never the password itself', async () => {
    const h = await hashPassword('Секрет-123')
    expect(isHashed(h)).toBe(true)
    expect(h.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(h).not.toContain('Секрет-123')
  })

  it('uses a new salt every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('accepts the right password and rejects a wrong one', async () => {
    const h = await hashPassword('Секрет-123')
    expect(await verifyPassword('Секрет-123', h)).toBe(true)
    expect(await verifyPassword('секрет-123', h)).toBe(false)
    expect(await verifyPassword('Секрет-1234', h)).toBe(false)
  })

  it('still accepts legacy plain-text passwords, in constant time', async () => {
    expect(isHashed('admin123')).toBe(false)
    expect(await verifyPassword('admin123', 'admin123')).toBe(true)
    expect(await verifyPassword('admin124', 'admin123')).toBe(false)
    expect(await verifyPassword('adm', 'admin123')).toBe(false)
  })

  it('never matches an empty password or an empty stored value', async () => {
    expect(await verifyPassword('', '')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('', 'x')).toBe(false)
    expect(await verifyPassword('x', null)).toBe(false)
    expect(await verifyPassword('', await hashPassword('x'))).toBe(false)
  })

  it('rejects a broken or tampered hash instead of throwing', async () => {
    const h = await hashPassword('x')
    expect(await verifyPassword('x', 'scrypt$16384$8$1$$')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$not$numbers$at$all$ok')).toBe(false)
    expect(await verifyPassword('x', h.slice(0, -6) + 'AAAAAA')).toBe(false)
  })

  it('handles unicode and long passwords', async () => {
    const long = 'п'.repeat(300)
    const h = await hashPassword(long)
    expect(await verifyPassword(long, h)).toBe(true)
    expect(await verifyPassword(long.slice(1), h)).toBe(false)
  })
})

describe('scripts/hash-existing-passwords.js stays compatible with lib/password.ts', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const script = createRequire(import.meta.url)('../scripts/hash-existing-passwords.js') as {
    hashPassword: (p: string) => Promise<string>
    verifyHash: (p: string, h: string) => Promise<boolean>
  }

  it('hashes written by the script verify in the app', async () => {
    const h = await script.hashPassword('Скрипт-Пароль-1')
    expect(await verifyPassword('Скрипт-Пароль-1', h)).toBe(true)
    expect(await verifyPassword('Скрипт-Пароль-2', h)).toBe(false)
  })

  it('hashes written by the app verify in the script', async () => {
    const h = await hashPassword('Приложение-1')
    expect(await script.verifyHash('Приложение-1', h)).toBe(true)
    expect(await script.verifyHash('Приложение-2', h)).toBe(false)
  })
})
