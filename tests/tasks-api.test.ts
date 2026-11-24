import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET, PUT } from '@/app/api/employee/tasks/route'
import { ageTone, deadlineLabel, timeSince, type Task } from '@/components/employee/task-parts'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const admin = `${SESSION_COOKIE}=${createSessionToken({ id: 'u-admin', role: 'admin', full_name: 'Админ' })}`
const get = (q: string) => GET(new Request(`http://test/api/employee/tasks?${q}`, { headers: { cookie: admin } }))
const put = (body: unknown) => PUT(new Request('http://test/x', { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: admin }, body: JSON.stringify(body) }))

describe('/api/employee/tasks deadlines', () => {
  beforeEach(() => {
    fake.reset()
    fake.rows('tasks').push(
      { id: 't-past', assignee_id: 'e1', title: 'Старая', due_date: '2026-11-20', status: 'todo' },
      { id: 't-today', assignee_id: 'e1', title: 'Сегодня', due_date: '2026-11-24', status: 'completed' },
      { id: 't-later', assignee_id: 'e1', title: 'Через неделю', due_date: '2026-12-01', status: 'todo' },
      { id: 't-later-done', assignee_id: 'e1', title: 'Закрыта заранее', due_date: '2026-12-01', status: 'completed' }
    )
  })

  it('date=… gives what is due by then; open=1 adds open tasks with a later deadline', async () => {
    const ids = async (q: string) => ((await (await get(q)).json()) as { id: string }[]).map(t => t.id).sort()
    expect(await ids('date=2026-11-24')).toEqual(['t-past', 't-today'])
    expect(await ids('date=2026-11-24&open=1')).toEqual(['t-later', 't-past', 't-today'])
  })

  it('changes the deadline and refuses a bad one', async () => {
    expect((await put({ id: 't-past', due_date: '2026-11-28' })).status).toBe(200)
    expect(fake.rows('tasks')[0].due_date).toBe('2026-11-28')
    expect((await put({ id: 't-past', due_date: '28.11.2026' })).status).toBe(400)
    expect((await put({ id: 't-past', due_date: null })).status).toBe(200)
    expect(fake.rows('tasks')[0].due_date).toBeNull()
  })
})

describe('task timing labels', () => {
  const now = new Date('2026-11-24T12:00:00Z').getTime()
  it('says how long ago a task was set', () => {
    expect(timeSince('2026-11-24T11:59:40Z', now)).toBe('только что')
    expect(timeSince('2026-11-24T11:35:00Z', now)).toBe('25 мин')
    expect(timeSince('2026-11-24T09:00:00Z', now)).toBe('3 ч')
    expect(timeSince('2026-11-22T12:00:00Z', now)).toBe('2 дн')
  })
  it('warns after a day and turns red after three for open tasks only', () => {
    const t = (created_at: string, status: Task['status'] = 'todo') => ({ id: 'x', assignee_id: 'e', title: 'x', status, created_at }) as Task
    expect(ageTone(t('2026-11-24T08:00:00Z'), now)).toBe('calm')
    expect(ageTone(t('2026-11-23T08:00:00Z'), now)).toBe('warn')
    expect(ageTone(t('2026-11-20T08:00:00Z'), now)).toBe('late')
    expect(ageTone(t('2026-11-20T08:00:00Z', 'completed'), now)).toBe('calm')
  })
  it('names deadlines in words', () => {
    expect(deadlineLabel(null)).toBe('без срока')
  })
})
