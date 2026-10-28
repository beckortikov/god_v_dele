import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pickCurrentSprint, sprintsForParticipant, type Assignment, type MySprintData, type MyTask, type Sprint, type SprintTask, type TaskEvent } from '@/lib/sprints'
import { ASSIGNMENTS, EVENTS, NotFound, SPRINTS, check, errorResponse, requireUuid } from '../sprints/_lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET ?participant_id=<uuid>[&sprint_id=<uuid>] → MySprintData
 * Every sprint of the participant's program with their own score, and the
 * tasks of one sprint (the current one unless sprint_id is given) with history.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const participantId = requireUuid(searchParams.get('participant_id'), 'participant_id')
    const wanted = searchParams.get('sprint_id')

    const { data: participant, error: pErr } = await db
      .from('participants')
      .select('*, program:programs(id, name)')
      .eq('id', participantId)
      .maybeSingle()
    if (pErr) throw new Error(pErr.message)
    if (!participant) throw new NotFound('Участник не найден')
    const programRel = (participant as { program?: { id: string; name: string } | { id: string; name: string }[] | null }).program
    const program = (Array.isArray(programRel) ? programRel[0] : programRel) ?? null

    const empty: MySprintData = {
      participant: { id: participant.id, name: participant.name, program_id: participant.program_id },
      program,
      sprints: [],
      current: null,
      tasks: [],
    }
    if (!participant.program_id) return NextResponse.json({ data: empty })

    const { data: sprints, error: sErr } = await db.from(SPRINTS).select('*').eq('program_id', participant.program_id).order('number')
    check(sErr)
    // Program-wide sprints and those of the participant's own group (group_id exists after migration 018).
    const list = sprintsForParticipant((sprints ?? []) as Sprint[], (participant as { group_id?: string | null }).group_id)
    if (!list.length) return NextResponse.json({ data: empty })

    const { data: rows, error: aErr } = await db
      .from(ASSIGNMENTS)
      .select('*, task:sprint_tasks(*)')
      .eq('participant_id', participantId)
    check(aErr)
    const mine = ((rows ?? []) as (Assignment & { task: SprintTask | null })[]).filter(r => r.task?.sprint_id)

    const today = new Date().toISOString().slice(0, 10)
    const current = (wanted && list.find(s => s.id === wanted)) || pickCurrentSprint(list, today)

    const inCurrent = mine.filter(r => r.task!.sprint_id === current?.id)
    let events: TaskEvent[] = []
    if (inCurrent.length) {
      const { data, error } = await db
        .from(EVENTS)
        .select('*')
        .in('assignment_id', inCurrent.map(r => r.id))
        .order('created_at')
      check(error)
      events = (data ?? []) as TaskEvent[]
    }

    const tasks: MyTask[] = inCurrent
      .map(({ task, ...assignment }) => ({ task: task!, assignment, events: events.filter(e => e.assignment_id === assignment.id) }))
      .sort((a, b) => (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999'))

    const data: MySprintData = {
      ...empty,
      sprints: list.map(s => {
        const own = mine.filter(r => r.task!.sprint_id === s.id)
        return { ...s, total: own.length, done: own.filter(r => r.status === 'done').length }
      }),
      current: current ?? null,
      tasks,
    }
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'my sprint')
  }
}
