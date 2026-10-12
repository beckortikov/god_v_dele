/**
 * Who may call which /api route. Pure (no I/O), so it is covered by tests; the
 * proxy (proxy.ts) applies it to every request.
 *
 * - Everything under /api needs a valid session, except PUBLIC_PATHS.
 * - admin may call everything.
 * - Other roles may call a route only if it is listed for them, for reading
 *   (GET/HEAD/OPTIONS) and/or writing. A route nobody listed is admin-only, so
 *   a forgotten new route is closed, not open.
 * - Some rules also pin the request to the caller's own data (their participant
 *   id, employee id or role). Checks that need the request body (for example
 *   «this assignment belongs to me») live in the route itself.
 */
import { ownIds, type Role, type Session } from './session'

export type Decision = { ok: true } | { ok: false; status: 401 | 403; error: string }

type Principal = Pick<Session, 'uid' | 'role' | 'eid' | 'pid'>

/** Reachable without a session. The Telegram webhook checks its own secret header. */
export const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/logout', '/api/telegram/webhook']

/** Shared «базовый шаблон» of the wheels (same id as TEMPLATE_ID in components/wheels/shared.ts): everyone reads it to start from, only admin and wheels_manager change it. */
export const WHEEL_TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

type Scope =
  /** A participant may only ask about themselves: ?<param>=<own participant id>. */
  | { kind: 'self-participant'; param: string }
  /** Everyone except admin and wheels_manager sees only their own wheels (participant, employee or user id). */
  | { kind: 'wheels' }
  /** An employee sees only their own tasks and leave. */
  | { kind: 'employee'; params: string[] }
  /** The digest and the search are built for ?role=<the caller's role>. */
  | { kind: 'own-role' }

interface Rule {
  prefix: string
  /** Roles (besides admin) for GET / HEAD / OPTIONS. */
  read: Role[]
  /** Roles (besides admin) for everything else. */
  write: Role[]
  scope?: Scope
}

const ALL: Role[] = ['admin', 'finance', 'employee', 'manager', 'wheels_manager', 'participant']
const NONE: Role[] = []
const adminOnly = (prefix: string): Rule => ({ prefix, read: NONE, write: NONE })
const financeOnly = (prefix: string): Rule => ({ prefix, read: ['finance'], write: ['finance'] })
const wheel = (prefix: string): Rule => ({ prefix, read: ALL, write: ALL, scope: { kind: 'wheels' } })

const RULES: Rule[] = [
  adminOnly('/api/admin'),
  adminOnly('/api/audit'),
  adminOnly('/api/telegram/setup'),
  adminOnly('/api/hr/payroll'),
  adminOnly('/api/hr/schedule'),
  adminOnly('/api/hr/timesheet'),
  // Employees are listed to pick a salary payee (finance) or an assignee (manager)
  { prefix: '/api/hr/employees', read: ['finance', 'manager'], write: NONE },

  // Sprints. The assignment route also serves the participant; ownership is checked inside it.
  { prefix: '/api/sprints/assignments', read: ['wheels_manager', 'manager', 'participant'], write: ['wheels_manager', 'manager', 'participant'] },
  { prefix: '/api/sprints', read: ['wheels_manager', 'manager'], write: ['wheels_manager', 'manager'] },
  { prefix: '/api/my-sprint', read: ['participant'], write: NONE, scope: { kind: 'self-participant', param: 'participant_id' } },

  { prefix: '/api/programs', read: ['finance', 'wheels_manager', 'manager'], write: ['finance'] },
  {
    prefix: '/api/participants',
    read: ['finance', 'wheels_manager', 'manager', 'employee', 'participant'],
    write: ['finance', 'wheels_manager'],
    scope: { kind: 'self-participant', param: 'id' },
  },

  // Money. wheels_manager keeps what the participants page needs; a participant reads only their own.
  { prefix: '/api/payments/ledger', read: ['finance'], write: ['finance'] },
  { prefix: '/api/payments/schedule', read: ['finance', 'wheels_manager'], write: ['finance', 'wheels_manager'] },
  {
    prefix: '/api/payments',
    read: ['finance', 'wheels_manager', 'participant'],
    write: ['finance', 'wheels_manager'],
    scope: { kind: 'self-participant', param: 'participant_id' },
  },
  {
    prefix: '/api/monthly-payments',
    read: ['finance', 'wheels_manager', 'participant'],
    write: ['finance', 'wheels_manager'],
    scope: { kind: 'self-participant', param: 'participant_id' },
  },
  { prefix: '/api/accounts', read: ['finance', 'wheels_manager'], write: ['finance'] },
  financeOnly('/api/account-transfers'),
  financeOnly('/api/dashboard'),
  financeOnly('/api/expenses'),
  financeOnly('/api/forecasts'),
  financeOnly('/api/opiu-reports'),
  financeOnly('/api/analytics'),
  financeOnly('/api/exchange-rate'),
  financeOnly('/api/offline-events'),

  { prefix: '/api/search', read: ['finance', 'wheels_manager'], write: NONE, scope: { kind: 'own-role' } },
  { prefix: '/api/notifications', read: ALL, write: NONE, scope: { kind: 'own-role' } },

  { prefix: '/api/telegram/links', read: ['finance', 'wheels_manager', 'participant'], write: ['finance', 'wheels_manager', 'participant'], scope: { kind: 'self-participant', param: 'subject_id' } },
  { prefix: '/api/telegram/link-code', read: NONE, write: ['finance', 'wheels_manager', 'participant'] },

  wheel('/api/life-wheel'),
  wheel('/api/life-balance'),
  wheel('/api/business-wheel'),

  { prefix: '/api/employee', read: ['employee', 'manager'], write: ['employee', 'manager'], scope: { kind: 'employee', params: ['employee_id', 'assignee_id'] } },
]

