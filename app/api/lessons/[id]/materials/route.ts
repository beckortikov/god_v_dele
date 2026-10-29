import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { forbidden } from '@/lib/api-auth'
import { decodeName, isReportKey } from '@/lib/report-files'
import { MAX_MATERIALS, LessonInputError, parseLinkMaterial } from '@/lib/lessons'
import { LESSON_BUCKET, LessonBadRequest, LessonNotFound, MATERIALS, checkLessons, contentTypeOf, denyLesson, ensureLessonBucket, getLesson, inlineDisposition, isIosDevice, isLessonStaff, lessonsError, mayOpenLesson, publicMaterial, requireUuid } from '../../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET → { data: LessonMaterial[] }
 * GET ?download=<material id> → redirects to a signed link that works for a minute (a file),
 * so the sign-in and the audience are checked on every opening. A link material is opened by its url.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const lesson = await getLesson(id)
    if (!(await mayOpenLesson(req, lesson))) return denyLesson()

    const download = new URL(req.url).searchParams.get('download')
    if (download !== null) {
      const materialId = requireUuid(download, 'download')
      const { data: m, error } = await db.from(MATERIALS).select('*').eq('id', materialId).eq('lesson_id', id).maybeSingle()
      checkLessons(error)
      if (!m || m.kind !== 'file' || !isReportKey(m.file_key)) throw new LessonNotFound('Материал не найден')
      await ensureLessonBucket()
      const name = m.file_name || decodeName(m.file_key)
      const { data, error: sErr } = await db.storage.from(LESSON_BUCKET).createSignedUrl(`${id}/${m.file_key}`, 60, { download: name })
      if (sErr || !data) throw new LessonNotFound('Файл не найден в хранилище')
      if (isIosDevice(req)) {
        // an attachment opens as a blank page in the in-app browser of an iPhone: pass the file through, inline
        try {
          const file = await fetch(data.signedUrl)
          if (file.ok && file.body) {
            const headers: Record<string, string> = { 'Content-Type': contentTypeOf(m.file_key), 'Content-Disposition': inlineDisposition(name), 'Cache-Control': 'private, no-store' }
            const length = file.headers.get('content-length')
            if (length) headers['Content-Length'] = length
            return new Response(file.body, { headers })
          }
        } catch {
          // fall back to the plain link below
        }
      }
      return NextResponse.redirect(data.signedUrl, 302)
    }

    const { data, error } = await db.from(MATERIALS).select('*').eq('lesson_id', id).order('created_at')
    checkLessons(error)
    return NextResponse.json({ data: (data ?? []).map(publicMaterial) })
  } catch (e) {
    return lessonsError(e, 'materials')
  }
}

/**
 * POST { kind: 'link', url, title? } adds a link.
 * POST { kind: 'file', key, name, size, title? } registers a file that was uploaded through the link
 * from /materials/prepare; the file must really be in Storage.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const id = requireUuid((await params).id, 'id')
    const lesson = await getLesson(id)
    const body = await req.json()

    const { count, error: cErr } = await db.from(MATERIALS).select('id', { count: 'exact', head: true }).eq('lesson_id', id)
    checkLessons(cErr)
    if ((count ?? 0) >= MAX_MATERIALS) throw new LessonBadRequest(`К уроку можно приложить до ${MAX_MATERIALS} материалов`)

    let row: Record<string, unknown>
    if (body.kind === 'link') {
      const link = parseLinkMaterial(body)
      row = { lesson_id: id, kind: 'link', title: link.title, url: link.url }
    } else if (body.kind === 'file') {
      if (!isReportKey(body.key)) throw new LessonBadRequest('Неверное имя файла')
      await ensureLessonBucket()
      const { data: found, error: lErr } = await db.storage.from(LESSON_BUCKET).list(id, { limit: 200 })
      if (lErr) throw new Error(lErr.message)
      const object = (found ?? []).find(f => f.name === body.key)
      if (!object) throw new LessonBadRequest('Файл не загрузился в хранилище. Загрузите его ещё раз')
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : decodeName(body.key)
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 150) : name
      row = { lesson_id: id, kind: 'file', title, file_key: body.key, file_name: name, file_size: Number((object.metadata as { size?: number } | null)?.size ?? body.size ?? 0) || null }
    } else {
      throw new LessonInputError('Выберите: файл или ссылка')
    }

    const { data, error } = await db.from(MATERIALS).insert([{ ...row, created_by: getActor(req).name }]).select('*').single()
    checkLessons(error)
    await logAudit(req, { table: MATERIALS, recordId: data.id, action: 'create', summary: `Материал к уроку «${lesson.title}»: ${data.title}` })
    return NextResponse.json({ data: publicMaterial(data) }, { status: 201 })
  } catch (e) {
    return lessonsError(e, 'add material')
  }
}

/** DELETE ?material_id=<uuid> — the material, and its file from Storage. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const id = requireUuid((await params).id, 'id')
    const lesson = await getLesson(id)
    const materialId = requireUuid(new URL(req.url).searchParams.get('material_id'), 'material_id')
    const { data: m, error } = await db.from(MATERIALS).select('*').eq('id', materialId).eq('lesson_id', id).maybeSingle()
    checkLessons(error)
    if (!m) throw new LessonNotFound('Материал не найден')
    if (m.kind === 'file' && isReportKey(m.file_key)) {
      // like deleting a lesson: an orphaned file is harmless, so storage trouble never keeps the material
      const { error: sErr } = await db.storage.from(LESSON_BUCKET).remove([`${id}/${m.file_key}`])
      if (sErr) console.error('[lessons] material file not removed:', sErr.message)
    }
    const { error: dErr } = await db.from(MATERIALS).delete().eq('id', materialId)
    checkLessons(dErr)
    await logAudit(req, { table: MATERIALS, recordId: materialId, action: 'delete', summary: `Материал к уроку «${lesson.title}»: ${m.title}` })
    return NextResponse.json({ data: { id: materialId } })
  } catch (e) {
    return lessonsError(e, 'delete material')
  }
}
