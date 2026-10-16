import { describe, expect, it } from 'vitest'
import { authorize, isPublic } from '@/lib/auth-policy'
import type { Role } from '@/lib/session'

const P = 'participant-1'
const E = 'employee-1'
const who = (role: Role) => ({ uid: `user-${role}`, role, eid: role === 'employee' || role === 'manager' ? E : null, pid: role === 'participant' ? P : null })
const check = (role: Role | null, method: string, url: string) => {
  const u = new URL(url, 'http://x')
  return authorize(role ? who(role) : null, method, u.pathname, u.searchParams)
}
const allowed = (role: Role | null, method: string, url: string) => check(role, method, url).ok

describe('authentication', () => {
  it('lets only the login, logout and Telegram webhook through without a session', () => {
    for (const p of ['/api/auth/login', '/api/auth/logout', '/api/telegram/webhook']) {
      expect(isPublic(p)).toBe(true)
      expect(allowed(null, 'POST', p)).toBe(true)
    }
    expect(isPublic('/api/auth/loginx')).toBe(false)
  })

  it('answers 401 to everything else without a session', () => {
    for (const url of ['/api/admin/users', '/api/participants', '/api/expenses', '/api/life-wheel?participant_id=x', '/api/sprints', '/api/anything-new']) {
      const d = check(null, 'GET', url)
      expect(d).toMatchObject({ ok: false, status: 401 })
    }
  })

  it('answers 403 (not 401) to a logged-in user without rights', () => {
    expect(check('participant', 'GET', '/api/admin/users')).toMatchObject({ ok: false, status: 403 })
  })
})

describe('admin', () => {
  it('may call everything, including routes nobody listed', () => {
    for (const url of ['/api/admin/users', '/api/audit', '/api/expenses', '/api/sprints', '/api/brand-new-route', '/api/hr/payroll']) {
      expect(allowed('admin', 'POST', url)).toBe(true)
    }
  })
})

describe('closed by default', () => {
  it('a route that is not listed is admin-only', () => {
    for (const role of ['finance', 'employee', 'manager', 'wheels_manager', 'participant'] as Role[]) {
      expect(allowed(role, 'GET', '/api/brand-new-route')).toBe(false)
    }
  })

  it('a prefix does not match a longer word (/api/accountsXYZ is not /api/accounts)', () => {
    expect(allowed('finance', 'GET', '/api/accountsXYZ')).toBe(false)
  })
})

describe('admin-only areas', () => {
  const urls = ['/api/admin/users', '/api/admin/users/abc', '/api/audit', '/api/audit/restore', '/api/telegram/setup', '/api/hr/payroll', '/api/hr/schedule', '/api/hr/timesheet']
  it.each(['finance', 'employee', 'manager', 'wheels_manager', 'participant'] as Role[])('%s cannot reach them', role => {
    for (const url of urls) {
      expect(allowed(role, 'GET', url)).toBe(false)
      expect(allowed(role, 'POST', url)).toBe(false)
    }
  })
})

describe('finance', () => {
  it('works with money and participants', () => {
    for (const url of ['/api/expenses', '/api/accounts', '/api/dashboard', '/api/payments/ledger', '/api/offline-events/abc/attendees', '/api/programs', '/api/participants', '/api/hr/employees']) {
      expect(allowed('finance', 'GET', url)).toBe(true)
    }
    expect(allowed('finance', 'POST', '/api/expenses')).toBe(true)
  })
  it('cannot manage users, audit or sprints, and cannot write employees', () => {
    expect(allowed('finance', 'GET', '/api/admin/users')).toBe(false)
    expect(allowed('finance', 'GET', '/api/sprints')).toBe(false)
    expect(allowed('finance', 'POST', '/api/hr/employees')).toBe(false)
  })
})

