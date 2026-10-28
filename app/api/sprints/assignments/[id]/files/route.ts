import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, isSprintCurator, sessionOf } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { REPORT_BUCKET, decodeName, encodeKey, isReportKey, uploadProblem } from '@/lib/report-files'
import { BadRequest, errorResponse, getAssignment, getTask, requireUuid } from '../../../_lib/store'
import { ensureBucket, listFiles } from '../../../_lib/report-storage'

export const dynamic = 'force-dynamic'

/** The participant who owns the task, or a curator. */
function canSee(req: Request, participantId: string) {
  const s = sessionOf(req)
  return isSprintCurator(s) || (s?.role === 'participant' && s.pid === participantId)
}

/**
 * GET → { data: ReportFile[] }
 * GET ?download=<key> → redirects to a signed link that works for a minute.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const a = await getAssignment(id)
    if (!canSee(req, a.participant_id)) return forbidden()
    await ensureBucket()

    const download = new URL(req.url).searchParams.get('download')
    if (download !== null) {
      if (!isReportKey(download)) throw new BadRequest('Неверное имя файла')
      const { data, error } = await db.storage.from(REPORT_BUCKET).createSignedUrl(`${id}/${download}`, 60, { download: decodeName(download) })
      if (error || !data) throw new BadRequest('Файл не найден')
      return NextResponse.redirect(data.signedUrl, 302)
    }
    return NextResponse.json({ data: await listFiles(id) })
  } catch (e) {
    return errorResponse(e, 'list files')
  }
}

/** Only the owner changes the files, and only until the task is accepted. */
async function ownerOf(req: Request, id: string) {
  const a = await getAssignment(id)
  const s = sessionOf(req)
  if (s?.role !== 'participant' || s.pid !== a.participant_id) return { error: forbidden('Это не ваша задача') } as const
  if (a.status === 'done') return { error: NextResponse.json({ error: 'Задача уже принята, файлы менять нельзя' }, { status: 400 }) } as const
  const task = await getTask(a.task_id)
  if (task.submission_type === 'mark') return { error: NextResponse.json({ error: 'К этой задаче файлы не прикладываются' }, { status: 400 }) } as const
  return { a, task } as const
}

/**
 * POST { name, size, type } → { data: { key, signedUrl } }
 * Checks the file and hands out a one-time upload link, so the file itself goes
 * straight to Storage (a serverless function would refuse a phone photo this big).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const own = await ownerOf(req, id)
    if ('error' in own) return own.error
    const body = await req.json()
    await ensureBucket()
    const existing = await listFiles(id)
    const problem = uploadProblem(body, existing.length)
    if (problem) throw new BadRequest(problem)

    const key = encodeKey(body.name, body.type)
    const { data, error } = await db.storage.from(REPORT_BUCKET).createSignedUploadUrl(`${id}/${key}`)
    if (error || !data) throw new Error(error?.message || 'Не удалось подготовить загрузку')
    await logAudit(req, { table: 'sprint_task_assignments', recordId: id, action: 'update', summary: `«${own.task.title}»: приложен файл ${decodeName(key)}` })
    return NextResponse.json({ data: { key, signedUrl: data.signedUrl } }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'prepare upload')
  }
}

/** DELETE ?key=<key> */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, 'id')
    const own = await ownerOf(req, id)
    if ('error' in own) return own.error
    const key = new URL(req.url).searchParams.get('key')
    if (!isReportKey(key)) throw new BadRequest('Неверное имя файла')
    const { error } = await db.storage.from(REPORT_BUCKET).remove([`${id}/${key}`])
    if (error) throw new Error(error.message)
    await logAudit(req, { table: 'sprint_task_assignments', recordId: id, action: 'update', summary: `«${own.task.title}»: удалён файл ${decodeName(key)}` })
    return NextResponse.json({ data: { key } })
  } catch (e) {
    return errorResponse(e, 'delete file')
  }
}
