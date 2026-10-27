import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { getActor, logAudit } from '@/lib/audit'
import { parseFeedback, type LessonFeedback } from '@/lib/lesson-feedback'
import { lessonsForParticipant, lessonState } from '@/lib/lessons'
import { LessonBadRequest, getLesson, requireUuid } from '../lessons/_lib'
import { FEEDBACK, checkFeedback, feedbackError } from './_lib'

export const dynamic = 'force-dynamic'

/** GET ?participant_id=<uuid> → { data: LessonFeedback[] }: the reviews this participant has already given. */
export async function GET(req: Request) {
  try {
    const participantId = requireUuid(new URL(req.url).searchParams.get('participant_id'), 'participant_id')
    const { data, error } = await supabaseAdmin.from(FEEDBACK).select('*').eq('participant_id', participantId)
    checkFeedback(error)
    return NextResponse.json({ data: (data ?? []) as LessonFeedback[] })
  } catch (e) {
    return feedbackError(e, 'list')
  }
}

/**
 * POST ?participant_id=<uuid> { lesson_id, content, clarity, support, useful, overall (1-10), comment? }
 * One review per participant per lesson: sending again replaces it. Only for a lesson that has started and
 * that is meant for this participant (their program, the whole program or their group).
 */
export async function POST(req: Request) {
  try {
    const participantId = requireUuid(new URL(req.url).searchParams.get('participant_id'), 'participant_id')
    const body = await req.json().catch(() => null)
    const lessonId = requireUuid(body?.lesson_id, 'lesson_id')
    const { scores, comment } = parseFeedback(body)

    const { data: person, error: pErr } = await supabaseAdmin.from('participants').select('id, name, program_id, group_id').eq('id', participantId).maybeSingle()
    if (pErr) throw new Error(pErr.message)
    if (!person) throw new LessonBadRequest('Участник не найден')
    const lesson = await getLesson(lessonId)
    if (lesson.program_id !== person.program_id || !lessonsForParticipant([lesson], person.group_id ?? null).length) throw new LessonBadRequest('Этот урок не для вас')
    if (lessonState(lesson) === 'upcoming') throw new LessonBadRequest('Урок ещё не начался: оценить его можно после занятия')

    const { data, error } = await supabaseAdmin
      .from(FEEDBACK)
      .upsert({ lesson_id: lessonId, participant_id: participantId, ...scores, comment, updated_at: new Date().toISOString() }, { onConflict: 'lesson_id,participant_id' })
      .select('*')
      .single()
    checkFeedback(error)
    // The журнал gets the fact, not the answers
    await logAudit(req, { table: FEEDBACK, recordId: data.id, action: 'update', summary: `Отзыв об уроке «${lesson.title}» от ${getActor(req).name || person.name}` })
    return NextResponse.json({ data })
  } catch (e) {
    return feedbackError(e, 'save')
  }
}
