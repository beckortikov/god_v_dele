import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { POST as createEmployee } from '@/app/api/hr/employees/route'
import { POST as createParticipant } from '@/app/api/participants/route'
import { GET as getAccess, POST as postAccess, PUT as putAccess } from '@/app/api/access/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { isHashed, verifyPassword } from '@/lib/password'
import { fake } from './helpers/fake-db'

const db = { rows: (t: string) => fake.rows(t), state: fake }

const EMP = '11111111-1111-4111-8111-111111111111'
const PART = '22222222-2222-4222-8222-222222222222'
const cookie = (role: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${role}`, role, full_name: role })}`
const post = (url: string, body: unknown, role = 'admin', method = 'POST') =>
  new Request(`http://test${url}`, { method, headers: { 'Content-Type': 'application/json', cookie: cookie(role) }, body: JSON.stringify(body) })
const get = (url: string, role = 'admin') => new Request(`http://test${url}`, { headers: { cookie: cookie(role) } })

const employee = { first_name: 'Ахмад', last_name: 'Алиев', position: 'Менеджер', base_salary: 1000 }
const account = { username: 'aliev.ahmad', password: 'Secret2345', role: 'manager' }
const users = () => db.rows('app_users')

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('creating an employee with a sign-in', () => {
  it('creates the employee and a linked account with a hashed password and the chosen role', async () => {
    const res = await createEmployee(post('/api/hr/employees', { ...employee, account }))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain('Secret2345')
    expect(JSON.parse(text).account).toEqual({ username: 'aliev.ahmad', role: 'manager' })

    expect(db.rows('employees')).toHaveLength(1)
    expect(db.rows('employees')[0]).not.toHaveProperty('account')
    const [user] = users()
    expect(user).toMatchObject({ username: 'aliev.ahmad', role: 'manager', full_name: 'Ахмад Алиев', employee_id: db.rows('employees')[0].id })
    expect(isHashed(user.password)).toBe(true)
    expect(await verifyPassword('Secret2345', user.password)).toBe(true)
    // the журнал must not hold the password
    expect(JSON.stringify(db.rows('audit_log'))).not.toContain('Secret2345')
  })

  it('still creates just the employee when no account is asked for', async () => {
    const res = await createEmployee(post('/api/hr/employees', employee))
    expect(res.status).toBe(200)
    expect((await res.json()).account).toBeNull()
    expect(users()).toHaveLength(0)
  })

  it('refuses a taken login in any letter case, before creating anything', async () => {
    db.rows('app_users').push({ id: 'old', username: 'Aliev.Ahmad', role: 'finance', password: 'x' })
    const res = await createEmployee(post('/api/hr/employees', { ...employee, account }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/занят/)
    expect(db.rows('employees')).toHaveLength(0)
  })

  it('refuses a weak password, a bad login and the participant role', async () => {
    for (const bad of [{ ...account, password: 'short' }, { ...account, username: 'алиев' }, { ...account, role: 'participant' }, { ...account, role: undefined }]) {
      const res = await createEmployee(post('/api/hr/employees', { ...employee, account: bad }))
      expect(res.status).toBe(400)
    }
    expect(db.rows('employees')).toHaveLength(0)
    expect(users()).toHaveLength(0)
  })

  it('does not leave an employee behind when the account cannot be saved', async () => {
    db.state.failInsert.add('app_users')
    const res = await createEmployee(post('/api/hr/employees', { ...employee, account }))
    expect(res.status).toBe(500)
    expect(db.rows('employees')).toHaveLength(0)
  })
})

describe('creating a participant with a sign-in', () => {
  const participant = { name: 'Бобоева Мадина', program_id: 'prog', start_date: '2026-10-01', phone: '+992900000000' }

  it('links a participant account and fixes the role to «participant»', async () => {
    // a client cannot raise its own role by sending one
    const res = await createParticipant(post('/api/participants', { ...participant, account: { username: 'boboeva.madina', password: 'Secret2345', role: 'admin' } }, 'wheels_manager'))
    const text = await res.text()
    expect(res.status).toBe(201)
    expect(text).not.toContain('Secret2345')
    expect(JSON.parse(text).account).toEqual({ username: 'boboeva.madina' })
    const [user] = users()
    expect(user).toMatchObject({ role: 'participant', participant_id: db.rows('participants')[0].id, full_name: 'Бобоева Мадина' })
    expect(isHashed(user.password)).toBe(true)
  })

  it('creates the participant alone without an account', async () => {
    const res = await createParticipant(post('/api/participants', participant, 'finance'))
    expect(res.status).toBe(201)
    expect(users()).toHaveLength(0)
  })

  it('rolls the participant back on a taken login', async () => {
    db.rows('app_users').push({ id: 'old', username: 'boboeva.madina', role: 'participant', password: 'x' })
    const res = await createParticipant(post('/api/participants', { ...participant, account: { username: 'BOBOEVA.madina', password: 'Secret2345' } }))
    expect(res.status).toBe(409)
    expect(db.rows('participants')).toHaveLength(0)
  })
})

describe('/api/access for existing people', () => {
  beforeEach(() => {
    db.rows('participants').push({ id: PART, name: 'Валиев Рустам' })
    db.rows('employees').push({ id: EMP, first_name: 'Дилшод', last_name: 'Каримов' })
  })

  it('reports no account, then creates one for a participant (finance may) and refuses a second', async () => {
    expect((await (await getAccess(get(`/api/access?participant_id=${PART}`, 'finance'))).json()).data).toBeNull()
    const made = await postAccess(post('/api/access', { participant_id: PART, username: 'valiev.rustam', password: 'Secret2345' }, 'finance'))
    expect(made.status).toBe(201)
    expect(users()[0]).toMatchObject({ role: 'participant', participant_id: PART, full_name: 'Валиев Рустам' })
    const info = await (await getAccess(get(`/api/access?participant_id=${PART}`, 'finance'))).text()
    expect(info).toContain('valiev.rustam')
    expect(info).not.toContain('password')
    const again = await postAccess(post('/api/access', { participant_id: PART, username: 'other.login', password: 'Secret2345' }, 'finance'))
    expect(again.status).toBe(409)
  })

  it('only an admin may touch an employee\'s sign-in, and picks the role', async () => {
    for (const role of ['finance', 'wheels_manager']) {
      expect((await postAccess(post('/api/access', { employee_id: EMP, username: 'karimov.dilshod', password: 'Secret2345', role: 'employee' }, role))).status).toBe(403)
      expect((await getAccess(get(`/api/access?employee_id=${EMP}`, role))).status).toBe(403)
    }
    expect(users()).toHaveLength(0)
    expect((await postAccess(post('/api/access', { employee_id: EMP, username: 'karimov.dilshod', password: 'Secret2345', role: 'participant' }))).status).toBe(400)
    const ok = await postAccess(post('/api/access', { employee_id: EMP, username: 'karimov.dilshod', password: 'Secret2345', role: 'finance' }))
    expect(ok.status).toBe(201)
    expect(users()[0]).toMatchObject({ role: 'finance', employee_id: EMP, full_name: 'Дилшод Каримов' })
  })

  it('resets a password: a new hash, nothing in the response or the журнал', async () => {
    await postAccess(post('/api/access', { participant_id: PART, username: 'valiev.rustam', password: 'Secret2345' }, 'finance'))
    const oldHash = users()[0].password
    const res = await putAccess(post('/api/access', { participant_id: PART, password: 'NewSecret99' }, 'wheels_manager', 'PUT'))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain('NewSecret99')
    expect(users()[0].password).not.toBe(oldHash)
    expect(await verifyPassword('NewSecret99', users()[0].password)).toBe(true)
    expect(JSON.stringify(db.rows('audit_log'))).not.toContain('NewSecret99')
    expect((await putAccess(post('/api/access', { participant_id: PART, password: 'short' }, 'finance', 'PUT'))).status).toBe(400)
  })

  it('asks for exactly one person', async () => {
    expect((await getAccess(get('/api/access'))).status).toBe(400)
    expect((await getAccess(get(`/api/access?employee_id=${EMP}&participant_id=${PART}`))).status).toBe(400)
    expect((await getAccess(get('/api/access?participant_id=not-a-uuid'))).status).toBe(400)
  })
})
