/** Server-only helpers for the participant-profile routes. */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, mayUseProfile } from '@/lib/api-auth'
import { ProfileInputError, MAX_SCAN_BYTES, PASSPORT_BUCKET, SCAN_TYPES } from '@/lib/participant-profile'
import { decodeName, isReportKey } from '@/lib/report-files'
import { isUuid } from '@/app/api/sprints/_lib/store'

type PgError = { code?: string; message?: string } | null

export class ProfileMigrationError extends Error {}
export class ProfileBadRequest extends Error {}
export class ProfileNotFound extends Error {}

/** True when migration 019 is not applied (a profile table is missing). */
export function isMissingProfileTable(error: PgError) {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  if (!msg.includes('participant_')) return false
  return error.code === '42P01' || error.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table')
}

/** Migration 022 is not applied: a column it adds is missing. */
export class ProfileExtraMigrationError extends Error {}

const EXTRA_COLUMNS = ['employees_count', 'website', 'goal_turnover']

export function isMissingExtraColumn(error: PgError) {
  if (!error) return false
  const msg = error.message || ''
  return (error.code === '42703' || error.code === 'PGRST204' || /could not find the|does not exist/i.test(msg)) && EXTRA_COLUMNS.some(c => msg.includes(c))
}

export function checkProfile(error: PgError) {
  if (!error) return
  if (isMissingExtraColumn(error)) throw new ProfileExtraMigrationError()
  if (isMissingProfileTable(error)) throw new ProfileMigrationError()
  throw new Error(error.message || 'Database error')
}

export function profileError(e: unknown, context: string) {
  if (e instanceof ProfileMigrationError) {
    return NextResponse.json(
      { error: 'profile_migration_required', message: 'Профили ещё не подключены. Примените миграцию migrations/019_participant_profiles.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof ProfileExtraMigrationError) {
    return NextResponse.json(
      { error: 'profile_extra_migration_required', message: 'Эти поля ещё не подключены. Примените миграцию migrations/022_profile_business_extra.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof ProfileInputError || e instanceof ProfileBadRequest) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof ProfileNotFound) return NextResponse.json({ error: e.message }, { status: 404 })
  console.error(`[participant-profile] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal Server Error' }, { status: 500 })
}

/** The participant from ?participant_id, after checking that this caller may use their profile. */
export async function profileOwner(req: Request): Promise<{ id: string; name: string; phone: string | null; email: string | null } | NextResponse> {
  const id = new URL(req.url).searchParams.get('participant_id')
  if (!isUuid(id)) return NextResponse.json({ error: 'participant_id: нужен UUID' }, { status: 400 })
  if (!mayUseProfile(req, id)) return forbidden()
  const { data, error } = await db.from('participants').select('id, name, phone, email').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ProfileNotFound('Участник не найден')
  return data
}

let bucketReady = false

/** The bucket is private; it is created on first use so no setup step is needed. */
export async function ensureDocsBucket() {
  if (bucketReady) return
  const { data } = await db.storage.getBucket(PASSPORT_BUCKET)
  if (!data) {
    const { error } = await db.storage.createBucket(PASSPORT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_SCAN_BYTES,
      allowedMimeTypes: Object.keys(SCAN_TYPES),
    })
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Хранилище файлов недоступно: ${error.message}`)
  }
  bucketReady = true
}

export interface ScanFile {
  key: string
  name: string
  size: number
}

export async function listScans(participantId: string): Promise<ScanFile[]> {
  const { data, error } = await db.storage.from(PASSPORT_BUCKET).list(participantId, { limit: 100, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(f => isReportKey(f.name))
    .map(f => ({ key: f.name, name: decodeName(f.name), size: Number((f.metadata as { size?: number } | null)?.size ?? 0) }))
}
