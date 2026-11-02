import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as load, PUT as savePlan } from '@/app/api/my-plan/route'
import { POST as addDirection } from '@/app/api/my-plan/directions/route'
import { DELETE as delDirection } from '@/app/api/my-plan/directions/[id]/route'
import { POST as addGoal } from '@/app/api/my-plan/goals/route'
import { POST as addAction } from '@/app/api/my-plan/actions/route'
import { PATCH as editAction } from '@/app/api/my-plan/actions/[id]/route'
import { POST as result } from '@/app/api/my-plan/actions/[id]/result/route'
import { todayISO } from '@/lib/format'
import { addDays } from '@/lib/sprints'
import { fake } from './helpers/fake-db'

const ALI = '22222222-2222-4222-8222-222222222222'
const BOB = '33333333-3333-4333-8333-333333333333'

const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://test${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

async function setup(pid = ALI) {
  const plan = await json(await savePlan(req('PUT', `/api/my-plan?participant_id=${pid}`, { vision: 'Сеть из 10 магазинов', vision_date: '2030-01-01', directions: ['Стратегия', 'HR', 'стратегия'] })))
  const dir = plan.body.data.directions[0]
  const goal = (await json(await addGoal(req('POST', `/api/my-plan/goals?participant_id=${pid}`, { direction_id: dir.id, title: 'Юридические вопросы' })))).body.data
  return { plan: plan.body.data, dir, goal }
}

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.rows('participants').push({ id: ALI, name: 'Алиев' }, { id: BOB, name: 'Бобоев' })
})

describe('/api/my-plan', () => {
  it('has no plan until the participant creates one, then keeps the vision and unique directions', async () => {
    expect((await json(await load(req('GET', `/api/my-plan?participant_id=${ALI}`)))).body.data.plan).toBeNull()
    const { plan } = await setup()
    expect(plan.plan).toMatchObject({ participant_id: ALI, vision: 'Сеть из 10 магазинов', vision_date: '2030-01-01' })
    expect(plan.directions.map((d: { title: string }) => d.title)).toEqual(['Стратегия', 'HR'])
    expect(fake.rows('op_plans')).toHaveLength(1)
  })

  it('checks input before creating anything', async () => {
    const res = await savePlan(req('PUT', `/api/my-plan?participant_id=${ALI}`, { vision_date: '01.01.2030' }))
    expect(res.status).toBe(400)
    expect(fake.rows('op_plans')).toHaveLength(0)
  })

  it('adds an action with owners, priority and цена слова', async () => {
    const { goal } = await setup()
    const res = await json(
      await addAction(req('POST', `/api/my-plan/actions?participant_id=${ALI}`, { goal_id: goal.id, title: 'Договор с поставщиками', indicator: 'Подписан', due_date: '2026-11-20', owners: 'Анвар, Фаррух, Анвар', priority: 'A', price: '1 000' }))
    )
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ title: 'Договор с поставщиками', owners: ['Анвар', 'Фаррух'], priority: 'A', price: 1000, status: 'open' })
  })

  it('refuses a goal of another participant', async () => {
    const { goal } = await setup(BOB)
    await setup(ALI)
    const res = await addAction(req('POST', `/api/my-plan/actions?participant_id=${ALI}`, { goal_id: goal.id, title: 'Чужое' }))
    expect(res.status).toBe(404)
    expect(fake.rows('op_actions')).toHaveLength(0)
  })

  it('records an excuse with the price and a new deadline, then «сделано»', async () => {
    const { goal } = await setup()
    const yesterday = addDays(todayISO(), -1)
    const a = (await json(await addAction(req('POST', `/api/my-plan/actions?participant_id=${ALI}`, { goal_id: goal.id, title: 'SWOT', due_date: yesterday, price: 500 })))).body.data
    const url = `/api/my-plan/actions/${a.id}/result?participant_id=${ALI}`

    expect((await result(req('POST', url, { type: 'excuse', reason: '' }), ctx(a.id))).status).toBe(400)
    expect((await result(req('POST', url, { type: 'excuse', reason: 'Не успел', new_due: yesterday }), ctx(a.id))).status).toBe(400)
    const newDue = addDays(todayISO(), 7)
    expect((await result(req('POST', url, { type: 'excuse', reason: 'Не успел', new_due: newDue }), ctx(a.id))).status).toBe(200)
    expect(fake.rows('op_action_excuses')[0]).toMatchObject({ action_id: a.id, price: 500, missed_due: yesterday, new_due: newDue })
    expect(fake.rows('op_actions')[0]).toMatchObject({ due_date: newDue, status: 'open' })

    expect((await result(req('POST', url, { type: 'done', link: 'ftp://x' }), ctx(a.id))).status).toBe(400)
    expect((await result(req('POST', url, { type: 'done', note: 'Готово', link: 'https://docs.example/swot' }), ctx(a.id))).status).toBe(200)
    expect(fake.rows('op_actions')[0]).toMatchObject({ status: 'done', result_note: 'Готово' })

    const data = (await json(await load(req('GET', `/api/my-plan?participant_id=${ALI}`)))).body.data
    expect(data.excuses).toHaveLength(1)
  })

  it('edits only what was sent, and an action of another plan is not found', async () => {
    const { goal } = await setup()
    const a = (await json(await addAction(req('POST', `/api/my-plan/actions?participant_id=${ALI}`, { goal_id: goal.id, title: 'CJM', priority: 'C' })))).body.data
    const res = await json(await editAction(req('PATCH', `/api/my-plan/actions/${a.id}?participant_id=${ALI}`, { due_date: '2026-12-01' }), ctx(a.id)))
    expect(res.body.data).toMatchObject({ title: 'CJM', priority: 'C', due_date: '2026-12-01' })
    await setup(BOB)
    expect((await editAction(req('PATCH', `/api/my-plan/actions/${a.id}?participant_id=${BOB}`, { title: 'x' }), ctx(a.id))).status).toBe(404)
  })

  it('adds and deletes a direction', async () => {
    await setup()
    const d = (await json(await addDirection(req('POST', `/api/my-plan/directions?participant_id=${ALI}`, { title: 'IT' })))).body.data
    expect(d).toMatchObject({ title: 'IT', position: 2 })
    expect((await delDirection(req('DELETE', `/api/my-plan/directions/${d.id}?participant_id=${ALI}`), ctx(d.id))).status).toBe(200)
    expect(fake.rows('op_directions').map(r => r.title)).toEqual(['Стратегия', 'HR'])
  })

  it('says the migration is missing', async () => {
    fake.missing.set('op_plans', { code: '42P01', message: 'relation "public.op_plans" does not exist' })
    const res = await json(await load(req('GET', `/api/my-plan?participant_id=${ALI}`)))
    expect(res.status).toBe(503)
    expect(res.body.error).toBe('migration_required')
  })
})
