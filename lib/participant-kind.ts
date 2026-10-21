/**
 * What kind of person a participant record is, for the participants list:
 * a member of a group (program), a guest (the «Гостевой» program) or archived.
 * It is a view over the two fields that already exist (program and status), so nothing new is stored.
 */

export type ParticipantKind = 'member' | 'guest' | 'archived'

export const KIND_LABELS: Record<ParticipantKind, string> = { member: 'Участник', guest: 'Гость', archived: 'Архив' }

interface ProgramLike {
  id: string
  name?: string | null
}

interface KindInput {
  status?: string | null
  program?: { name?: string | null } | null
}

export const isGuestProgram = (program?: { name?: string | null } | null) => /гост/i.test(program?.name ?? '')

export function kindOf(p: KindInput): ParticipantKind {
  if (p.status === 'archived') return 'archived'
  return isGuestProgram(p.program) ? 'guest' : 'member'
}

export const findGuestProgram = <T extends ProgramLike>(programs: T[]): T | undefined => programs.find(isGuestProgram)

/** Groups a participant can belong to: every program except the guest one. */
export const memberPrograms = <T extends ProgramLike>(programs: T[]): T[] => programs.filter(p => !isGuestProgram(p))

export type KindTarget = { kind: 'member'; programId: string } | { kind: 'guest' } | { kind: 'archived' }

/**
 * The fields to change to make a participant a member of a group, a guest, or archived.
 * Archiving keeps the program (so it is known which group they left); returning from the archive makes them active.
 * Returns null when there is no guest program to put a guest into.
 */
export function kindPatch(target: KindTarget, programs: ProgramLike[]): { program_id?: string; status: 'active' | 'archived' } | null {
  if (target.kind === 'archived') return { status: 'archived' }
  if (target.kind === 'member') return { program_id: target.programId, status: 'active' }
  const guest = findGuestProgram(programs)
  return guest ? { program_id: guest.id, status: 'active' } : null
}

export function countByKind(list: KindInput[]): Record<ParticipantKind, number> {
  const out: Record<ParticipantKind, number> = { member: 0, guest: 0, archived: 0 }
  for (const p of list) out[kindOf(p)]++
  return out
}