// Most specific rule first
const SORTED = [...RULES].sort((a, b) => b.prefix.length - a.prefix.length)

const deny = (status: 401 | 403, error: string): Decision => ({ ok: false, status, error })
const allow: Decision = { ok: true }

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => matches(pathname, p))
}

export function isReadMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function checkScope(scope: Scope, p: Principal, read: boolean, query: URLSearchParams): Decision {
  switch (scope.kind) {
    case 'self-participant': {
      if (p.role !== 'participant') return allow
      const value = query.get(scope.param)
      if (!p.pid || value !== p.pid) return deny(403, 'Доступны только ваши данные')
      return allow
    }
    case 'wheels': {
      if (p.role === 'wheels_manager') return allow
      const value = query.get('participant_id')
      if (read && value === WHEEL_TEMPLATE_ID) return allow
      if (value === null) {
        // Reading without naming a person would return everybody's wheels
        return read ? deny(403, 'Доступны только ваши данные') : allow
      }
      return ownIds(p).includes(value) ? allow : deny(403, 'Доступны только ваши данные')
    }
    case 'employee': {
      if (p.role !== 'employee') return allow
      const given = scope.params.map(name => query.get(name)).filter((v): v is string => v !== null)
      if (read && given.length === 0) return deny(403, 'Доступны только ваши данные')
      return given.every(v => !!p.eid && v === p.eid) ? allow : deny(403, 'Доступны только ваши данные')
    }
    case 'own-role': {
      const role = query.get('role')
      if (role !== null && role !== p.role) return deny(403, 'Роль в запросе не совпадает с вашей')
      const pid = query.get('participantId')
      if (p.role !== 'admin' && pid && pid !== p.pid) return deny(403, 'Доступны только ваши данные')
      const eid = query.get('employeeId')
      if (p.role !== 'admin' && eid && eid !== p.eid) return deny(403, 'Доступны только ваши данные')
      return allow
    }
  }
}

/** Decides whether this caller may make this request. `principal` is null when there is no valid session. */
export function authorize(principal: Principal | null, method: string, pathname: string, query: URLSearchParams): Decision {
  if (isPublic(pathname)) return allow
  if (!principal) return deny(401, 'Нужно войти')
  if (principal.role === 'admin') return allow

  const rule = SORTED.find(r => matches(pathname, r.prefix))
  if (!rule) return deny(403, 'Недостаточно прав')

  const read = isReadMethod(method)
  const roles = read ? rule.read : rule.write
  if (!roles.includes(principal.role)) return deny(403, 'Недостаточно прав')
  return rule.scope ? checkScope(rule.scope, principal, read, query) : allow
}

/** Does the role's list cover this route and method, ignoring the «own data» scope? For tooling and tests. */
export function roleAllows(role: Role, method: string, pathname: string): boolean {
  if (isPublic(pathname)) return true
  if (role === 'admin') return true
  const rule = SORTED.find(r => matches(pathname, r.prefix))
  if (!rule) return false
  return (isReadMethod(method) ? rule.read : rule.write).includes(role)
}
