import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { forbidden, sessionOf } from '@/lib/api-auth'
import { PASSPORT_BUCKET, completeness, type ParticipantProfile } from '@/lib/participant-profile'
import { checkProfile, ensureDocsBucket, profileError } from '../_lib'

export const dynamic = 'force-dynamic'

export interface ProfileSummaryRow {
  done: number
  total: number
}

/**
 * GET → { data: { [participant_id]: { done, total } } }: how complete each participant's profile is,
 * for the «Профиль» column of the participants list. Only admin and wheels_manager; it names no values.
 * Participants with nothing filled in are absent (the list shows them as empty).
 */
export async function GET(req: Request) {
  try {
    const role = sessionOf(req)?.role
    if (role !== 'admin' && role !== 'wheels_manager') return forbidden()

    const [{ data: profiles, error: pErr }, { data: years, error: yErr }] = await Promise.all([
      supabaseAdmin.from('participant_profiles').select('participant_id, birth_date, city, address, passport_number, activity'),
      supabaseAdmin.from('participant_business_years').select('participant_id'),
    ])
    checkProfile(pErr)
    checkProfile(yErr)

    // A folder per participant exists in Storage only while they have a scan in it.
    const withScans = new Set<string>()
    try {
      await ensureDocsBucket()
      const { data } = await supabaseAdmin.storage.from(PASSPORT_BUCKET).list('', { limit: 1000 })
      for (const f of data ?? []) withScans.add(f.name)
    } catch {
      // Storage unreachable: the scan part counts as missing
    }

    const yearCount = new Map<string, number>()
    for (const y of years ?? []) yearCount.set(y.participant_id, (yearCount.get(y.participant_id) ?? 0) + 1)
    const profileOf = new Map((profiles ?? []).map(p => [p.participant_id as string, p as Partial<ParticipantProfile>]))

    const data: Record<string, ProfileSummaryRow> = {}
    for (const id of new Set([...profileOf.keys(), ...yearCount.keys(), ...withScans])) {
      const c = completeness(profileOf.get(id) ?? null, yearCount.get(id) ?? 0, withScans.has(id) ? 1 : 0)
      if (c.done > 0) data[id] = { done: c.done, total: c.total }
    }
    return NextResponse.json({ data })
  } catch (e) {
    return profileError(e, 'summary')
  }
}
