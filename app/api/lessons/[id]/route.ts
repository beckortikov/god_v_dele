import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { forbidden } from '@/lib/api-auth'
import { parseLesson } from '@/lib/lessons'
import { LESSONS, LESSON_BUCKET, MATERIALS, assertGroupInProgram, checkLessons, denyLesson, getLesson, isLessonStaff, lessonsError, mayOpenLesson, publicMaterial, requireUuid } from '../_lib'

export const dynamic = 'force-dynamic'

/** GET → { data: Lesson & { materials } } for curators and for the participants the lesson is for. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const lesson = await getLesson(id)
    if (!(await mayOpenLesson(req, lesson))) return denyLesson()
    const { data, error } = await supabaseAdmin.from(MATERIALS).select('*').eq('lesson_id', id).order('created_at')
    checkLessons(error)
    return NextResponse.json({ data: { ...lesson, materials: (data ?? []).map(publicMaterial) } })
  } catch (e) {
    return lessonsError(e, 'get')
  }
}

/** PATCH { group_id?, title, description?, starts_at, ends_at, format, link?, location?, teacher? } → changes this one lesson. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const id = requireUuid((await params).id, 'id')
    const before = await getLesson(id)
    const body = await req.json()
    const { weeks: _weeks, ...fields } = parseLesson(body)
    void _weeks
    const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }
    if ('group_id' in body) {
      const groupId = body.group_id ? requireUuid(body.group_id, 'group_id') : null
      if (groupId) await assertGroupInProgram(groupId, before.program_id)
      patch.group_id = groupId
    }
    const { data, error } = await supabaseAdmin.from(LESSONS).update(patch).eq('id', id).select('*').single()
    checkLessons(error)
    await logAudit(req, { table: LESSONS, recordId: id, action: 'update', summary: `Урок «${fields.title}»` })
    return NextResponse.json({ data })
  } catch (e) {
    return lessonsError(e, 'update')
  }
}

/** DELETE — the lesson with its materials, files included. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const id = requireUuid((await params).id, 'id')
    const lesson = await getLesson(id)
    const { data: mats, error: mErr } = await supabaseAdmin.from(MATERIALS).select('file_key').eq('lesson_id', id)
    checkLessons(mErr)
    const keys = (mats ?? []).filter(m => m.file_key).map(m => `${id}/${m.file_key}`)
    if (keys.length) {
      try {
        await supabaseAdmin.storage.from(LESSON_BUCKET).remove(keys)
      } catch {
        // an orphaned file is harmless; the lesson still goes
      }
    }
    const { error } = await supabaseAdmin.from(LESSONS).delete().eq('id', id)
    checkLessons(error)
    await logAudit(req, { table: LESSONS, recordId: id, action: 'delete', summary: `Урок «${lesson.title}»${keys.length ? ` и файлов: ${keys.length}` : ''}`, before: lesson })
    return NextResponse.json({ success: true })
  } catch (e) {
    return lessonsError(e, 'delete')
  }
}
