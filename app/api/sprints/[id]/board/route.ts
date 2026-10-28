import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Assignment, BoardData, ParticipantLite, Sprint, SprintTask } from '@/lib/sprints'
import { ASSIGNMENTS, NotFound, SPRINTS, TASKS, check, errorResponse, requireUuid } from '../../_lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET → BoardData: the sprint, its tasks, every assignment, and the people:
 * active participants of the program plus anyone who already has a task here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const { data: sprint, error } = await db.from(SPRINTS).select('*').eq('id', id).maybeSingle()
    check(error)
    if (!sprint) throw new NotFound('Спринт не найден')

    // Tasks and the program's people do not depend on each other.
    // A sprint of a group shows only that group; a program-wide sprint shows everyone.
    const groupId = (sprint as Sprint).group_id ?? null
    let peopleQuery = db.from('participants').select('id, name, phone, status').eq('program_id', (sprint as Sprint).program_id).eq('status', 'active')
    if (groupId) peopleQuery = peopleQuery.eq('group_id', groupId)
    const [{ data: tasks, error: tErr }, { data: active, error: pErr }] = await Promise.all([
      db
        .from(TASKS)
        .select('*')
        .eq('sprint_id', id)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at'),
      peopleQuery,
    ])
    check(tErr)
    if (pErr) throw new Error(pErr.message)
    const taskIds = (tasks ?? []).map(t => t.id)

    let assignments: Assignment[] = []
    if (taskIds.length) {
      const { data, error: aErr } = await db.from(ASSIGNMENTS).select('*').in('task_id', taskIds)
      check(aErr)
      assignments = (data ?? []) as Assignment[]
    }

    const people = new Map<string, ParticipantLite>((active ?? []).map(p => [p.id, p]))
    const missing = [...new Set(assignments.map(a => a.participant_id))].filter(pid => !people.has(pid))
    if (missing.length) {
      const { data: extra, error: eErr } = await db.from('participants').select('id, name, phone, status').in('id', missing)
      if (eErr) throw new Error(eErr.message)
      for (const p of extra ?? []) people.set(p.id, p)
    }

    const data: BoardData = {
      sprint: sprint as Sprint,
      tasks: (tasks ?? []) as SprintTask[],
      participants: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      assignments,
    }
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'board')
  }
}
