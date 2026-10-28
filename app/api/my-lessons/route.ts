import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { lessonsForParticipant, type Lesson, type LessonMaterial } from '@/lib/lessons'
import { LESSONS, LessonBadRequest, MATERIALS, checkLessons, lessonsError, publicMaterial, requireUuid } from '../lessons/_lib'

export const dynamic = 'force-dynamic'

export interface MyLesson extends Lesson {
  materials: LessonMaterial[]
}

/**
 * GET ?participant_id=<uuid>&from=<iso>&to=<iso> → { data: MyLesson[] }
 * The lessons of the participant's program for the whole program or their own group, with materials.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams
    const participantId = requireUuid(q.get('participant_id'), 'participant_id')
    const { data: person, error: pErr } = await db.from('participants').select('*').eq('id', participantId).maybeSingle()
    if (pErr) throw new Error(pErr.message)
    if (!person) throw new LessonBadRequest('Участник не найден')
    if (!person.program_id) return NextResponse.json({ data: [] })

    let query = db.from(LESSONS).select('*').eq('program_id', person.program_id)
    const from = q.get('from')
    const to = q.get('to')
    if (from) query = query.gte('starts_at', new Date(from).toISOString())
    if (to) query = query.lt('starts_at', new Date(to).toISOString())
    const { data, error } = await query.order('starts_at')
    checkLessons(error)
    // group_id exists only after migration 018: without it everyone shares the program's lessons
    const lessons = lessonsForParticipant((data ?? []) as Lesson[], person.group_id ?? null)

    const byLesson = new Map<string, LessonMaterial[]>()
    if (lessons.length) {
      const { data: mats, error: mErr } = await db.from(MATERIALS).select('*').in('lesson_id', lessons.map(l => l.id)).order('created_at')
      checkLessons(mErr)
      for (const m of mats ?? []) byLesson.set(m.lesson_id, [...(byLesson.get(m.lesson_id) ?? []), publicMaterial(m)])
    }
    return NextResponse.json({ data: lessons.map(l => ({ ...l, materials: byLesson.get(l.id) ?? [] }) satisfies MyLesson) })
  } catch (e) {
    return lessonsError(e, 'my lessons')
  }
}
