import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { dateRange, type Sprint, type SprintSummary } from '@/lib/sprints'
import {
  ASSIGNMENTS,
  BadRequest,
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
} from './_lib/store'

export const dynamic = 'force-dynamic'

/** GET ?program_id=<uuid> → { data: SprintSummary[] } sorted by number. */
export async function GET(req: Request) {
  const programId = new URL(req.url).searchParams.get('program_id')
  if (!isUuid(programId)) return NextResponse.json({ error: 'program_id: нужен UUID' }, { status: 400 })
  try {
    const { data: sprints, error } = await supabaseAdmin.from(SPRINTS).select('*').eq('program_id', programId).order('number')
    check(error)
    const list = (sprints ?? []) as Sprint[]
    const ids = list.map(s => s.id)

    const tasksBySprint = new Map<string, string[]>()
    const sprintOfTask = new Map<string, string>()
    if (ids.length) {
      const { data: tasks, error: tErr } = await supabaseAdmin.from(TASKS).select('id, sprint_id').in('sprint_id', ids)
      check(tErr)
      for (const t of tasks ?? []) {
        sprintOfTask.set(t.id, t.sprint_id)
        tasksBySprint.set(t.sprint_id, [...(tasksBySprint.get(t.sprint_id) ?? []), t.id])
      }
    }

    const counts = new Map<string, { assigned: number; done: number; review: number }>()
    const taskIds = [...sprintOfTask.keys()]
    if (taskIds.length) {
      const { data: rows, error: aErr } = await supabaseAdmin.from(ASSIGNMENTS).select('task_id, status').in('task_id', taskIds)
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
 * POST { program_id, title, goal?, start_date, end_date, backlog_task_ids? }
 * Creates the next sprint of the program. Tasks picked from the backlog move
 * into it (deadline = sprint end if they had none) and go to their audience.
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

    const { data: last, error: lastErr } = await supabaseAdmin
      .from(SPRINTS)
      .select('number')
      .eq('program_id', programId)
      .order('number', { ascending: false })
      .limit(1)
    check(lastErr)
    const number = (last?.[0]?.number ?? 0) + 1

    const { data: sprint, error } = await supabaseAdmin
      .from(SPRINTS)
      .insert({ program_id: programId, number, title, goal: String(body.goal ?? '').trim() || null, start_date: start, end_date: end })
      .select('*')
      .single()
    check(error)

    let moved = 0
    if (pick.length) {
      const { data: tasks, error: tErr } = await supabaseAdmin
        .from(TASKS)
        .select('*')
        .in('id', pick)
        .eq('program_id', programId)
        .is('sprint_id', null)
      check(tErr)
      const everyone = await activeParticipantIds(programId)
      for (const t of tasks ?? []) {
        const { error: uErr } = await supabaseAdmin
          .from(TASKS)
          .update({ sprint_id: sprint.id, due_date: t.due_date ?? end, updated_at: new Date().toISOString() })
          .eq('id', t.id)
        check(uErr)
        if (t.audience === 'all') await assign(t.id, everyone)
        moved++
      }
    }

    await logAudit(req, {
      table: SPRINTS,
      recordId: sprint.id,
      action: 'create',
      summary: `Спринт ${number} «${title}», ${dateRange(start, end)}${moved ? `, из бэклога: ${moved}` : ''}`,
      after: sprint,
    })

    if (start <= new Date().toISOString().slice(0, 10)) {
      const everyone = await activeParticipantIds(programId)
      // Awaited: on serverless hosts work left after the response may be cut off.
      await notifyParticipants(everyone, `Начался спринт ${number} «${title}» (${dateRange(start, end)}). Задачи — в кабинете, вкладка «Спринт».`)
    }

    return NextResponse.json({ data: sprint }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'create')
  }
}
