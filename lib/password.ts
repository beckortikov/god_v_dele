/**
 * Password hashing for app_users.password.
 *
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64>. Passwords written
 * before hashing existed are plain text; verifyPassword() still accepts them
 * (compared in constant time) so nobody is locked out, and the login route
 * replaces them with a hash on the first successful login.
 *
 * Server only: uses node:crypto.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const PREFIX = 'scrypt'
const N = 16384
const R = 8
const P = 1
const KEY_LEN = 64
const SALT_LEN = 16

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** True when the stored value is one of our hashes (not a legacy plain-text password). */
export function isHashed(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(`${PREFIX}$`)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P })
  return [PREFIX, N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

function equalText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  // timingSafeEqual needs equal lengths; compare against itself so the time does not leak the length check
  if (x.length !== y.length) {
    timingSafeEqual(x, x)
    return false
  }
  return timingSafeEqual(x, y)
}

/**
 * Checks a password against what is stored. An empty or missing stored value
 * never matches, and neither does an empty password.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!password || !stored) return false
  if (!isHashed(stored)) return equalText(password, stored)

  const [, n, r, p, saltB64, hashB64] = stored.split('$')
  const salt = Buffer.from(saltB64 ?? '', 'base64')
  const expected = Buffer.from(hashB64 ?? '', 'base64')
  if (!salt.length || !expected.length) return false
  try {
    const key = await scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) })
    return timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/** Burns about the same time as a real check, so an unknown login is not faster than a wrong password. */
export async function fakeVerify(password: string): Promise<void> {
  await scrypt(password || 'x', Buffer.alloc(SALT_LEN), KEY_LEN, { N, r: R, p: P })
}
