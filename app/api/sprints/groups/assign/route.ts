import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  BadRequest,
  GROUPS,
  NotFound,
  SPRINTS,
  TASKS,
  assign,
  checkGroups,
  errorResponse,
  requireUuid,
} from '../../_lib/store'

export const dynamic = 'force-dynamic'

/**
 * PUT { program_id, assignments: [{ participant_id, group_id: uuid | null }] }
 * Moves participants between groups (null — out of any group). Whoever joins a
 * group gets the «всей группе» tasks of the group's sprints that are still running
 * or ahead, so a person added mid-sprint is not left without tasks.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const programId = requireUuid(body.program_id, 'program_id')
    const items: { participant_id: string; group_id: string | null }[] = Array.isArray(body.assignments)
      ? body.assignments.map((a: { participant_id?: unknown; group_id?: unknown }) => ({
          participant_id: requireUuid(a.participant_id, 'participant_id'),
          group_id: a.group_id == null || a.group_id === '' ? null : requireUuid(a.group_id, 'group_id'),
        }))
      : []
    if (!items.length) throw new BadRequest('Нечего менять')

    const groupIds = [...new Set(items.map(i => i.group_id).filter((g): g is string => !!g))]
    const groupName = new Map<string, string>()
    if (groupIds.length) {
      const { data, error } = await db.from(GROUPS).select('id, name, program_id').in('id', groupIds)
      checkGroups(error)
      for (const g of data ?? []) {
        if (g.program_id !== programId) throw new BadRequest('Группа из другого потока')
        groupName.set(g.id, g.name)
      }
      if (groupName.size !== groupIds.length) throw new NotFound('Группа не найдена')
    }

    const ids = items.map(i => i.participant_id)
    const { data: people, error: pErr } = await db.from('participants').select('id, name, program_id, group_id').in('id', ids)
    checkGroups(pErr)
    const byId = new Map((people ?? []).map(p => [p.id, p]))
    for (const id of ids) {
      const p = byId.get(id)
      if (!p) throw new NotFound('Участник не найден')
      if (p.program_id !== programId) throw new BadRequest(`Участник «${p.name}» из другого потока`)
    }

    // One update per target group (and one for "no group"): few round-trips even for a whole program.
    const changed = items.filter(i => (byId.get(i.participant_id)!.group_id ?? null) !== i.group_id)
    const targets = new Map<string | null, string[]>()
    for (const c of changed) targets.set(c.group_id, [...(targets.get(c.group_id) ?? []), c.participant_id])
    for (const [groupId, pids] of targets) {
      const { error } = await db.from('participants').update({ group_id: groupId }).in('id', pids)
      checkGroups(error)
    }

    // Joiners get the group's current and upcoming «всей группе» tasks.
    const today = new Date().toISOString().slice(0, 10)
    let handedOut = 0
    for (const [groupId, pids] of targets) {
      if (!groupId) continue
      const { data: sprints, error: sErr } = await db.from(SPRINTS).select('id').eq('group_id', groupId).gte('end_date', today)
      checkGroups(sErr)
      const sprintIds = (sprints ?? []).map((s: { id: string }) => s.id)
      if (!sprintIds.length) continue
      const { data: tasks, error: tErr } = await db.from(TASKS).select('id').in('sprint_id', sprintIds).eq('audience', 'all')
      checkGroups(tErr)
      for (const t of tasks ?? []) handedOut += (await assign(t.id, pids)).length
    }

    for (const c of changed) {
      const p = byId.get(c.participant_id)!
      await logAudit(req, {
        table: 'participants',
        recordId: p.id,
        action: 'update',
        summary: `Участник «${p.name}»: группа ${c.group_id ? `«${groupName.get(c.group_id)}»` : 'снята'}`,
        before: { group_id: p.group_id ?? null },
        after: { group_id: c.group_id },
      })
    }

    return NextResponse.json({ success: true, changed: changed.length, tasks_assigned: handedOut })
  } catch (e) {
    return errorResponse(e, 'assign groups')
  }
}
