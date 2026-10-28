import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as listLessons, POST as createLesson } from '@/app/api/lessons/route'
import { DELETE as deleteLesson, GET as getLesson, PATCH as patchLesson } from '@/app/api/lessons/[id]/route'
import { DELETE as deleteMaterial, GET as getMaterials, POST as addMaterial } from '@/app/api/lessons/[id]/materials/route'
import { POST as prepareUpload } from '@/app/api/lessons/[id]/materials/prepare/route'
import { GET as myLessons } from '@/app/api/my-lessons/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { encodeKey } from '@/lib/report-files'
import { fake } from './helpers/fake-db'

const PROG = '11111111-1111-4111-8111-111111111111'
const OTHER_PROG = '12121212-1212-4212-8212-121212121212'
const GA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ALI = '22222222-2222-4222-8222-222222222222' // in group A
const BOB = '33333333-3333-4333-8333-333333333333' // in group B
const OUT = '44444444-4444-4444-8444-444444444444' // other program

const who = (role: string, pid?: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${role}`, role, participant_id: pid ?? null, full_name: role })}`
const call = (url: string, role: string, pid?: string, body?: unknown, method = 'GET') =>
  new Request(`http://test${url}`, { method, headers: { 'Content-Type': 'application/json', cookie: who(role, pid) }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString()
const lesson = (over: Record<string, unknown> = {}) => ({ program_id: PROG, title: 'Финансы бизнеса', starts_at: at(20, 18), ends_at: at(20, 20), format: 'online', link: 'zoom.us/j/1', ...over })

beforeEach(() => {
  fake.reset()
  fake.buckets.set('lesson-materials', new Map())
  fake.rows('participant_groups').push({ id: GA, program_id: PROG, name: 'Группа A' }, { id: GB, program_id: PROG, name: 'Группа B' })
  fake.rows('participants').push(
    { id: ALI, name: 'Алиев', program_id: PROG, group_id: GA },
    { id: BOB, name: 'Бобоев', program_id: PROG, group_id: GB },
    { id: OUT, name: 'Чужой', program_id: OTHER_PROG, group_id: null }
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('planning lessons', () => {
  it('creates a lesson for curators and refuses everyone else', async () => {
    for (const role of ['admin', 'wheels_manager', 'manager']) expect((await createLesson(call('/api/lessons', role, undefined, lesson(), 'POST'))).status).toBe(201)
    for (const [role, pid] of [['participant', ALI], ['finance'], ['employee']] as const) expect((await createLesson(call('/api/lessons', role, pid, lesson(), 'POST'))).status).toBe(403)
    expect(fake.rows('lessons')).toHaveLength(3)
    expect(fake.rows('lessons')[0]).toMatchObject({ title: 'Финансы бизнеса', link: 'https://zoom.us/j/1', program_id: PROG })
  })

  it('repeats weekly and puts a group lesson only in that group', async () => {
    const res = await createLesson(call('/api/lessons', 'manager', undefined, lesson({ weeks: 4, group_id: GA }), 'POST'))
    expect(res.status).toBe(201)
    const rows = fake.rows('lessons')
    expect(rows).toHaveLength(4)
    expect(rows.every(r => r.group_id === GA)).toBe(true)
    expect(Date.parse(rows[3].starts_at) - Date.parse(rows[0].starts_at)).toBe(21 * 86_400_000)
  })

  it('refuses bad input and a group from another program', async () => {
    expect((await createLesson(call('/api/lessons', 'admin', undefined, lesson({ title: '' }), 'POST'))).status).toBe(400)
    expect((await createLesson(call('/api/lessons', 'admin', undefined, lesson({ ends_at: at(20, 17) }), 'POST'))).status).toBe(400)
    expect((await createLesson(call('/api/lessons', 'admin', undefined, lesson({ link: 'javascript:alert(1)' }), 'POST'))).status).toBe(400)
    expect((await createLesson(call('/api/lessons', 'admin', undefined, lesson({ program_id: OTHER_PROG, group_id: GA }), 'POST'))).status).toBe(404)
    expect((await createLesson(call('/api/lessons', 'admin', undefined, lesson({ program_id: 'nope' }), 'POST'))).status).toBe(400)
    expect(fake.rows('lessons')).toHaveLength(0)
  })

  it('lists a program\'s lessons in a date range with material counts, for curators only', async () => {
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ weeks: 3 }), 'POST'))
    const [first] = fake.rows('lessons')
    fake.rows('lesson_materials').push({ id: 'm1', lesson_id: first.id, kind: 'link', title: 'x', url: 'https://x.tj' })
    const from = new Date(2026, 9, 1).toISOString()
    const to = new Date(2026, 9, 28).toISOString()
    const { data } = await (await listLessons(call(`/api/lessons?program_id=${PROG}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, 'wheels_manager'))).json()
    // lessons on 20 and 27 October fall in the range, the one on 3 November does not
    expect(data).toHaveLength(2)
    expect(data[0].material_count).toBe(1)
    expect(data[1].material_count).toBe(0)
    expect((await listLessons(call(`/api/lessons?program_id=${PROG}`, 'participant', ALI))).status).toBe(403)
  })

  it('edits and deletes a lesson, removing its files with it', async () => {
    await createLesson(call('/api/lessons', 'admin', undefined, lesson(), 'POST'))
    const id = fake.rows('lessons')[0].id
    const key = encodeKey('Урок.pdf', 'application/pdf', 1700000000000)
    fake.buckets.get('lesson-materials')!.set(`${id}/${key}`, 5)
    fake.rows('lesson_materials').push({ id: 'm1', lesson_id: id, kind: 'file', title: 'Урок', file_key: key, file_name: 'Урок.pdf' })

    expect((await patchLesson(call(`/api/lessons/${id}`, 'manager', undefined, lesson({ title: 'Новое название', format: 'offline', location: 'Душанбе' }), 'PATCH'), ctx(id))).status).toBe(200)
    expect(fake.rows('lessons')[0]).toMatchObject({ title: 'Новое название', format: 'offline', location: 'Душанбе', link: null })
    expect((await patchLesson(call(`/api/lessons/${id}`, 'participant', ALI, lesson(), 'PATCH'), ctx(id))).status).toBe(403)

    expect((await deleteLesson(call(`/api/lessons/${id}`, 'wheels_manager', undefined, undefined, 'DELETE'), ctx(id))).status).toBe(200)
    expect(fake.rows('lessons')).toHaveLength(0)
    expect(fake.buckets.get('lesson-materials')!.size).toBe(0)
  })

  it('says the migration is missing', async () => {
    fake.missing.set('lessons', { code: '42P01', message: 'relation "public.lessons" does not exist' })
    const res = await listLessons(call(`/api/lessons?program_id=${PROG}`, 'admin'))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('lessons_migration_required')
  })
})

describe('materials', () => {
  let id: string
  beforeEach(async () => {
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ group_id: GA }), 'POST'))
    id = fake.rows('lessons')[0].id
  })
  const ppt = { name: 'Урок 3.pptx', size: 8_000_000, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }

  it('attaches a presentation: prepare, upload, register', async () => {
    const prep = await prepareUpload(call(`/api/lessons/${id}/materials/prepare`, 'manager', undefined, ppt, 'POST'), ctx(id))
    expect(prep.status).toBe(201)
    const { key, signedUrl } = (await prep.json()).data
    expect(signedUrl).toContain(`lesson-materials/${id}/${key}`)

    // registering before the file is in Storage is refused
    expect((await addMaterial(call(`/api/lessons/${id}/materials`, 'manager', undefined, { kind: 'file', key, name: ppt.name }, 'POST'), ctx(id))).status).toBe(400)

    fake.buckets.get('lesson-materials')!.set(`${id}/${key}`, 8_000_000)
    const ok = await addMaterial(call(`/api/lessons/${id}/materials`, 'manager', undefined, { kind: 'file', key, name: ppt.name, title: 'Презентация' }, 'POST'), ctx(id))
    expect(ok.status).toBe(201)
    const m = (await ok.json()).data
    expect(m).toMatchObject({ kind: 'file', title: 'Презентация', file_name: 'Урок 3.pptx', file_size: 8_000_000, url: null })
    expect(m).not.toHaveProperty('file_key')
  })

  it('refuses unsuitable files and keys we did not make', async () => {
    for (const bad of [{ ...ppt, type: 'application/x-msdownload' }, { ...ppt, size: 60 * 1024 * 1024 }, { ...ppt, size: 0 }]) {
      expect((await prepareUpload(call(`/api/lessons/${id}/materials/prepare`, 'admin', undefined, bad, 'POST'), ctx(id))).status).toBe(400)
    }
    expect((await addMaterial(call(`/api/lessons/${id}/materials`, 'admin', undefined, { kind: 'file', key: '../../secret', name: 'x' }, 'POST'), ctx(id))).status).toBe(400)
    expect((await prepareUpload(call(`/api/lessons/${id}/materials/prepare`, 'participant', ALI, ppt, 'POST'), ctx(id))).status).toBe(403)
  })

  it('adds a link, refusing unsafe ones', async () => {
    const ok = await addMaterial(call(`/api/lessons/${id}/materials`, 'admin', undefined, { kind: 'link', url: 'drive.google.com/file/d/1', title: 'Запись' }, 'POST'), ctx(id))
    expect(ok.status).toBe(201)
    expect((await ok.json()).data).toMatchObject({ kind: 'link', title: 'Запись', url: 'https://drive.google.com/file/d/1' })
    expect((await addMaterial(call(`/api/lessons/${id}/materials`, 'admin', undefined, { kind: 'link', url: 'javascript:alert(1)' }, 'POST'), ctx(id))).status).toBe(400)
    expect((await addMaterial(call(`/api/lessons/${id}/materials`, 'admin', undefined, { kind: 'zip' }, 'POST'), ctx(id))).status).toBe(400)
  })

  it('opens a file through a short-lived link, only for the audience of the lesson', async () => {
    const key = encodeKey('Урок.pdf', 'application/pdf', 1700000000000)
    fake.buckets.get('lesson-materials')!.set(`${id}/${key}`, 10)
    fake.rows('lesson_materials').push({ id: '55555555-5555-4555-8555-555555555555', lesson_id: id, kind: 'file', title: 'Урок', file_key: key, file_name: 'Урок.pdf' })
    const url = `/api/lessons/${id}/materials?download=55555555-5555-4555-8555-555555555555`

    const mine = await getMaterials(call(url, 'participant', ALI), ctx(id))
    expect(mine.status).toBe(302)
    expect(mine.headers.get('location')).toContain(`lesson-materials/${id}/${key}`)
    expect((await getMaterials(call(url, 'manager'), ctx(id))).status).toBe(302)
    // another group, another program, the wrong role
    expect((await getMaterials(call(url, 'participant', BOB), ctx(id))).status).toBe(403)
    expect((await getMaterials(call(url, 'participant', OUT), ctx(id))).status).toBe(403)
    expect((await getMaterials(call(url, 'finance'), ctx(id))).status).toBe(403)
    expect((await getMaterials(call(`/api/lessons/${id}/materials?download=not-a-uuid`, 'admin'), ctx(id))).status).toBe(400)
  })

  it('passes a file through inline on an iPhone, with its own name and type', async () => {
    const key = encodeKey('План 2026.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1700000000000)
    fake.buckets.get('lesson-materials')!.set(`${id}/${key}`, 10)
    const mid = '77777777-7777-4777-8777-777777777777'
    fake.rows('lesson_materials').push({ id: mid, lesson_id: id, kind: 'file', title: 'Шаблон', file_key: key, file_name: 'План 2026.xlsx' })
    const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('xlsx-bytes', { headers: { 'content-length': '10' } }))
    const req = new Request(`http://test/api/lessons/${id}/materials?download=${mid}`, { headers: { cookie: who('participant', ALI), 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } })
    const res = await getMaterials(req, ctx(id))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(res.headers.get('content-disposition')).toBe(`inline; filename*=UTF-8''${encodeURIComponent('План 2026.xlsx')}`)
    expect(await res.text()).toBe('xlsx-bytes')
    // the storage is unreachable: the plain link still works
    fetched.mockRejectedValue(new Error('offline'))
    expect((await getMaterials(req, ctx(id))).status).toBe(302)
    fetched.mockRestore()
  })

  it('lists materials without storage keys and removes one with its file', async () => {
    const key = encodeKey('Урок.pdf', 'application/pdf', 1700000000000)
    fake.buckets.get('lesson-materials')!.set(`${id}/${key}`, 10)
    const mid = '66666666-6666-4666-8666-666666666666'
    fake.rows('lesson_materials').push({ id: mid, lesson_id: id, kind: 'file', title: 'Урок', file_key: key, file_name: 'Урок.pdf' })
    const text = await (await getMaterials(call(`/api/lessons/${id}/materials`, 'participant', ALI), ctx(id))).text()
    expect(text).not.toContain(key)

    expect((await deleteMaterial(call(`/api/lessons/${id}/materials?material_id=${mid}`, 'participant', ALI, undefined, 'DELETE'), ctx(id))).status).toBe(403)
    expect((await deleteMaterial(call(`/api/lessons/${id}/materials?material_id=${mid}`, 'manager', undefined, undefined, 'DELETE'), ctx(id))).status).toBe(200)
    expect(fake.rows('lesson_materials')).toHaveLength(0)
    expect(fake.buckets.get('lesson-materials')!.size).toBe(0)
  })
})

describe('what a participant sees', () => {
  beforeEach(async () => {
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ title: 'Для всех' }), 'POST'))
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ title: 'Только A', group_id: GA, starts_at: at(21, 18), ends_at: at(21, 19) }), 'POST'))
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ title: 'Только B', group_id: GB, starts_at: at(22, 18), ends_at: at(22, 19) }), 'POST'))
    await createLesson(call('/api/lessons', 'admin', undefined, lesson({ title: 'Чужой поток', program_id: OTHER_PROG, starts_at: at(23, 18), ends_at: at(23, 19) }), 'POST'))
    const everyone = fake.rows('lessons').find(l => l.title === 'Для всех')!
    fake.rows('lesson_materials').push({ id: 'm1', lesson_id: everyone.id, kind: 'link', title: 'Запись', url: 'https://x.tj', created_at: '2026-10-01' })
  })
  const titles = async (pid: string) => (await (await myLessons(call(`/api/my-lessons?participant_id=${pid}`, 'participant', pid))).json()).data.map((l: { title: string }) => l.title)

  it('shows the whole program\'s lessons and the own group\'s, never another group\'s or program\'s', async () => {
    expect(await titles(ALI)).toEqual(['Для всех', 'Только A'])
    expect(await titles(BOB)).toEqual(['Для всех', 'Только B'])
    expect(await titles(OUT)).toEqual(['Чужой поток'])
  })

  it('brings the materials along', async () => {
    const { data } = await (await myLessons(call(`/api/my-lessons?participant_id=${ALI}`, 'participant', ALI))).json()
    expect(data[0].materials).toEqual([expect.objectContaining({ kind: 'link', title: 'Запись', url: 'https://x.tj' })])
    expect(data[1].materials).toEqual([])
  })

  it('opens a lesson card only to those it is for', async () => {
    const forA = fake.rows('lessons').find(l => l.title === 'Только A')!.id
    expect((await getLesson(call(`/api/lessons/${forA}`, 'participant', ALI), ctx(forA))).status).toBe(200)
    expect((await getLesson(call(`/api/lessons/${forA}`, 'participant', BOB), ctx(forA))).status).toBe(403)
    expect((await getLesson(call(`/api/lessons/${forA}`, 'manager'), ctx(forA))).status).toBe(200)
  })
})
