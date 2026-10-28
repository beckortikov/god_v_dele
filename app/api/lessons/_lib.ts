/** Server-only helpers for the lesson routes. */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, sessionOf } from '@/lib/api-auth'
import { LessonInputError, MAX_MATERIAL_BYTES, MATERIAL_TYPES, type Lesson, type LessonMaterial } from '@/lib/lessons'
import { isUuid } from '@/app/api/sprints/_lib/store'

export const LESSONS = 'lessons'
export const MATERIALS = 'lesson_materials'
export const LESSON_BUCKET = 'lesson-materials'

type PgError = { code?: string; message?: string } | null

export class LessonsMigrationError extends Error {}
export class LessonBadRequest extends Error {}
export class LessonNotFound extends Error {}

/** True when migration 020 is not applied (a lesson table is missing). */
export function isMissingLessons(error: PgError) {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  if (!msg.includes('lesson')) return false
  return error.code === '42P01' || error.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table')
}

export function checkLessons(error: PgError) {
  if (!error) return
  if (isMissingLessons(error)) throw new LessonsMigrationError()
  throw new Error(error.message || 'Database error')
}

export function lessonsError(e: unknown, context: string) {
  if (e instanceof LessonsMigrationError) {
    return NextResponse.json(
      { error: 'lessons_migration_required', message: 'Календарь уроков ещё не подключён. Примените миграцию migrations/020_lessons.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof LessonInputError || e instanceof LessonBadRequest) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof LessonNotFound) return NextResponse.json({ error: e.message }, { status: 404 })
  console.error(`[lessons] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal Server Error' }, { status: 500 })
}

/** Who plans lessons and attaches materials: the curators. */
export const LESSON_STAFF = ['admin', 'wheels_manager', 'manager'] as const
export const isLessonStaff = (req: Request) => (LESSON_STAFF as readonly string[]).includes(sessionOf(req)?.role ?? '')

export const requireUuid = (v: unknown, field: string): string => {
  if (!isUuid(v)) throw new LessonBadRequest(`${field}: нужен UUID`)
  return v
}

export async function getLesson(id: string): Promise<Lesson> {
  const { data, error } = await db.from(LESSONS).select('*').eq('id', id).maybeSingle()
  checkLessons(error)
  if (!data) throw new LessonNotFound('Урок не найден')
  return data as Lesson
}

/**
 * May this caller see the lesson? Curators always; a participant only if the lesson is for their
 * program, and for the whole program or their own group.
 */
export async function mayOpenLesson(req: Request, lesson: Lesson): Promise<boolean> {
  if (isLessonStaff(req)) return true
  const s = sessionOf(req)
  if (s?.role !== 'participant' || !s.pid) return false
  const { data } = await db.from('participants').select('*').eq('id', s.pid).maybeSingle()
  if (!data || data.program_id !== lesson.program_id) return false
  return !lesson.group_id || lesson.group_id === (data.group_id ?? null)
}

export const denyLesson = () => forbidden('Этот урок не для вас')

/** A material as the screens get it: no storage key. */
export function publicMaterial(row: Record<string, any>): LessonMaterial {
  return {
    id: row.id,
    lesson_id: row.lesson_id,
    kind: row.kind,
    title: row.title,
    url: row.kind === 'link' ? row.url : null,
    file_name: row.file_name ?? null,
    file_size: row.file_size == null ? null : Number(row.file_size),
    created_at: row.created_at,
  }
}

let bucketReady = false

/** The bucket is private; it is created on first use so no setup step is needed. */
export async function ensureLessonBucket() {
  if (bucketReady) return
  const { data } = await db.storage.getBucket(LESSON_BUCKET)
  if (!data) {
    const { error } = await db.storage.createBucket(LESSON_BUCKET, {
      public: false,
      fileSizeLimit: MAX_MATERIAL_BYTES,
      allowedMimeTypes: Object.keys(MATERIAL_TYPES),
    })
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Хранилище файлов недоступно: ${error.message}`)
  }
  bucketReady = true
}

/** The group must belong to the program (migration 018 gives groups; without it no group can be named). */
export async function assertGroupInProgram(groupId: string, programId: string) {
  const { data, error } = await db.from('participant_groups').select('id, program_id').eq('id', groupId).maybeSingle()
  if (error) throw new LessonBadRequest('Группы ещё не подключены')
  if (!data || data.program_id !== programId) throw new LessonNotFound('Группа не найдена в этом потоке')
}


/**
 * iPhone/iPad open a downloaded attachment in the in-app browser as a blank page. A file served inline
 * is previewed there (Excel, Word, PDF) with a share button to save it.
 */
export const isIosDevice = (req: Request) => /iPhone|iPad|iPod/i.test(req.headers.get('user-agent') ?? '')

/** The type a stored file is served as: the extension of its key says which of the allowed ones it is. */
export function contentTypeOf(key: string) {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return Object.entries(MATERIAL_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream'
}

/** `inline; filename*=` with a name that may hold Cyrillic. */
export const inlineDisposition = (name: string) => `inline; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
