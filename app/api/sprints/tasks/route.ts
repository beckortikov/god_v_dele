import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { shortDate, type Audience, type SubmissionType } from '@/lib/sprints'
import {
  BadRequest,
  NotFound,
  SPRINTS,
  TASKS,
  activeParticipantIds,
  assign,
  check,
  errorResponse,
  isUuid,
  notifyParticipants,
  optionalDate,
  requireUuid,
} from '../_lib/store'

export const dynamic = 'force-dynamic'

const SUBMISSION_TYPES: SubmissionType[] = ['mark', 'text', 'link']

/** GET ?program_id=<uuid>&backlog=1 → backlog tasks of the program (no sprint). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const programId = searchParams.get('program_id')
  if (!isUuid(programId)) return NextResponse.json({ error: 'program_id: нужен UUID' }, { status: 400 })
  try {
    const { data, error } = await db
      .from(TASKS)
      .select('*')
      .eq('program_id', programId)
      .is('sprint_id', null)
      .order('created_at', { ascending: false })
    check(error)
    return NextResponse.json({ data: data ?? [] })
  } catch (e) {
    return errorResponse(e, 'backlog')
  }
}

/**
 * POST { program_id, sprint_id?, title, description?, due_date?, submission_type,
 *        requires_review?, remind?, audience: 'all' | 'selected', participant_ids? }
 * Without sprint_id the task goes to the backlog and is not assigned yet.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const programId = requireUuid(body.program_id, 'program_id')
    const sprintId = body.sprint_id ? requireUuid(body.sprint_id, 'sprint_id') : null
    const title = String(body.title ?? '').trim()
    if (!title) throw new BadRequest('Опишите задачу в двух словах')
    const submission: SubmissionType = SUBMISSION_TYPES.includes(body.submission_type) ? body.submission_type : 'text'
    const audience: Audience = body.audience === 'selected' ? 'selected' : 'all'
    const selected: string[] = Array.isArray(body.participant_ids) ? body.participant_ids.filter(isUuid) : []
    if (audience === 'selected' && !selected.length) throw new BadRequest('Выберите хотя бы одного участника')

    let dueDate = optionalDate(body.due_date, 'due_date')
    // A sprint of a group gives «всей группе» tasks only to that group.
    let sprintGroupId: string | null = null
    if (sprintId) {
      const { data: sprint, error } = await db.from(SPRINTS).select('*').eq('id', sprintId).maybeSingle()
      check(error)
      if (!sprint || sprint.program_id !== programId) throw new NotFound('Спринт не найден в этом потоке')
      dueDate = dueDate ?? sprint.end_date
      sprintGroupId = sprint.group_id ?? null
    }

    const { data: task, error } = await db
      .from(TASKS)
      .insert({
        program_id: programId,
        sprint_id: sprintId,
        title,
        description: String(body.description ?? '').trim() || null,
        due_date: dueDate,
        submission_type: submission,
        requires_review: body.requires_review !== false,
        remind: body.remind !== false,
        audience,
        created_by: getActor(req).name,
      })
      .select('*')
      .single()
    check(error)

    let assigned: string[] = []
    if (sprintId) {
      const audienceIds = audience === 'all' ? await activeParticipantIds(programId, sprintGroupId) : selected
      assigned = await assign(task.id, audienceIds)
    }

    await logAudit(req, {
      table: TASKS,
      recordId: task.id,
      action: 'create',
      summary: `Задача спринта «${title}»${sprintId ? `, участников: ${assigned.length}` : ', в бэклог'}`,
      after: task,
    })

    await notifyParticipants(assigned, `Новая задача: «${title}»${dueDate ? `, срок ${shortDate(dueDate)}` : ''}. Подробности — в кабинете, вкладка «Спринт».`)

    return NextResponse.json({ data: task, assigned: assigned.length }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'create task')
  }
}