describe('wheels_manager', () => {
  it('keeps what the participants page needs', () => {
    expect(allowed('wheels_manager', 'GET', '/api/participants')).toBe(true)
    expect(allowed('wheels_manager', 'POST', '/api/participants')).toBe(true)
    expect(allowed('wheels_manager', 'GET', '/api/monthly-payments')).toBe(true)
    expect(allowed('wheels_manager', 'GET', '/api/payments/schedule')).toBe(true)
    expect(allowed('wheels_manager', 'GET', '/api/accounts')).toBe(true)
    expect(allowed('wheels_manager', 'GET', '/api/programs')).toBe(true)
  })
  it('curates sprints and sees every wheel', () => {
    expect(allowed('wheels_manager', 'POST', '/api/sprints/tasks')).toBe(true)
    expect(allowed('wheels_manager', 'PUT', '/api/sprints/groups/assign')).toBe(true)
    expect(allowed('participant', 'GET', '/api/sprints/groups?program_id=x')).toBe(false)
    expect(allowed('finance', 'POST', '/api/sprints/groups')).toBe(false)
    expect(allowed('wheels_manager', 'GET', '/api/life-wheel?participant_id=someone-else')).toBe(true)
    expect(allowed('wheels_manager', 'GET', '/api/life-wheel')).toBe(true)
  })
  it('has no access to company money', () => {
    for (const url of ['/api/expenses', '/api/dashboard', '/api/payments/ledger', '/api/account-transfers']) {
      expect(allowed('wheels_manager', 'GET', url)).toBe(false)
    }
    expect(allowed('wheels_manager', 'POST', '/api/accounts')).toBe(false)
  })
})

describe('manager and employee', () => {
  it('manager curates sprints and lists employees', () => {
    expect(allowed('manager', 'GET', '/api/sprints')).toBe(true)
    expect(allowed('manager', 'POST', '/api/sprints/tasks')).toBe(true)
    expect(allowed('manager', 'GET', '/api/hr/employees')).toBe(true)
    expect(allowed('manager', 'GET', '/api/programs')).toBe(true)
    expect(allowed('manager', 'GET', '/api/expenses')).toBe(false)
  })
  it('employee has no sprints, no money, no employee list', () => {
    for (const url of ['/api/sprints', '/api/expenses', '/api/hr/employees', '/api/monthly-payments']) {
      expect(allowed('employee', 'GET', url)).toBe(false)
    }
  })
  it('an employee reads only their own tasks and leave; a manager sees the team', () => {
    expect(allowed('employee', 'GET', `/api/employee/tasks?assignee_id=${E}`)).toBe(true)
    expect(allowed('employee', 'GET', '/api/employee/tasks?assignee_id=someone-else')).toBe(false)
    expect(allowed('employee', 'GET', '/api/employee/tasks')).toBe(false)
    expect(allowed('employee', 'GET', `/api/employee/leave-requests?employee_id=${E}`)).toBe(true)
    expect(allowed('employee', 'GET', '/api/employee/time-logs?employee_id=other')).toBe(false)
    expect(allowed('manager', 'GET', '/api/employee/tasks?assignee_id=someone-else')).toBe(true)
    expect(allowed('manager', 'GET', '/api/employee/tasks')).toBe(true)
  })
  it('an employee cannot name another person in a write either', () => {
    expect(allowed('employee', 'DELETE', '/api/employee/tasks?id=1&assignee_id=other')).toBe(false)
    expect(allowed('employee', 'POST', '/api/employee/tasks')).toBe(true)
  })
})

