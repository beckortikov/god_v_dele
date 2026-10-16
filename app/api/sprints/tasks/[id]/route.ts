import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix } from '@/lib/audit-labels'
import type { SubmissionType } from '@/lib/sprints'
import {
  ASSIGNMENTS,
  BadRequest,
  NotFound,
  SPRINTS,
  TASKS,
  activeParticipantIds,
  assign,
  check,
  errorResponse,
  isUuid,
  optionalDate,
  requireUuid,
} from '../../_lib/store'

export const dynamic = 'force-dynamic'

const SUBMISSION_TYPES: SubmissionType[] = ['mark', 'text', 'link']

/**
 * PATCH { title?, description?, due_date?, submission_type?, requires_review?, remind?, sprint_id? }
 * sprint_id moves a task between the backlog (null) and a sprint. A task that
 * enters a sprint goes to its audience; leaving a sprint is only allowed while
 * nobody has started it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const body = await req.json()
    const before = await fetchRow(TASKS, id)
    if (!before) throw new NotFound('Задача не найдена')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title) throw new BadRequest('Опишите задачу в двух словах')
      patch.title = title
    }
    if (body.description !== undefined) patch.description = String(body.description ?? '').trim() || null
    if (body.due_date !== undefined) patch.due_date = optionalDate(body.due_date, 'due_date')
    if (body.submission_type !== undefined) {
      if (!SUBMISSION_TYPES.includes(body.submission_type)) throw new BadRequest('Неизвестный способ сдачи')
      patch.submission_type = body.submission_type
    }
    if (body.requires_review !== undefined) patch.requires_review = !!body.requires_review
    if (body.remind !== undefined) patch.remind = !!body.remind

    let entering: { id: string; end_date: string; group_id?: string | null } | null = null
    if (body.sprint_id !== undefined && body.sprint_id !== before.sprint_id) {
      if (body.sprint_id === null) {
        const { count, error } = await supabaseAdmin
          .from(ASSIGNMENTS)
          .select('id', { count: 'exact', head: true })
          .eq('task_id', id)
          .neq('status', 'todo')
        check(error)
        if (count) throw new BadRequest('По задаче уже есть сданные отчёты, её нельзя вернуть в бэклог')
        const { error: dErr } = await supabaseAdmin.from(ASSIGNMENTS).delete().eq('task_id', id)
        check(dErr)
        patch.sprint_id = null
      } else {
        if (!isUuid(body.sprint_id)) throw new BadRequest('sprint_id: нужен UUID')
        const { data: sprint, error } = await supabaseAdmin.from(SPRINTS).select('*').eq('id', body.sprint_id).maybeSingle()
        check(error)
        if (!sprint || sprint.program_id !== before.program_id) throw new NotFound('Спринт не найден в этом потоке')
        patch.sprint_id = sprint.id
        if (!before.due_date && patch.due_date === undefined) patch.due_date = sprint.end_date
        entering = sprint
      }
    }

    const { data, error } = await supabaseAdmin.from(TASKS).update(patch).eq('id', id).select('*').single()
    check(error)
    if (entering && data.audience === 'all') await assign(id, await activeParticipantIds(data.program_id, entering.group_id ?? null))

    await logAudit(req, {
      table: TASKS,
      recordId: id,
      action: 'update',
      summary: `Задача спринта «${data.title}»${changeSuffix(before, data)}`,
      before,
      after: data,
    })
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'update task')
  }
}

/** DELETE — removes the task with every participant's copy and report. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const before = await fetchRow(TASKS, id)
    if (!before) throw new NotFound('Задача не найдена')
    const { error } = await supabaseAdmin.from(TASKS).delete().eq('id', id)
    check(error)
    await logAudit(req, { table: TASKS, recordId: id, action: 'delete', summary: `Задача спринта «${before.title}»`, before })
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse(e, 'delete task')
  }
}
