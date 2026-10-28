import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActor, logAudit } from '@/lib/audit'
import { FIELD_LABELS, parseProfile, type BusinessYear, type ParticipantProfile } from '@/lib/participant-profile'
import { checkProfile, ensureDocsBucket, listScans, profileError, profileOwner, type ScanFile } from './_lib'

export const dynamic = 'force-dynamic'

export interface ProfileData {
  participant: { id: string; name: string; phone: string | null; email: string | null }
  profile: ParticipantProfile | null
  years: BusinessYear[]
  scans: ScanFile[]
  /** Storage could not be reached: the scans list is unknown, not empty. */
  scansUnavailable: boolean
}

const num = (v: unknown) => (v == null ? null : Number(v))

/** GET ?participant_id=<uuid> → { data: ProfileData } */
export async function GET(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner

    const [{ data: profile, error: pErr }, { data: years, error: yErr }] = await Promise.all([
      db.from('participant_profiles').select('*').eq('participant_id', owner.id).maybeSingle(),
      db.from('participant_business_years').select('*').eq('participant_id', owner.id).order('year'),
    ])
    checkProfile(pErr)
    checkProfile(yErr)

    let scans: ScanFile[] = []
    let scansUnavailable = false
    try {
      await ensureDocsBucket()
      scans = await listScans(owner.id)
    } catch {
      scansUnavailable = true
    }

    const data: ProfileData = {
      participant: owner,
      profile: (profile as ParticipantProfile | null) ?? null,
      years: (years ?? []).map(y => ({ participant_id: y.participant_id, year: y.year, turnover: num(y.turnover), net_profit: num(y.net_profit), goal_turnover: num(y.goal_turnover), notes: y.notes })),
      scans,
      scansUnavailable,
    }
    return NextResponse.json({ data })
  } catch (e) {
    return profileError(e, 'get')
  }
}

/** PUT ?participant_id=<uuid> { birth_date?, city?, activity?, business_name?, website?, employees_count?, currency? } */
export async function PUT(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    const fields = parseProfile(await req.json())
    if (!Object.keys(fields).length) return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })

    const { data: before, error: bErr } = await db.from('participant_profiles').select('*').eq('participant_id', owner.id).maybeSingle()
    checkProfile(bErr)

    const { data, error } = await db
      .from('participant_profiles')
      .upsert({ participant_id: owner.id, ...fields, updated_by: getActor(req).name, updated_at: new Date().toISOString() }, { onConflict: 'participant_id' })
      .select('*')
      .single()
    checkProfile(error)

    // The журнал gets the names of the changed fields, never the values: passports must not be copied into it.
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => (before?.[k] ?? null) !== (fields[k] ?? null)).map(k => FIELD_LABELS[k].toLowerCase())
    if (changed.length) {
      await logAudit(req, {
        table: 'participant_profiles',
        recordId: owner.id,
        action: before ? 'update' : 'create',
        summary: `Профиль участника «${owner.name}»: ${changed.join(', ')}`,
      })
    }
    return NextResponse.json({ data })
  } catch (e) {
    return profileError(e, 'save')
  }
}
