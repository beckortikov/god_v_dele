import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cookieValue, createSessionToken, ownIds, readSessionToken, SESSION_COOKIE, SESSION_DAYS } from '@/lib/session'

const user = { id: 'u1', role: 'participant', employee_id: null, participant_id: 'p1', full_name: 'Али' }
const NOW = Date.UTC(2026, 9, 12, 10, 0, 0)

const saved = { ...process.env }
beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-tests'
  delete process.env.SESSION_SECRET
})
afterEach(() => {
  process.env = { ...saved }
})

describe('session token', () => {
  it('round-trips the user', () => {
    const s = readSessionToken(createSessionToken(user, NOW), NOW)
    expect(s).toMatchObject({ uid: 'u1', role: 'participant', eid: null, pid: 'p1', name: 'Али' })
  })

  it('expires after the session lifetime', () => {
    const t = createSessionToken(user, NOW)
    const day = 86_400_000
    expect(readSessionToken(t, NOW + (SESSION_DAYS - 1) * day)).not.toBeNull()
    expect(readSessionToken(t, NOW + (SESSION_DAYS + 1) * day)).toBeNull()
  })

  it('rejects a payload that was edited, such as a participant promoted to admin', () => {
    const t = createSessionToken(user, NOW)
    const [body, sig] = t.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    payload.role = 'admin'
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`
    expect(readSessionToken(forged, NOW)).toBeNull()
  })

  it('rejects a token signed with another key', () => {
    const t = createSessionToken(user, NOW)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'another-key'
    expect(readSessionToken(t, NOW)).toBeNull()
  })

  it('prefers SESSION_SECRET when it is set', () => {
    process.env.SESSION_SECRET = 'a-long-random-secret-value'
    const t = createSessionToken(user, NOW)
    expect(readSessionToken(t, NOW)).not.toBeNull()
    process.env.SESSION_SECRET = 'a-different-long-secret'
    expect(readSessionToken(t, NOW)).toBeNull()
  })

  it('rejects garbage, empty values and unknown roles', () => {
    for (const bad of [null, undefined, '', 'abc', 'a.b.c', '.', 'x.', '.x']) expect(readSessionToken(bad, NOW)).toBeNull()
    const t = createSessionToken({ ...user, role: 'superuser' }, NOW)
    expect(readSessionToken(t, NOW)).toBeNull()
  })

  it('does not trust a token without its signature', () => {
    const [body] = createSessionToken(user, NOW).split('.')
    expect(readSessionToken(`${body}.`, NOW)).toBeNull()
    expect(readSessionToken(body, NOW)).toBeNull()
  })
})

describe('cookie helpers', () => {
  it('finds a cookie among others', () => {
    expect(cookieValue(`a=1; ${SESSION_COOKIE}=tok.en; b=2`, SESSION_COOKIE)).toBe('tok.en')
    expect(cookieValue('a=1', SESSION_COOKIE)).toBeNull()
    expect(cookieValue(null, SESSION_COOKIE)).toBeNull()
    expect(cookieValue(`x${SESSION_COOKIE}=nope`, SESSION_COOKIE)).toBeNull()
  })

  it('lists the ids that identify a person', () => {
    expect(ownIds({ uid: 'u', eid: 'e', pid: null })).toEqual(['u', 'e'])
    expect(ownIds({ uid: 'u', eid: null, pid: 'p' })).toEqual(['u', 'p'])
  })
})
