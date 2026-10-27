/** Server-only helpers for the lesson-feedback routes. */
import { NextResponse } from 'next/server'
import { FeedbackInputError } from '@/lib/lesson-feedback'
import { LessonBadRequest, LessonNotFound, LessonsMigrationError, lessonsError } from '../lessons/_lib'

export const FEEDBACK = 'lesson_feedback'

type PgError = { code?: string; message?: string } | null

export class FeedbackMigrationError extends Error {}

/** Migration 023 is not applied: the feedback table is missing. */
export function checkFeedback(error: PgError) {
  if (!error) return
  const msg = (error.message || '').toLowerCase()
  if (msg.includes('lesson_feedback') && (error.code === '42P01' || error.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('could not find the table'))) {
    throw new FeedbackMigrationError()
  }
  throw new Error(error.message || 'Database error')
}

export function feedbackError(e: unknown, context: string) {
  if (e instanceof FeedbackMigrationError) {
    return NextResponse.json(
      { error: 'feedback_migration_required', message: 'Отзывы об уроках ещё не подключены. Примените миграцию migrations/023_lesson_feedback.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof FeedbackInputError) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof LessonsMigrationError || e instanceof LessonBadRequest || e instanceof LessonNotFound) return lessonsError(e, context)
  console.error(`[lesson-feedback] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal Server Error' }, { status: 500 })
}
