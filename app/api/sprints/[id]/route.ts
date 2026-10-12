import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix } from '@/lib/audit-labels'
import { BadRequest, NotFound, SPRINTS, TASKS, check, errorResponse, optionalDate, requireUuid } from '../_lib/store'

export const dynamic = 'force-dynamic'

/** PATCH { title?, goal?, start_date?, end_date? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const body = await req.json()
    const before = await fetchRow(SPRINTS, id)
    if (!before) throw new NotFound('Спринт не найден')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title) throw new BadRequest('Укажите тему спринта')
      patch.title = title
    }
    if (body.goal !== undefined) patch.goal = String(body.goal ?? '').trim() || null
    if (body.start_date !== undefined) patch.start_date = optionalDate(body.start_date, 'start_date')
    if (body.end_date !== undefined) patch.end_date = optionalDate(body.end_date, 'end_date')
    const start = (patch.start_date ?? before.start_date) as string
    const end = (patch.end_date ?? before.end_date) as string
    if (!start || !end) throw new BadRequest('Укажите даты начала и конца')
    if (end < start) throw new BadRequest('Конец спринта раньше начала')

    const { data, error } = await supabaseAdmin.from(SPRINTS).update(patch).eq('id', id).select('*').single()
    check(error)
    await logAudit(req, {
      table: SPRINTS,
      recordId: id,
      action: 'update',
      summary: `Спринт ${data.number} «${data.title}»${changeSuffix(before, data)}`,
      before,
      after: data,
    })
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'update')
  }
}

/** DELETE — only an empty sprint, so nobody loses their reports by accident. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const before = await fetchRow(SPRINTS, id)
    if (!before) throw new NotFound('Спринт не найден')
    const { count, error: cErr } = await supabaseAdmin.from(TASKS).select('id', { count: 'exact', head: true }).eq('sprint_id', id)
    check(cErr)
    if (count) throw new BadRequest('В спринте есть задачи. Сначала удалите их или верните в бэклог.')
    const { error } = await supabaseAdmin.from(SPRINTS).delete().eq('id', id)
    check(error)
    await logAudit(req, { table: SPRINTS, recordId: id, action: 'delete', summary: `Спринт ${before.number} «${before.title}»`, before })
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse(e, 'delete')
  }
}
