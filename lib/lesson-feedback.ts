/**
 * Lesson feedback: the five questions, validation of what a participant sends, and the maths the
 * curators' review is built from (averages per lesson, grouped by day). Pure, shared by the API and the screens.
 */
import type { Lesson } from '@/lib/lessons'

export const FEEDBACK_QUESTIONS = [
  { key: 'content', label: 'Содержание', ask: 'Насколько содержание урока соответствовало вашим ожиданиям и целям?' },
  { key: 'clarity', label: 'Подача', ask: 'Насколько понятно и структурированно был подан материал?' },
  { key: 'support', label: 'Обратная связь', ask: 'Насколько хорошо спикер отвечал на вопросы и давал обратную связь?' },
  { key: 'useful', label: 'Применимость', ask: 'Насколько знания и навыки применимы в вашем деле?' },
  { key: 'overall', label: 'В целом', ask: 'Насколько урок достиг цели и оправдал потраченное время?' },
] as const

export type ScoreKey = (typeof FEEDBACK_QUESTIONS)[number]['key']
export const SCORE_KEYS: ScoreKey[] = FEEDBACK_QUESTIONS.map(q => q.key)
export const MAX_SCORE = 10

/** How long after a lesson the app keeps asking for a review. */
export const FEEDBACK_ASK_DAYS = 14

export type Scores = Record<ScoreKey, number>

export interface LessonFeedback extends Scores {
  id?: string
  lesson_id: string
  participant_id: string
  comment: string | null
  created_at?: string
  updated_at?: string
}

export class FeedbackInputError extends Error {}

export function parseFeedback(body: unknown): { scores: Scores; comment: string | null } {
  if (!body || typeof body !== 'object') throw new FeedbackInputError('Нечего сохранять')
  const src = body as Record<string, unknown>
  const scores = {} as Scores
  for (const q of FEEDBACK_QUESTIONS) {
    const n = Number(src[q.key])
    if (src[q.key] == null || src[q.key] === '' || !Number.isInteger(n) || n < 1 || n > MAX_SCORE) throw new FeedbackInputError(`«${q.label}»: поставьте оценку от 1 до ${MAX_SCORE}`)
    scores[q.key] = n
  }
  let comment: string | null = null
  if (src.comment != null && src.comment !== '') {
    if (typeof src.comment !== 'string') throw new FeedbackInputError('Пожелания: нужен текст')
    const t = src.comment.trim()
    if (t.length > 2000) throw new FeedbackInputError('Пожелания: не длиннее 2000 символов')
    comment = t || null
  }
  return { scores, comment }
}

/** The average of the given scores, one decimal; null for none. */
export function average(values: number[]): number | null {
  if (!values.length) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

export interface LessonReview {
  lesson: Lesson
  /** How many participants gave a review, and how many could have. */
  responded: number
  eligible: number
  /** Average per question; null while nobody has answered. */
  averages: Record<ScoreKey, number | null>
  /** Average of the five questions. */
  overall: number | null
  /** Wishes in the participants' words, newest first. The author is not named. */
  comments: { text: string; at: string }[]
}

export function reviewLesson(lesson: Lesson, rows: Pick<LessonFeedback, ScoreKey | 'comment' | 'created_at'>[], eligible: number): LessonReview {
  const averages = {} as Record<ScoreKey, number | null>
  for (const k of SCORE_KEYS) averages[k] = average(rows.map(r => r[k]))
  const all = SCORE_KEYS.flatMap(k => rows.map(r => r[k]))
  return {
    lesson,
    responded: rows.length,
    eligible,
    averages,
    overall: average(all),
    comments: rows
      .filter(r => r.comment)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .map(r => ({ text: r.comment as string, at: r.created_at ?? '' })),
  }
}

/** Lessons that have started and that this participant has not reviewed yet, within FEEDBACK_ASK_DAYS of ending. Latest first. */
export function feedbackDue<T extends Pick<Lesson, 'id' | 'starts_at' | 'ends_at'>>(lessons: T[], reviewed: ReadonlySet<string>, now: number = Date.now()): T[] {
  return lessons
    .filter(l => !reviewed.has(l.id) && now > Date.parse(l.ends_at) && now - Date.parse(l.ends_at) <= FEEDBACK_ASK_DAYS * 86_400_000)
    .sort((a, b) => b.ends_at.localeCompare(a.ends_at))
}
