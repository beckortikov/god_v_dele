import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { forbidden } from '@/lib/api-auth'
import { reviewLesson, type LessonFeedback, type LessonReview } from '@/lib/lesson-feedback'
import type { Lesson } from '@/lib/lessons'
import { LESSONS, checkLessons, isLessonStaff, requireUuid } from '../../lessons/_lib'
import { FEEDBACK, checkFeedback, feedbackError } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET ?program_id=<uuid>&from=<iso>&to=<iso> → { data: LessonReview[] }
 * Reviews per lesson for the curators: how many answered of how many could, averages per question and the wishes.
 * Who wrote what is not part of the answer.
 */
export async function GET(req: Request) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const q = new URL(req.url).searchParams
    const programId = requireUuid(q.get('program_id'), 'program_id')

    let query = supabaseAdmin.from(LESSONS).select('*').eq('program_id', programId)
    const from = q.get('from')
    const to = q.get('to')
    if (from) query = query.gte('starts_at', new Date(from).toISOString())
    if (to) query = query.lt('starts_at', new Date(to).toISOString())
    const { data: lessonRows, error } = await query.order('starts_at')
    checkLessons(error)
    const lessons = (lessonRows ?? []) as Lesson[]
    if (!lessons.length) return NextResponse.json({ data: [] })

    const [{ data: rows, error: fErr }, { data: people, error: pErr }] = await Promise.all([
      supabaseAdmin.from(FEEDBACK).select('*').in('lesson_id', lessons.map(l => l.id)),
      supabaseAdmin.from('participants').select('id, group_id, status').eq('program_id', programId),
    ])
    checkFeedback(fErr)
    if (pErr) throw new Error(pErr.message)

    // Who could have answered: the program's active participants, of the lesson's group when it has one
    const active = (people ?? []).filter(p => p.status !== 'archived' && p.status !== 'completed')
    const byLesson = new Map<string, LessonFeedback[]>()
    for (const r of (rows ?? []) as LessonFeedback[]) byLesson.set(r.lesson_id, [...(byLesson.get(r.lesson_id) ?? []), r])

    const data: LessonReview[] = lessons.map(l => {
      const given = byLesson.get(l.id) ?? []
      const eligible = active.filter(p => !l.group_id || p.group_id === l.group_id).length
      // someone who answered and has since left the program still counts as an answer
      return reviewLesson(l, given, Math.max(eligible, given.length))
    })
    return NextResponse.json({ data })
  } catch (e) {
    return feedbackError(e, 'summary')
  }
}
