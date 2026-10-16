import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { getActor, logAudit } from '@/lib/audit'
import { parseYear } from '@/lib/participant-profile'
import { ProfileBadRequest, checkProfile, profileError, profileOwner } from '../_lib'

export const dynamic = 'force-dynamic'

/** PUT ?participant_id=<uuid> { year, turnover?, net_profit?, notes? } → adds the year or replaces it. */
export async function PUT(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    const y = parseYear(await req.json())
    const { data, error } = await supabaseAdmin
      .from('participant_business_years')
      .upsert({ participant_id: owner.id, ...y, updated_by: getActor(req).name, updated_at: new Date().toISOString() }, { onConflict: 'participant_id,year' })
      .select('*')
      .single()
    checkProfile(error)
    await logAudit(req, { table: 'participant_business_years', recordId: data.id, action: 'update', summary: `Бизнес участника «${owner.name}» за ${y.year} год: оборот и прибыль` })
    return NextResponse.json({ data })
  } catch (e) {
    return profileError(e, 'save year')
  }
}

/** DELETE ?participant_id=<uuid>&year=2024 */
export async function DELETE(req: Request) {
  try {
    const owner = await profileOwner(req)
    if (owner instanceof NextResponse) return owner
    const raw = new URL(req.url).searchParams.get('year')
    const year = raw === null || !raw.trim() ? NaN : Number(raw)
    if (!Number.isInteger(year)) throw new ProfileBadRequest('Укажите год')
    const { error } = await supabaseAdmin.from('participant_business_years').delete().eq('participant_id', owner.id).eq('year', year)
    checkProfile(error)
    await logAudit(req, { table: 'participant_business_years', recordId: owner.id, action: 'delete', summary: `Бизнес участника «${owner.name}» за ${year} год удалён из динамики` })
    return NextResponse.json({ data: { year } })
  } catch (e) {
    return profileError(e, 'delete year')
  }
}
