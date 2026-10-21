import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { PUT } from '@/app/api/participants/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const GD2 = '11111111-1111-4111-8111-111111111111'
const GUEST = '12121212-1212-4212-8212-121212121212'
const ALI = '22222222-2222-4222-8222-222222222222'
const BOB = '33333333-3333-4333-8333-333333333333'

const put = (body: unknown) =>
  PUT(
    new Request('http://test/api/participants', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE}=${createSessionToken({ id: 'u-admin', role: 'admin', participant_id: null, full_name: 'admin' })}`,
      },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.rows('programs').push({ id: GD2, name: 'Год в деле 2' }, { id: GUEST, name: 'Гостевой' })
  fake.rows('participants').push(
    { id: ALI, name: 'Алиев', program_id: GD2, status: 'active' },
    { id: BOB, name: 'Бобоев', program_id: GD2, status: 'active' }
  )
  fake.rows('monthly_payments').push(
    { id: 'm1', participant_id: ALI, program_id: GD2, month_number: 1 },
    { id: 'm2', participant_id: BOB, program_id: GD2, month_number: 1 }
  )
  fake.rows('payment_transactions').push({ id: 't1', participant_id: ALI, program_id: GD2, amount: 100 })
})

describe('PUT /api/participants: changing kind', () => {
  it('moving a person to the guest program takes their schedule and receipts along', async () => {
    const res = await put({ id: ALI, program_id: GUEST, status: 'active' })
    expect(res.status).toBe(200)
    expect(fake.rows('participants').find(p => p.id === ALI)).toMatchObject({ program_id: GUEST, status: 'active' })
    expect(fake.rows('monthly_payments').find(p => p.id === 'm1')?.program_id).toBe(GUEST)
    expect(fake.rows('payment_transactions').find(p => p.id === 't1')?.program_id).toBe(GUEST)
  })

  it('does not touch other people', async () => {
    await put({ id: ALI, program_id: GUEST, status: 'active' })
    expect(fake.rows('monthly_payments').find(p => p.id === 'm2')?.program_id).toBe(GD2)
  })

  it('archiving only changes the status: the program and receipts stay', async () => {
    const res = await put({ id: ALI, status: 'archived' })
    expect(res.status).toBe(200)
    expect(fake.rows('participants').find(p => p.id === ALI)).toMatchObject({ program_id: GD2, status: 'archived' })
    expect(fake.rows('monthly_payments').find(p => p.id === 'm1')?.program_id).toBe(GD2)
  })
})
