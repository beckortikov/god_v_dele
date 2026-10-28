import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { BadRequest, GROUPS, NotFound, SPRINTS, checkGroups, errorResponse, requireUuid } from '../../_lib/store'

export const dynamic = 'force-dynamic'

/** PATCH { name } → renames the group. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) throw new BadRequest('Назовите группу')
    if (name.length > 60) throw new BadRequest('Название группы длиннее 60 символов')
    const before = await fetchRow(GROUPS, id)
    if (!before) throw new NotFound('Группа не найдена')

    const { data, error } = await db
      .from(GROUPS)
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, program_id, name')
      .single()
    if (error?.code === '23505') throw new BadRequest(`Группа «${name}» уже есть в этом потоке`)
    checkGroups(error)

    await logAudit(req, { table: GROUPS, recordId: id, action: 'update', summary: `Группа «${before.name}» → «${name}»`, before, after: data })
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'rename group')
  }
}

/** DELETE — a group without sprints; its participants stay in the program without a group. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const before = await fetchRow(GROUPS, id)
    if (!before) throw new NotFound('Группа не найдена')

    const { count, error: cErr } = await db.from(SPRINTS).select('id', { count: 'exact', head: true }).eq('group_id', id)
    checkGroups(cErr)
    if (count) throw new BadRequest('У группы есть спринты. Чтобы не потерять отчёты, удалить её нельзя.')

    // Lessons of the group (migration 020) hold materials: keep them too. A missing table means no lessons.
    const { count: lessonCount, error: lErr } = await db.from('lessons').select('id', { count: 'exact', head: true }).eq('group_id', id)
    if (!lErr && lessonCount) throw new BadRequest('У группы есть уроки в календаре. Чтобы не потерять материалы, удалить её нельзя.')

    const { error } = await db.from(GROUPS).delete().eq('id', id)
    checkGroups(error)
    await logAudit(req, { table: GROUPS, recordId: id, action: 'delete', summary: `Группа «${before.name}»`, before })
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse(e, 'delete group')
  }
}
