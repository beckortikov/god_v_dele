import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { getActor, logAudit } from '@/lib/audit'
import { forbidden, isSprintCurator, sessionOf } from '@/lib/api-auth'
import { participantName } from '@/app/api/audit/_server'
import { applyAction, shortDate, type AssignmentAction, type TaskEvent } from '@/lib/sprints'
import {
  ASSIGNMENTS,
  BadRequest,
  EVENTS,
  addEvent,
  check,
  errorResponse,
  getAssignment,
  getTask,
  notifyParticipants,
  optionalDate,
  requireUuid,
} from '../../_lib/store'

export const dynamic = 'force-dynamic'

/** GET → { data: { assignment, task, events } } */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const assignment = await getAssignment(id)
    const session = sessionOf(req)
    if (session?.role === 'participant' && session.pid !== assignment.participant_id) return forbidden()
    const task = await getTask(assignment.task_id)
    const { data: events, error } = await supabaseAdmin.from(EVENTS).select('*').eq('assignment_id', id).order('created_at')
    check(error)
    return NextResponse.json({ data: { assignment, task, events: (events ?? []) as TaskEvent[] } })
  } catch (e) {
    return errorResponse(e, 'get assignment')
  }
}

// Actions the participant takes on their own task; the rest are the curator's.
const PARTICIPANT_ACTIONS = new Set(['submit', 'mark', 'unmark'])

/**
 * POST { type: 'submit' | 'mark' | 'unmark' | 'accept' | 'return', ... , participant_id? }
 * Participant actions need the session of the participant the task belongs to; accept / return need a curator.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const body = await req.json()
    const assignment = await getAssignment(id)
    const task = await getTask(assignment.task_id)

    const type = String(body.type ?? '')
    // Who is acting comes from the session, never from the request body
    const session = sessionOf(req)
    if (PARTICIPANT_ACTIONS.has(type)) {
      if (session?.role !== 'participant' || session.pid !== assignment.participant_id) return forbidden('Это не ваша задача')
    } else if (!isSprintCurator(session)) {
      return forbidden('Принимать и возвращать работы может куратор')
    }

    let action: AssignmentAction
    switch (type) {
      case 'submit':
        action = { type, report_text: body.report_text ?? null, report_link: body.report_link ?? null }
        break
      case 'mark':
      case 'unmark':
        action = { type }
        break
      case 'accept':
        action = { type, comment: body.comment ?? null }
        break
      case 'return':
        action = { type, comment: body.comment ?? null, due_date: optionalDate(body.due_date, 'due_date') }
        break
      default:
        throw new BadRequest('Неизвестное действие')
    }

    const { patch, event } = applyAction(task, assignment, action)
    const actor = getActor(req)
    const update = { ...patch, updated_at: new Date().toISOString(), ...(type === 'accept' || type === 'return' ? { reviewed_by: actor.name } : {}) }
    const { data, error } = await supabaseAdmin.from(ASSIGNMENTS).update(update).eq('id', id).select('*').single()
    check(error)

    await addEvent(id, event, {
      comment: type === 'accept' || type === 'return' ? (patch.review_comment ?? null) : null,
      due_date: type === 'return' ? (patch.due_date ?? null) : null,
      actor_name: actor.name,
    })

    const who = await participantName(assignment.participant_id)
    await logAudit(req, {
      table: ASSIGNMENTS,
      recordId: id,
      action: 'update',
      summary: `«${task.title}»${who ? ` — ${who}` : ''}: ${EVENT_LABEL[event]}`,
      before: assignment,
      after: data,
    })

    if (type === 'return') {
      await notifyParticipants(
        [assignment.participant_id],
        `Задачу «${task.title}» вернули на доработку${patch.due_date ? `, исправить до ${shortDate(patch.due_date)}` : ''}.\nКомментарий куратора: ${patch.review_comment}`
      )
    } else if (type === 'accept') {
      await notifyParticipants([assignment.participant_id], `Задача «${task.title}» принята.${patch.review_comment ? `\nКуратор: ${patch.review_comment}` : ''}`)
    }

    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'assignment action')
  }
}

const EVENT_LABEL = {
  submitted: 'отчёт отправлен',
  returned: 'возвращено на доработку',
  accepted: 'принято',
  marked: 'отмечено выполненным',
  unmarked: 'отметка снята',
} as const
