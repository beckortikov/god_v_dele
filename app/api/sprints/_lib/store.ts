/**
 * Server-only helpers for the sprint routes: table names, the
 * «migration not applied» answer, assignments and Telegram notices.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import { ActionError, type Assignment, type EventKind, type SprintTask } from '@/lib/sprints'

export const SPRINTS = 'sprints'
export const TASKS = 'sprint_tasks'
export const ASSIGNMENTS = 'sprint_task_assignments'
export const EVENTS = 'sprint_task_events'
export const GROUPS = 'participant_groups'

/** Thrown when migration 016 is not applied, so routes can answer 503. */
export class MigrationRequiredError extends Error {
  constructor() {
    super('Sprint tables are missing: apply migrations/016_sprints.sql')
    this.name = 'MigrationRequiredError'
  }
}

type PgError = { code?: string; message?: string } | null

export function isMissingSprintTable(error: PgError) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('sprint') && (msg.includes('does not exist') || msg.includes('could not find the table'))
}

/** Throws a typed error for a failed query. */
export function check(error: PgError) {
  if (!error) return
  if (isMissingSprintTable(error)) throw new MigrationRequiredError()
  throw new Error(error.message || 'Database error')
}

export function migrationRequired() {
  return NextResponse.json(
    {
      error: 'migration_required',
      message: 'Таблицы спринтов ещё не созданы. Примените миграцию migrations/016_sprints.sql в Supabase (SQL Editor).',
    },
    { status: 503 }
  )
}

/** 503 for a missing migration, 400 for a rule the user broke, 500 otherwise. */
export function errorResponse(e: unknown, context: string) {
  if (e instanceof MigrationRequiredError) return migrationRequired()
  if (e instanceof GroupsMigrationError) {
    return NextResponse.json(
      { error: 'groups_migration_required', message: 'Группы ещё не подключены. Примените миграцию migrations/018_participant_groups.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof ActionError || e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof NotFound) return NextResponse.json({ error: e.message }, { status: 404 })
  console.error(`[sprints] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal server error' }, { status: 500 })
}

export class BadRequest extends Error {}
export class NotFound extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function requireUuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new BadRequest(`${field}: нужен UUID`)
  return v
}

export function optionalDate(v: unknown, field: string): string | null {
  if (v == null || v === '') return null
  if (!isIsoDate(v)) throw new BadRequest(`${field}: дата в формате ГГГГ-ММ-ДД`)
  return v
}

export async function getTask(id: string): Promise<SprintTask> {
  const { data, error } = await db.from(TASKS).select('*').eq('id', id).maybeSingle()
  check(error)
  if (!data) throw new NotFound('Задача не найдена')
  return data as SprintTask
}

/** True when migration 018 (participant groups) is not applied: the table or a group_id column is missing. */
export function isMissingGroups(error: PgError) {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  if (!msg.includes('group')) return false
  return error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205' || error.code === 'PGRST204' || msg.includes('does not exist') || msg.includes('could not find')
}

/** Thrown by the group routes when migration 018 is not applied, so they can answer 503. */
export class GroupsMigrationError extends Error {
  constructor() {
    super('Group tables are missing: apply migrations/018_participant_groups.sql')
    this.name = 'GroupsMigrationError'
  }
}

export function checkGroups(error: PgError) {
  if (!error) return
  if (isMissingGroups(error)) throw new GroupsMigrationError()
  check(error)
}

/**
 * Active participants who get a «весь поток» task: the whole program, or only
 * the group when the sprint belongs to one.
 */
export async function activeParticipantIds(programId: string, groupId?: string | null): Promise<string[]> {
  let query = db.from('participants').select('id').eq('program_id', programId).eq('status', 'active')
  if (groupId) query = query.eq('group_id', groupId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((p: { id: string }) => p.id)
}

/** Creates the missing assignments of a task. Returns the ids of participants who got it now. */
export async function assign(taskId: string, participantIds: string[]): Promise<string[]> {
  if (!participantIds.length) return []
  const { data: existing, error } = await db.from(ASSIGNMENTS).select('participant_id').eq('task_id', taskId)
  check(error)
  const have = new Set((existing ?? []).map((r: { participant_id: string }) => r.participant_id))
  const fresh = [...new Set(participantIds)].filter(id => !have.has(id))
  if (!fresh.length) return []
  const { error: insertError } = await db
    .from(ASSIGNMENTS)
    .insert(fresh.map(participant_id => ({ task_id: taskId, participant_id })))
  check(insertError)
  return fresh
}

export async function getAssignment(id: string): Promise<Assignment> {
  const { data, error } = await db.from(ASSIGNMENTS).select('*').eq('id', id).maybeSingle()
  check(error)
  if (!data) throw new NotFound('Задача участника не найдена')
  return data as Assignment
}

export async function addEvent(assignmentId: string, kind: EventKind, extra: { comment?: string | null; due_date?: string | null; actor_name?: string | null } = {}) {
  const { error } = await db.from(EVENTS).insert({
    assignment_id: assignmentId,
    kind,
    comment: extra.comment ?? null,
    due_date: extra.due_date ?? null,
    actor_name: extra.actor_name ?? null,
  })
  // History is secondary: a failed insert must not undo the main change.
  if (error) console.warn('[sprints] event not recorded:', error.message)
}

/**
 * Sends a Telegram message to participants who linked the bot. Best effort:
 * never throws and never blocks the request on a slow or failed send.
 */
export async function notifyParticipants(participantIds: string[], text: string) {
  if (!participantIds.length || !isTelegramConfigured()) return
  try {
    const { data, error } = await db
      .from('telegram_links')
      .select('chat_id, subject_id')
      .eq('subject_type', 'participant')
      .in('subject_id', participantIds)
      .is('unlinked_at', null)
      .eq('notify', true)
    if (error || !data?.length) return
    await Promise.allSettled(data.map((l: { chat_id: number }) => sendMessage(l.chat_id, text)))
  } catch (e) {
    console.warn('[sprints] telegram notice failed:', (e as Error).message)
  }
}
