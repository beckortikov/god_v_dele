import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import type { SprintGroup } from '@/lib/sprints'
import { BadRequest, GROUPS, checkGroups, errorResponse, isMissingGroups, isUuid, requireUuid } from '../_lib/store'

export const dynamic = 'force-dynamic'

export interface GroupMember {
  id: string
  name: string
  group_id: string | null
}

export interface GroupsData {
  /** false until migration 018 is applied: the UI then works without groups. */
  available: boolean
  groups: SprintGroup[]
  /** Active participants of the program with their group. */
  participants: GroupMember[]
}

/** GET ?program_id=<uuid> → { data: GroupsData } */
export async function GET(req: Request) {
  const programId = new URL(req.url).searchParams.get('program_id')
  if (!isUuid(programId)) return NextResponse.json({ error: 'program_id: нужен UUID' }, { status: 400 })
  try {
    const { data: groups, error } = await db.from(GROUPS).select('id, program_id, name').eq('program_id', programId).order('created_at')
    if (isMissingGroups(error)) return NextResponse.json({ data: { available: false, groups: [], participants: [] } satisfies GroupsData })
    checkGroups(error)

    const { data: people, error: pErr } = await db
      .from('participants')
      .select('id, name, group_id')
      .eq('program_id', programId)
      .eq('status', 'active')
    checkGroups(pErr)
    const participants = ((people ?? []) as GroupMember[]).sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    const data: GroupsData = {
      available: true,
      groups: (groups ?? []).map(g => ({ ...g, members: participants.filter(p => p.group_id === g.id).length })),
      participants,
    }
    return NextResponse.json({ data })
  } catch (e) {
    return errorResponse(e, 'groups')
  }
}

/** POST { program_id, name } → creates an empty group. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const programId = requireUuid(body.program_id, 'program_id')
    const name = String(body.name ?? '').trim()
    if (!name) throw new BadRequest('Назовите группу')
    if (name.length > 60) throw new BadRequest('Название группы длиннее 60 символов')

    const { data, error } = await db.from(GROUPS).insert({ program_id: programId, name }).select('id, program_id, name').single()
    if (error?.code === '23505') throw new BadRequest(`Группа «${name}» уже есть в этом потоке`)
    if (error?.code === '23503') throw new BadRequest('Поток не найден')
    checkGroups(error)
    if (!data) throw new Error('Группа не создана')

    await logAudit(req, { table: GROUPS, recordId: data.id, action: 'create', summary: `Группа «${name}»`, after: data })
    return NextResponse.json({ data: { ...data, members: 0 } satisfies SprintGroup }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'create group')
  }
}
