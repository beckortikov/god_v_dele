import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { dateRange, nextSprintNumber, type Sprint, type SprintSummary } from '@/lib/sprints'
import {
  ASSIGNMENTS,
  BadRequest,
  GROUPS,
  NotFound,
  SPRINTS,
  TASKS,
  activeParticipantIds,
  assign,
  check,
  checkGroups,
  errorResponse,
  isUuid,
  notifyParticipants,
  optionalDate,
  requireUuid,
} from './_lib/store'

export const dynamic = 'force-dynamic'

/** GET ?program_id=<uuid> → { data: SprintSummary[] } of the whole program (every group), sorted by number. Each has group_id. */
export async function GET(req: Request) {
  const programId = new URL(req.url).searchParams.get('program_id')
  if (!isUuid(programId)) return NextResponse.json({ error: 'program_id: нужен UUID' }, { status: 400 })
  try {
    const { data: sprints, error } = await db.from(SPRINTS).select('*').eq('program_id', programId).order('number')
    check(error)
    const list = (sprints ?? []) as Sprint[]
    const ids = list.map(s => s.id)

    const tasksBySprint = new Map<string, string[]>()
    const sprintOfTask = new Map<string, string>()
    if (ids.length) {
      const { data: tasks, error: tErr } = await db.from(TASKS).select('id, sprint_id').in('sprint_id', ids)
      check(tErr)
      for (const t of tasks ?? []) {
        sprintOfTask.set(t.id, t.sprint_id)
        tasksBySprint.set(t.sprint_id, [...(tasksBySprint.get(t.sprint_id) ?? []), t.id])
      }
    }

    const counts = new Map<string, { assigned: number; done: number; review: number }>()
    const taskIds = [...sprintOfTask.keys()]
    if (taskIds.length) {
      const { data: rows, error: aErr } = await db.from(ASSIGNMENTS).select('task_id, status').in('task_id', taskIds)
      check(aErr)
      for (const r of rows ?? []) {
        const sid = sprintOfTask.get(r.task_id)!
        const c = counts.get(sid) ?? { assigned: 0, done: 0, review: 0 }
        c.assigned++
        if (r.status === 'done') c.done++
        if (r.status === 'review') c.review++
        counts.set(sid, c)
      }
    }

    const data: SprintSummary[] = list.map(s => ({
      ...s,
      task_count: tasksBySprint.get(s.id)?.length ?? 0,
      ...(counts.get(s.id) ?? { assigned: 0, done: 0, review: 0 }),
    }))
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'list')
  }
}

/**
 * POST { program_id, group_id?, title, goal?, start_date, end_date, backlog_task_ids?, carry_task_ids? }
 * Creates the next sprint of the program, or of one group of it (group_id). Tasks picked from the backlog move
 * into it (deadline = sprint end if they had none) and go to their audience.
 * Tasks carried over from an earlier sprint move too, with a new deadline (the
 * sprint end); whoever already passed them keeps «done», the rest see them in
 * the new sprint and an outdated personal deadline is dropped.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const programId = requireUuid(body.program_id, 'program_id')
    const title = String(body.title ?? '').trim()
    if (!title) throw new BadRequest('Укажите тему спринта')
    const start = optionalDate(body.start_date, 'start_date')
    const end = optionalDate(body.end_date, 'end_date')
    if (!start || !end) throw new BadRequest('Укажите даты начала и конца')
    if (end < start) throw new BadRequest('Конец спринта раньше начала')
    const pick: string[] = Array.isArray(body.backlog_task_ids) ? body.backlog_task_ids.filter(isUuid) : []
    const carry: string[] = Array.isArray(body.carry_task_ids) ? body.carry_task_ids.filter(isUuid) : []

    // A sprint for a group: the group must belong to this program.
    let groupId: string | null = null
    let groupName: string | null = null
    if (body.group_id) {
      groupId = requireUuid(body.group_id, 'group_id')
      const { data: group, error: gErr } = await db.from(GROUPS).select('id, name, program_id').eq('id', groupId).maybeSingle()
      checkGroups(gErr)
      if (!group || group.program_id !== programId) throw new NotFound('Группа не найдена в этом потоке')
      groupName = group.name
    }

    const { data: existing, error: lastErr } = await db.from(SPRINTS).select('*').eq('program_id', programId)
    check(lastErr)
    const number = nextSprintNumber((existing ?? []) as Sprint[], groupId)

    // group_id is sent only for a group sprint, so a database without migration 018 keeps working.
    const { data: sprint, error } = await db
      .from(SPRINTS)
      .insert({
        program_id: programId,
        ...(groupId ? { group_id: groupId } : {}),
        number,
        title,
        goal: String(body.goal ?? '').trim() || null,
        start_date: start,
        end_date: end,
      })
      .select('*')
      .single()
    check(error)

    let moved = 0
    if (pick.length) {
      const { data: tasks, error: tErr } = await db
        .from(TASKS)
        .select('*')
        .in('id', pick)
        .eq('program_id', programId)
        .is('sprint_id', null)
      check(tErr)
      const everyone = await activeParticipantIds(programId, groupId)
      for (const t of tasks ?? []) {
        const { error: uErr } = await db
          .from(TASKS)
          .update({ sprint_id: sprint.id, due_date: t.due_date ?? end, updated_at: new Date().toISOString() })
          .eq('id', t.id)
        check(uErr)
        if (t.audience === 'all') await assign(t.id, everyone)
        moved++
      }
    }

    let carried = 0
    if (carry.length) {
      // Only tasks of this program that already sit in some sprint (not the backlog).
      const { data: tasks, error: cErr } = await db
        .from(TASKS)
        .select('id')
        .in('id', carry)
        .eq('program_id', programId)
        .not('sprint_id', 'is', null)
        .neq('sprint_id', sprint.id)
      check(cErr)
      const ids = (tasks ?? []).map((t: { id: string }) => t.id)
      if (ids.length) {
        const { error: uErr } = await db.from(TASKS).update({ sprint_id: sprint.id, due_date: end, updated_at: new Date().toISOString() }).in('id', ids)
        check(uErr)
        const { error: dErr } = await db
          .from(ASSIGNMENTS)
          .update({ due_date: null })
          .in('task_id', ids)
          .in('status', ['todo', 'rework'])
          .lt('due_date', start)
        check(dErr)
        carried = ids.length
      }
    }

    await logAudit(req, {
      table: SPRINTS,
      recordId: sprint.id,
      action: 'create',
      summary: `Спринт ${number} «${title}»${groupName ? `, группа «${groupName}»` : ''}, ${dateRange(start, end)}${moved ? `, из бэклога: ${moved}` : ''}${carried ? `, перенесено: ${carried}` : ''}`,
      after: sprint,
    })

    if (start <= new Date().toISOString().slice(0, 10)) {
      const everyone = await activeParticipantIds(programId, groupId)
      // Awaited: on serverless hosts work left after the response may be cut off.
      await notifyParticipants(everyone, `Начался спринт ${number} «${title}» (${dateRange(start, end)}). Задачи — в кабинете, вкладка «Спринт».`)
    }

    return NextResponse.json({ data: sprint }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'create')
  }
}
