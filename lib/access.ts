/**
 * Logins and passwords for people created in the app (employees, participants).
 * Pure, so it is covered by tests; the server re-checks everything with the
 * same functions, the browser only uses them to suggest and to explain.
 */

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Tajik
  ғ: 'g', ӣ: 'i', қ: 'q', ӯ: 'u', ҳ: 'h', ҷ: 'j',
}

export function transliterate(text: string): string {
  return [...text.toLowerCase()].map(ch => LATIN[ch] ?? ch).join('')
}

/** «Алиев Ахмад» → «aliev.ahmad»: the words as written, joined with a dot, Latin letters and digits only. */
export function suggestLogin(fullName: string): string {
  const words = transliterate(fullName)
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 2)
  return words.join('.').slice(0, 30)
}

export const LOGIN_MIN = 3
export const LOGIN_MAX = 40
export const PASSWORD_MIN = 8

/** Returns the reason a login is refused, or null. */
export function loginProblem(login: unknown): string | null {
  if (typeof login !== 'string' || !login.trim()) return 'Придумайте логин'
  const v = login.trim()
  if (v.length < LOGIN_MIN) return `Логин короче ${LOGIN_MIN} символов`
  if (v.length > LOGIN_MAX) return `Логин длиннее ${LOGIN_MAX} символов`
  if (!/^[A-Za-z0-9._@-]+$/.test(v)) return 'В логине только латинские буквы, цифры и . _ - @'
  return null
}

/** Returns the reason a password is refused, or null. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || !password) return 'Задайте пароль'
  if (password.length < PASSWORD_MIN) return `Пароль короче ${PASSWORD_MIN} символов`
  if (password.length > 100) return 'Пароль слишком длинный'
  return null
}

// No 0/O, 1/l/I: a password read out over the phone or typed from a screenshot must not be ambiguous.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'

/** A random password of 10 characters with a capital, a small letter and a digit. `randomInt(n)` returns 0..n-1. */
export function generatePassword(randomInt: (max: number) => number = browserRandomInt): string {
  const pick = (set: string) => set[randomInt(set.length)]
  const all = UPPER + LOWER + DIGITS
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)]
  while (chars.length < 10) chars.push(pick(all))
  // Fisher–Yates, so the guaranteed characters are not always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function browserRandomInt(max: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x1_0000_0000 / max) * max
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

/** The message to hand to the person: where to sign in, the login and the password. */
export function credentialsText(c: { url: string; username: string; password: string }): string {
  return `Вход: ${c.url}\nЛогин: ${c.username}\nПароль: ${c.password}`
}

/** Roles an administrator may give to an employee. «participant» is for participants only. */
export const EMPLOYEE_ACCOUNT_ROLES = ['employee', 'manager', 'finance', 'wheels_manager', 'admin'] as const
export type EmployeeAccountRole = (typeof EMPLOYEE_ACCOUNT_ROLES)[number]
export const isEmployeeAccountRole = (v: unknown): v is EmployeeAccountRole => (EMPLOYEE_ACCOUNT_ROLES as readonly unknown[]).includes(v)
