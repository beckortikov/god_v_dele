import { describe, expect, it } from 'vitest'
import {
  PAGES,
  ROLE_LABELS,
  findSection,
  getAllowedPages,
  getDefaultPage,
  getSections,
  type PageType,
  type UserRole,
} from '@/lib/navigation'

const ROLES: UserRole[] = ['admin', 'finance', 'employee', 'manager', 'wheels_manager', 'participant']

const EXPECTED_SECTIONS: Record<UserRole, string[]> = {
  admin: ['home', 'people', 'finance', 'reports', 'wheels', 'hr', 'admin'],
  finance: ['home', 'people', 'finance', 'reports', 'wheels'],
  wheels_manager: ['wheels', 'people'],
  manager: ['cabinet', 'wheels'],
  employee: ['cabinet', 'wheels'],
  participant: ['cabinet', 'wheels'],
}

const ADMIN_ONLY: PageType[] = ['users', 'audit']
const FINANCE_PAGES: PageType[] = ['dashboard', 'income', 'plan-fact', 'balance', 'offline', 'opiu-reports', 'analytics', 'programs']
const WHEELS: PageType[] = ['life-wheel', 'life-balance', 'business-wheel']

describe('getSections', () => {
  it.each(ROLES)('%s gets the expected sections in order', role => {
    expect(getSections(role).map(s => s.id)).toEqual(EXPECTED_SECTIONS[role])
  })

  it('every section has a label, an icon and at least one page', () => {
    for (const role of ROLES) {
      for (const s of getSections(role)) {
        expect(s.label).toBeTruthy()
        expect(s.icon).toBeTruthy()
        expect(s.pages.length).toBeGreaterThan(0)
      }
    }
  })

  it('wheels_manager sees participants but not programs', () => {
    const people = getSections('wheels_manager').find(s => s.id === 'people')
    expect(people?.pages).toEqual(['participants'])
  })

  it('cabinet section depends on the role', () => {
    const cabinet = (r: UserRole) => getSections(r).find(s => s.id === 'cabinet')?.pages
    expect(cabinet('manager')).toEqual(['employee-dashboard', 'manager-dashboard'])
    expect(cabinet('employee')).toEqual(['employee-dashboard'])
    expect(cabinet('participant')).toEqual(['my-payments'])
  })
})

describe('getAllowedPages', () => {
  it.each(ROLES)('%s has no duplicate pages and only known pages', role => {
    const pages = getAllowedPages(role)
    expect(new Set(pages).size).toBe(pages.length)
    for (const p of pages) expect(PAGES[p]).toBeDefined()
  })

  it.each(ROLES)('%s can open the wheels', role => {
    expect(getAllowedPages(role)).toEqual(expect.arrayContaining(WHEELS))
  })

  it('admin can reach every page except the personal cabinets', () => {
    const adminPages = new Set(getAllowedPages('admin'))
    const cabinetPages: PageType[] = ['employee-dashboard', 'manager-dashboard', 'my-payments']
    for (const id of Object.keys(PAGES) as PageType[]) {
      expect(adminPages.has(id)).toBe(!cabinetPages.includes(id))
    }
  })

  it('every page is reachable by at least one role', () => {
    const all = new Set(ROLES.flatMap(getAllowedPages))
    for (const id of Object.keys(PAGES)) expect(all.has(id as PageType)).toBe(true)
  })

  it.each(ROLES.filter(r => r !== 'admin'))('admin-only pages are hidden from %s', role => {
    const pages = getAllowedPages(role)
    for (const p of ADMIN_ONLY) expect(pages).not.toContain(p)
  })

  it.each(ROLES.filter(r => r !== 'admin'))('HR pages are hidden from %s', role => {
    const pages = getAllowedPages(role)
    for (const p of ['hr-dashboard', 'employees', 'schedule', 'timesheet', 'payroll', 'vacations'] as PageType[]) {
      expect(pages).not.toContain(p)
    }
  })

  it('finance sees all finance pages', () => {
    expect(getAllowedPages('finance')).toEqual(expect.arrayContaining(FINANCE_PAGES))
  })

  it.each(['employee', 'manager', 'participant', 'wheels_manager'] as UserRole[])(
    'money pages are hidden from %s',
    role => {
      const pages = getAllowedPages(role)
      for (const p of FINANCE_PAGES) expect(pages).not.toContain(p)
    },
  )

  it('only participants see «Мои оплаты»', () => {
    for (const role of ROLES) {
      expect(getAllowedPages(role).includes('my-payments')).toBe(role === 'participant')
    }
  })
})

describe('getDefaultPage', () => {
  it.each(ROLES)('default page for %s is one of its allowed pages', role => {
    expect(getAllowedPages(role)).toContain(getDefaultPage(role))
  })

  it('returns the expected landing pages', () => {
    expect(getDefaultPage('admin')).toBe('dashboard')
    expect(getDefaultPage('finance')).toBe('dashboard')
    expect(getDefaultPage('manager')).toBe('manager-dashboard')
    expect(getDefaultPage('employee')).toBe('life-wheel')
    expect(getDefaultPage('participant')).toBe('life-wheel')
    expect(getDefaultPage('wheels_manager')).toBe('life-wheel')
  })
})

describe('findSection / metadata', () => {
  it('finds the section that holds a page', () => {
    const sections = getSections('admin')
    expect(findSection(sections, 'payroll')?.id).toBe('hr')
    expect(findSection(sections, 'audit')?.id).toBe('admin')
    expect(findSection(getSections('employee'), 'payroll')).toBeUndefined()
  })

  it('every page has consistent metadata', () => {
    for (const [id, page] of Object.entries(PAGES)) {
      expect(page.id).toBe(id)
      expect(page.label).toBeTruthy()
      expect(page.title).toBeTruthy()
      expect(page.icon).toBeTruthy()
    }
  })

  it('every role has a Russian label', () => {
    for (const role of ROLES) expect(ROLE_LABELS[role]).toMatch(/[А-Яа-яЁё]/)
  })
})
