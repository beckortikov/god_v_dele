import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { forbidden } from '@/lib/api-auth'
import { encodeKey } from '@/lib/report-files'
import { materialProblem } from '@/lib/lessons'
import { LESSON_BUCKET, LessonBadRequest, MATERIALS, checkLessons, ensureLessonBucket, getLesson, isLessonStaff, lessonsError, requireUuid } from '../../../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST { name, size, type } → { data: { key, signedUrl } }
 * Checks the file and hands out a one-time upload link, so a big presentation goes straight to
 * Storage (a serverless function would refuse it). After the upload the client registers the file
 * with POST /materials { kind: 'file', key, name }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isLessonStaff(req)) return forbidden()
    const id = requireUuid((await params).id, 'id')
    await getLesson(id)
    const body = await req.json()
    const { count, error } = await supabaseAdmin.from(MATERIALS).select('id', { count: 'exact', head: true }).eq('lesson_id', id)
    checkLessons(error)
    const problem = materialProblem(body, count ?? 0)
    if (problem) throw new LessonBadRequest(problem)
    await ensureLessonBucket()
    const key = encodeKey(body.name, body.type)
    const { data, error: uErr } = await supabaseAdmin.storage.from(LESSON_BUCKET).createSignedUploadUrl(`${id}/${key}`)
    if (uErr || !data) throw new Error(uErr?.message || 'Не удалось подготовить загрузку')
    return NextResponse.json({ data: { key, signedUrl: data.signedUrl } }, { status: 201 })
  } catch (e) {
    return lessonsError(e, 'prepare upload')
  }
}
