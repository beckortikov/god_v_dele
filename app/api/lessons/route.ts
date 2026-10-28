import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { forbidden } from '@/lib/api-auth'
import { dateRange } from '@/lib/sprints'
import { parseLesson, repeatWeekly, type Lesson, type LessonWithCount } from '@/lib/lessons'
import { isUuid } from '@/app/api/sprints/_lib/store'
import { LESSONS, LessonBadRequest, LessonNotFound, MATERIALS, assertGroupInProgram, checkLessons, isLessonStaff, lessonsError, requireUuid } from './_lib'

export const dynamic = 'force-dynamic'

/** GET ?program_id=<uuid>&from=<iso>&to=<iso> → { data: LessonWithCount[] } of every group, by start time. Curators only. */
export async function GET(req: Request) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const q = new URL(req.url).searchParams
    const programId = q.get('program_id')
    if (!isUuid(programId)) throw new LessonBadRequest('program_id: нужен UUID')
    let query = db.from(LESSONS).select('*').eq('program_id', programId)
    const from = q.get('from')
    const to = q.get('to')
    if (from) query = query.gte('starts_at', new Date(from).toISOString())
    if (to) query = query.lt('starts_at', new Date(to).toISOString())
    const { data, error } = await query.order('starts_at')
    checkLessons(error)
    const lessons = (data ?? []) as Lesson[]

    const counts = new Map<string, number>()
    if (lessons.length) {
      const { data: rows, error: mErr } = await db.from(MATERIALS).select('lesson_id').in('lesson_id', lessons.map(l => l.id))
      checkLessons(mErr)
      for (const r of rows ?? []) counts.set(r.lesson_id, (counts.get(r.lesson_id) ?? 0) + 1)
    }
    return NextResponse.json({ data: lessons.map(l => ({ ...l, material_count: counts.get(l.id) ?? 0 }) satisfies LessonWithCount) })
  } catch (e) {
    return lessonsError(e, 'list')
  }
}

/**
 * POST { program_id, group_id?, title, description?, starts_at, ends_at, format, link?, location?, teacher?, weeks? }
 * `weeks` > 1 creates the same lesson on each following week.
 */
export async function POST(req: Request) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const body = await req.json()
    const programId = requireUuid(body.program_id, 'program_id')
    const groupId = body.group_id ? requireUuid(body.group_id, 'group_id') : null
    if (groupId) await assertGroupInProgram(groupId, programId)
    const input = parseLesson(body)
    const { weeks, ...fields } = input
    const rows = repeatWeekly(input.starts_at, input.ends_at, weeks).map(t => ({
      ...fields,
      ...t,
      program_id: programId,
      ...(groupId ? { group_id: groupId } : {}),
      created_by: getActor(req).name,
    }))

    const { data, error } = await db.from(LESSONS).insert(rows).select('*')
    if (error?.code === '23503') throw new LessonNotFound('Поток не найден')
    checkLessons(error)
    const made = (data ?? []) as Lesson[]

    await logAudit(req, {
      table: LESSONS,
      recordId: made[0]?.id ?? programId,
      action: 'create',
      summary: `Урок «${input.title}», ${dateRange(input.starts_at.slice(0, 10), input.starts_at.slice(0, 10))}${weeks > 1 ? `, повторов: ${weeks}` : ''}`,
    })
    return NextResponse.json({ data: made.map(l => ({ ...l, material_count: 0 })) }, { status: 201 })
  } catch (e) {
    return lessonsError(e, 'create')
  }
}
