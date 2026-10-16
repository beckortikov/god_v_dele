import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { PASSPORT_BUCKET, scanProblem } from '@/lib/participant-profile'
import { decodeName, encodeKey, isReportKey } from '@/lib/report-files'
import { ProfileBadRequest, ensureDocsBucket, listScans, profileError, profileOwner } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET ?participant_id=<uuid> → { data: ScanFile[] }
 * GET ?participant_id=<uuid>&download=<key> → redirects to a signed link that works for a minute,
 * so the sign-in and the role are checked on every opening.
 */
export async function GET(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    await ensureDocsBucket()
    const download = new URL(req.url).searchParams.get('download')
    if (download !== null) {
      if (!isReportKey(download)) throw new ProfileBadRequest('Неверное имя файла')
      const { data, error } = await supabaseAdmin.storage.from(PASSPORT_BUCKET).createSignedUrl(`${owner.id}/${download}`, 60, { download: decodeName(download) })
      if (error || !data) throw new ProfileBadRequest('Файл не найден')
      await logAudit(req, { table: 'participant_profiles', recordId: owner.id, action: 'update', summary: `Скан паспорта участника «${owner.name}» открыт: ${decodeName(download)}` })
      return NextResponse.redirect(data.signedUrl, 302)
    }
    return NextResponse.json({ data: await listScans(owner.id) })
  } catch (e) {
    return profileError(e, 'list scans')
  }
}

/**
 * POST ?participant_id=<uuid> { name, size, type } → { data: { key, signedUrl } }
 * Checks the file and hands out a one-time upload link, so the photo goes straight to Storage.
 */
export async function POST(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    const body = await req.json()
    await ensureDocsBucket()
    const problem = scanProblem(body, (await listScans(owner.id)).length)
    if (problem) throw new ProfileBadRequest(problem)
    const key = encodeKey(body.name, body.type)
    const { data, error } = await supabaseAdmin.storage.from(PASSPORT_BUCKET).createSignedUploadUrl(`${owner.id}/${key}`)
    if (error || !data) throw new Error(error?.message || 'Не удалось подготовить загрузку')
    await logAudit(req, { table: 'participant_profiles', recordId: owner.id, action: 'update', summary: `Профиль участника «${owner.name}»: загружен скан паспорта` })
    return NextResponse.json({ data: { key, signedUrl: data.signedUrl } }, { status: 201 })
  } catch (e) {
    return profileError(e, 'prepare scan upload')
  }
}

/** DELETE ?participant_id=<uuid>&key=<key> */
export async function DELETE(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    const key = new URL(req.url).searchParams.get('key')
    if (!isReportKey(key)) throw new ProfileBadRequest('Неверное имя файла')
    const { error } = await supabaseAdmin.storage.from(PASSPORT_BUCKET).remove([`${owner.id}/${key}`])
    if (error) throw new Error(error.message)
    await logAudit(req, { table: 'participant_profiles', recordId: owner.id, action: 'update', summary: `Профиль участника «${owner.name}»: удалён скан паспорта` })
    return NextResponse.json({ data: { key } })
  } catch (e) {
    return profileError(e, 'delete scan')
  }
}