describe('participant', () => {
  it('reads only their own sprint, payments and profile', () => {
    expect(allowed('participant', 'GET', `/api/my-sprint?participant_id=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/my-sprint?participant_id=other')).toBe(false)
    expect(allowed('participant', 'GET', '/api/my-sprint')).toBe(false)
    expect(allowed('participant', 'GET', `/api/monthly-payments?participant_id=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/monthly-payments')).toBe(false)
    expect(allowed('participant', 'GET', '/api/monthly-payments?participant_id=other')).toBe(false)
    expect(allowed('participant', 'GET', `/api/payments/transactions?participant_id=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', `/api/participants?id=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/participants')).toBe(false)
    expect(allowed('participant', 'GET', '/api/participants?id=other')).toBe(false)
  })
  it('cannot write money or participants', () => {
    for (const url of ['/api/monthly-payments', '/api/payments/transactions', '/api/participants', '/api/payments/schedule']) {
      expect(allowed('participant', 'POST', url)).toBe(false)
      expect(allowed('participant', 'DELETE', url)).toBe(false)
    }
  })
  it('cannot see company data', () => {
    for (const url of ['/api/expenses', '/api/dashboard', '/api/accounts', '/api/programs', '/api/search?q=ab&role=participant', '/api/hr/employees', '/api/sprints', '/api/payments/ledger']) {
      expect(allowed('participant', 'GET', url)).toBe(false)
    }
  })
  it('submits their own sprint work and links their own Telegram', () => {
    expect(allowed('participant', 'POST', '/api/sprints/assignments/abc')).toBe(true)
    expect(allowed('participant', 'GET', '/api/sprints/assignments/abc')).toBe(true)
    expect(allowed('participant', 'POST', '/api/sprints/tasks')).toBe(false)
    expect(allowed('participant', 'POST', '/api/sprints')).toBe(false)
    expect(allowed('participant', 'GET', `/api/telegram/links?subject_type=participant&subject_id=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/telegram/links?subject_type=participant&subject_id=other')).toBe(false)
    expect(allowed('participant', 'GET', '/api/telegram/links?subject_type=participant')).toBe(false)
    expect(allowed('participant', 'DELETE', `/api/telegram/links?subject_id=${P}`)).toBe(true)
    expect(allowed('participant', 'POST', '/api/telegram/link-code')).toBe(true)
  })
})

describe('wheels are personal', () => {
  it('a participant or employee reads only their own entries', () => {
    expect(allowed('participant', 'GET', `/api/life-wheel?participant_id=${P}&period_type=monthly`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/life-wheel?participant_id=other')).toBe(false)
    expect(allowed('participant', 'GET', '/api/life-balance')).toBe(false)
    expect(allowed('participant', 'GET', '/api/business-wheel?participant_id=other&year=2026')).toBe(false)
    expect(allowed('employee', 'GET', `/api/life-wheel?participant_id=${E}`)).toBe(true)
    expect(allowed('employee', 'GET', `/api/life-wheel?participant_id=user-employee`)).toBe(true)
    expect(allowed('employee', 'GET', '/api/life-wheel?participant_id=other')).toBe(false)
  })
  it('everyone reads the shared wheel template, but only admin and wheels_manager may change it', () => {
    const T = '00000000-0000-0000-0000-000000000000'
    for (const role of ['participant', 'employee', 'manager', 'finance'] as Role[]) {
      expect(allowed(role, 'GET', `/api/life-wheel?participant_id=${T}&period_type=monthly&period_label=template`)).toBe(true)
      expect(allowed(role, 'POST', `/api/life-wheel?participant_id=${T}`)).toBe(false)
    }
    expect(allowed('wheels_manager', 'POST', `/api/life-wheel?participant_id=${T}`)).toBe(true)
  })
  it('a write naming someone else in the query is refused; body checks are done in the route', () => {
    expect(allowed('participant', 'POST', '/api/life-wheel?participant_id=other')).toBe(false)
    expect(allowed('participant', 'POST', '/api/life-wheel')).toBe(true)
    expect(allowed('participant', 'DELETE', '/api/life-wheel')).toBe(true)
  })
})

describe('notifications and search are built for the caller', () => {
  it('the role in the query must be the caller’s own', () => {
    expect(allowed('participant', 'GET', `/api/notifications?role=participant&participantId=${P}`)).toBe(true)
    expect(allowed('participant', 'GET', '/api/notifications?role=admin')).toBe(false)
    expect(allowed('participant', 'GET', '/api/notifications?role=participant&participantId=other')).toBe(false)
    expect(allowed('manager', 'GET', `/api/notifications?role=manager&employeeId=${E}`)).toBe(true)
    expect(allowed('manager', 'GET', '/api/notifications?role=manager&employeeId=other')).toBe(false)
    expect(allowed('finance', 'GET', '/api/search?q=ab&role=finance')).toBe(true)
    expect(allowed('finance', 'GET', '/api/search?q=ab&role=admin')).toBe(false)
  })
})
