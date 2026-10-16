/**
 * Checks that need the request body or a database row, so they cannot run in
 * proxy.ts (which sees only the path and query). The proxy has already made
 * sure there is a valid session and that the role may use the route; these
 * helpers pin the request to the caller's own data.
 */
import { NextResponse } from 'next/server'
import { getSession, ownIds, type Session } from '@/lib/session'

export function sessionOf(req: Request): Session | null {
  try {
    return getSession(req)
  } catch {
    return null
  }
}

export function forbidden(message = 'Доступны только ваши данные') {
  return NextResponse.json({ error: message }, { status: 403 })
}

/**
 * Tables keyed by person (wheels): the person is a participant, an employee or
 * a plain user. admin and wheels_manager may touch anyone's entries.
 */
export function mayUsePerson(req: Request, personId: unknown): boolean {
  const s = sessionOf(req)
  if (!s) return false
  if (s.role === 'admin' || s.role === 'wheels_manager') return true
  return typeof personId === 'string' && ownIds(s).includes(personId)
}

/** Employee data (tasks, leave, time logs): admin and manager see the team, an employee only themselves. */
export function mayUseEmployee(req: Request, employeeId: unknown): boolean {
  const s = sessionOf(req)
  if (!s) return false
  if (s.role === 'admin' || s.role === 'manager') return true
  return typeof employeeId === 'string' && !!s.eid && employeeId === s.eid
}

/** Roles that run sprints: they review work and see everybody's. */
export const SPRINT_CURATORS = ['admin', 'wheels_manager', 'manager'] as const
export const isSprintCurator = (s: Session | null) => !!s && (SPRINT_CURATORS as readonly string[]).includes(s.role)

/**
 * Profile of a participant (personal data, passport, business): the participant themselves,
 * and the roles that work with participants. Not finance, not employees: it holds passports.
 */
export function mayUseProfile(req: Request, participantId: unknown): boolean {
  const s = sessionOf(req)
  if (!s) return false
  if (s.role === 'admin' || s.role === 'wheels_manager') return true
  return s.role === 'participant' && typeof participantId === 'string' && !!s.pid && s.pid === participantId
}
