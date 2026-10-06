import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

/**
 * GET /api/notifications?role=&userId=&employeeId=&participantId=
 * Read-only digest for the top-bar bell. Every item has a stable `key` so the
 * client can remember what was read; a key changes when the underlying
 * situation changes (e.g. another debtor appears), so the item resurfaces.
 */

export type NotificationPriority = 'high' | 'normal' | 'low'
export type NotificationKind =
  | 'overdue-payments'
  | 'my-debt'
  | 'leave-requests'
  | 'long-timer'
  | 'birthday'
  | 'event'
  | 'payroll'
  | 'overdue-tasks'

export interface NotificationDetail {
  key: string
  label: string
  value?: string
  page?: string
  action?: string
  payload?: Record<string, unknown>
}

export interface AppNotification {
  key: string
  kind: NotificationKind
  priority: NotificationPriority
  title: string
  subtitle: string
  /** Short time label, e.g. «2 ч назад», «через 3 дня», «с сентября». */
  time: string
  page: string | null
  action?: string
  payload?: Record<string, unknown>
  details?: NotificationDetail[]
}

const TIMER_LIMIT_HOURS = 16
const SOON_DAYS = 7
const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

// ---------- helpers ----------

function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
function money(v: number, currency = 'USD') {
  const body = nf.format(Math.round(v))
  if (currency === 'USD') return `$${body}`
  return `${body} ${currency}`
}

function localISO(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Whole days from today to the given date (negative for the past). */
function daysFrom(today: Date, iso: string) {
  const d = startOfDay(new Date(iso))
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function untilLabel(days: number) {
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`
}

function agoLabel(iso: string, now: Date) {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return mins <= 1 ? 'только что' : `${mins} мин назад`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days === 1) return 'вчера'
  return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`
}

function shortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** Small stable hash so a summary key changes when its set of records changes. */
function hash(parts: string[]) {
  let h = 5381
  for (const ch of [...parts].sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

// ---------- participant debt ----------

interface DebtRow {
  id: string
  name: string
  debt: number
  months: number
  since: { month: number; year: number } | null
}

/**
 * Debt per participant: months from the start month up to (not including) the
 * current month, capped at the program duration, where paid < plan.
 */
function computeDebts(participants: any[], payments: any[], now: Date): DebtRow[] {
  const byParticipant = new Map<string, any[]>()
  for (const p of payments) {
    const list = byParticipant.get(p.participant_id)
    if (list) list.push(p)
    else byParticipant.set(p.participant_id, [p])
  }
  const currentIdx = now.getFullYear() * 12 + now.getMonth()

  const rows: DebtRow[] = []
  for (const part of participants) {
    if (!part.start_date) continue
    const start = new Date(part.start_date)
    if (Number.isNaN(start.getTime())) continue
    const program = one<any>(part.program)
    const tariff = Number(part.tariff) || Number(program?.price_per_month) || 0
    const duration = Number(program?.duration_months) || 0
    const startIdx = start.getFullYear() * 12 + start.getMonth()
    const endIdx = duration > 0 ? Math.min(currentIdx, startIdx + duration) : currentIdx
    const own = byParticipant.get(part.id) ?? []

    let debt = 0
    let months = 0
    let since: DebtRow['since'] = null
    for (let idx = startIdx; idx < endIdx; idx++) {
      const year = Math.floor(idx / 12)
      const month = (idx % 12) + 1
      const pay = own.find(p => p.month_number === month && p.year === year)
      const plan = Number(pay?.plan_amount) || tariff
      const fact = Number(pay?.fact_amount) || 0
      if (plan > 0 && fact < plan - 0.01) {
        debt += plan - fact
        months++
        if (!since) since = { month, year }
      }
    }
    if (months > 0) rows.push({ id: part.id, name: part.name, debt, months, since })
  }
  return rows.sort((a, b) => b.debt - a.debt)
}

// ---------- sections ----------

async function overduePayments(now: Date): Promise<AppNotification[]> {
  const [{ data: participants, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from('participants')
      .select('id, name, start_date, tariff, status, program:programs(price_per_month, duration_months)')
      .not('status', 'in', '(archived,completed)'),
    supabaseAdmin.from('monthly_payments').select('participant_id, month_number, year, plan_amount, fact_amount'),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const debts = computeDebts(participants ?? [], payments ?? [], now)
  if (debts.length === 0) return []
  const total = debts.reduce((s, d) => s + d.debt, 0)
  const ym = `${now.getFullYear()}-${now.getMonth() + 1}`

  return [
    {
      key: `overdue:${ym}:${hash(debts.map(d => `${d.id}:${d.months}`))}`,
      kind: 'overdue-payments',
      priority: 'high',
      title: `${debts.length} ${plural(debts.length, ['участник', 'участника', 'участников'])} с просрочкой`,
      subtitle: `Общий долг ${money(total)}`,
      time: '',
      page: 'participants',
      details: debts.slice(0, 3).map(d => ({
        key: d.id,
        label: d.name,
        value: `${money(d.debt)} · ${d.months} мес.`,
        page: 'participants',
        action: 'open-participant',
        payload: { id: d.id },
      })),
    },
  ]
}

async function myDebt(participantId: string, now: Date): Promise<AppNotification[]> {
  const [{ data: participants, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from('participants')
      .select('id, name, start_date, tariff, status, program:programs(price_per_month, duration_months)')
      .eq('id', participantId),
    supabaseAdmin
      .from('monthly_payments')
      .select('participant_id, month_number, year, plan_amount, fact_amount')
      .eq('participant_id', participantId),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const active = (participants ?? []).filter((p: any) => p.status !== 'archived' && p.status !== 'completed')
  const [row] = computeDebts(active, payments ?? [], now)
  if (!row) return []
  return [
    {
      key: `my-debt:${row.months}:${Math.round(row.debt)}`,
      kind: 'my-debt',
      priority: 'normal',
      title: `К оплате ${money(row.debt)}`,
      subtitle: `${row.months} ${plural(row.months, ['месяц', 'месяца', 'месяцев'])} не оплачено полностью`,
      time: row.since ? `с ${MONTHS_GEN[row.since.month - 1]}` : '',
      page: 'my-payments',
    },
  ]
}

async function employeesById() {
  const { data, error } = await supabaseAdmin.from('employees').select('id, first_name, last_name, birth_date, status')
  if (error) throw error
  const map = new Map<string, any>()
  for (const e of data ?? []) map.set(e.id, e)
  return map
}

const nameOf = (e: any) => (e ? [e.first_name, e.last_name].filter(Boolean).join(' ') : 'Сотрудник')

async function pendingLeaves(page: string, employees: Map<string, any>, now: Date): Promise<AppNotification[]> {
  const { data, error } = await supabaseAdmin
    .from('leave_requests')
    .select('id, employee_id, start_date, end_date, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []
  const newest = rows[0]
  return [
    {
      key: `leave:${hash(rows.map(r => r.id))}`,
      kind: 'leave-requests',
      priority: 'normal',
      title:
        rows.length === 1
          ? `${nameOf(employees.get(newest.employee_id))} просит отгул`
          : `${rows.length} ${plural(rows.length, ['заявка', 'заявки', 'заявок'])} на отгул ждут решения`,
      subtitle:
        rows.length === 1
          ? `${shortDate(newest.start_date)} — ${shortDate(newest.end_date)}`
          : rows
              .slice(0, 3)
              .map(r => nameOf(employees.get(r.employee_id)).split(' ')[0])
              .join(', ') + (rows.length > 3 ? ' и другие' : ''),
      time: newest.created_at ? agoLabel(newest.created_at, now) : '',
      page,
    },
  ]
}

async function longTimers(
  page: string,
  employees: Map<string, any>,
  now: Date,
  onlyEmployeeId?: string
): Promise<AppNotification[]> {
  const cutoff = new Date(now.getTime() - TIMER_LIMIT_HOURS * 3600000).toISOString()
  let query = supabaseAdmin
    .from('time_logs')
    .select('id, employee_id, start_time')
    .eq('status', 'active')
    .lt('start_time', cutoff)
  if (onlyEmployeeId) query = query.eq('employee_id', onlyEmployeeId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(log => {
    const hours = Math.floor((now.getTime() - new Date(log.start_time).getTime()) / 3600000)
    const span = hours < 48 ? `${hours} ч` : `${Math.floor(hours / 24)} ${plural(Math.floor(hours / 24), ['день', 'дня', 'дней'])}`
    const own = onlyEmployeeId === log.employee_id
    return {
      key: `timer:${log.id}`,
      kind: 'long-timer' as const,
      priority: 'high' as const,
      title: own ? 'Таймер работы не остановлен' : `Таймер не остановлен: ${nameOf(employees.get(log.employee_id))}`,
      subtitle: own
        ? `Идёт уже ${span}. Остановите его, чтобы табель был точным`
        : `Идёт уже ${span}. Похоже, забыли завершить день`,
      time: `с ${shortDate(log.start_time)}`,
      page,
    }
  })
}

function birthdays(employees: Map<string, any>, today: Date, page: string | null): AppNotification[] {
  const out: (AppNotification & { days: number })[] = []
  for (const e of employees.values()) {
    if (!e.birth_date || e.status !== 'active') continue
    const b = new Date(e.birth_date)
    if (Number.isNaN(b.getTime())) continue
    let next = new Date(today.getFullYear(), b.getMonth(), b.getDate())
    if (next < today) next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate())
    const days = Math.round((next.getTime() - today.getTime()) / 86400000)
    if (days > SOON_DAYS) continue
    out.push({
      key: `birthday:${e.id}:${next.getFullYear()}`,
      kind: 'birthday',
      priority: 'low',
      title: `${days === 0 ? 'Сегодня' : 'Скоро'} день рождения: ${nameOf(e)}`,
      subtitle: `${next.getDate()} ${MONTHS_GEN[next.getMonth()]}`,
      time: untilLabel(days),
      page,
      ...(page ? { action: 'open-employee', payload: { id: e.id } } : {}),
      days,
    })
  }
  return out.sort((a, b) => a.days - b.days).map(({ days: _d, ...n }) => n)
}

async function upcomingEvents(today: Date): Promise<AppNotification[]> {
  const until = new Date(today.getTime() + SOON_DAYS * 86400000)
  const { data, error } = await supabaseAdmin
    .from('offline_events')
    .select('id, name, event_date, location, status, attendees_registered')
    .gte('event_date', localISO(today))
    .lte('event_date', localISO(until))
    .eq('status', 'planned')
    .order('event_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(ev => {
    const days = daysFrom(today, ev.event_date)
    const people = Number(ev.attendees_registered) || 0
    return {
      key: `event:${ev.id}:${ev.event_date}`,
      kind: 'event' as const,
      priority: 'low' as const,
      title: ev.name,
      subtitle: [shortDate(ev.event_date), ev.location, people ? `${people} ${plural(people, ['участник', 'участника', 'участников'])}` : null]
        .filter(Boolean)
        .join(' · '),
      time: untilLabel(days),
      page: 'offline',
      action: 'open-event',
      payload: { id: ev.id },
    }
  })
}

async function unpaidPayroll(now: Date): Promise<AppNotification[]> {
  const cur = { month: now.getMonth() + 1, year: now.getFullYear() }
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prev = { month: prevDate.getMonth() + 1, year: prevDate.getFullYear() }

  const { data, error } = await supabaseAdmin
    .from('payroll')
    .select('id, month_number, year, total_amount, status, employees(currency)')
    .eq('status', 'pending')
    .or(`and(month_number.eq.${cur.month},year.eq.${cur.year}),and(month_number.eq.${prev.month},year.eq.${prev.year})`)
  if (error) throw error

  const out: AppNotification[] = []
  for (const [period, priority] of [[prev, 'normal'], [cur, 'low']] as const) {
    const rows = (data ?? []).filter(r => r.month_number === period.month && r.year === period.year)
    if (rows.length === 0) continue
    const sums = new Map<string, number>()
    for (const r of rows) {
      const cur = one<any>(r.employees)?.currency || 'TJS'
      sums.set(cur, (sums.get(cur) ?? 0) + (Number(r.total_amount) || 0))
    }
    const isPrev = period === prev
    out.push({
      key: `payroll:${period.year}-${period.month}:${hash(rows.map(r => r.id))}`,
      kind: 'payroll',
      priority,
      title: `${isPrev ? 'Не выплачена' : 'К выплате'} зарплата за ${MONTHS_RU[period.month - 1]}`,
      subtitle: `${rows.length} ${plural(rows.length, ['сотрудник', 'сотрудника', 'сотрудников'])} · ${[...sums]
        .map(([c, v]) => money(v, c))
        .join(' + ')}`,
      time: isPrev ? 'прошлый месяц' : `в ${MONTHS_PREP[period.month - 1]}`,
      page: 'payroll',
    })
  }
  return out
}

async function overdueTasks(employeeId: string, today: Date): Promise<AppNotification[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, title, due_date, status')
    .eq('assignee_id', employeeId)
    .lt('due_date', localISO(today))
    .not('status', 'in', '(completed,cancelled)')
    .order('due_date', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []
  const oldest = rows[0]
  return [
    {
      key: `tasks:${hash(rows.map(r => r.id))}`,
      kind: 'overdue-tasks',
      priority: 'high',
      title:
        rows.length === 1
          ? `Просрочена задача «${oldest.title}»`
          : `${rows.length} ${plural(rows.length, ['задача просрочена', 'задачи просрочены', 'задач просрочено'])}`,
      subtitle: rows.length === 1 ? `Срок был ${shortDate(oldest.due_date)}` : rows.slice(0, 2).map(r => `«${r.title}»`).join(', '),
      time: `с ${shortDate(oldest.due_date)}`,
      page: 'employee-dashboard',
    },
  ]
}

// ---------- handler ----------

const PRIORITY_ORDER: Record<NotificationPriority, number> = { high: 0, normal: 1, low: 2 }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') || ''
  const employeeId = searchParams.get('employeeId') || ''
  const participantId = searchParams.get('participantId') || ''

  const now = new Date()
  const today = startOfDay(now)

  try {
    const needsEmployees = ['admin', 'manager', 'employee'].includes(role)
    const employees = needsEmployees ? await employeesById() : new Map<string, any>()

    const tasks: Promise<AppNotification[]>[] = []
    switch (role) {
      case 'admin':
        tasks.push(
          overduePayments(now),
          longTimers('timesheet', employees, now),
          pendingLeaves('vacations', employees, now),
          unpaidPayroll(now),
          upcomingEvents(today),
          Promise.resolve(birthdays(employees, today, 'employees'))
        )
        break
      case 'finance':
        tasks.push(overduePayments(now), upcomingEvents(today))
        break
      case 'manager':
        tasks.push(
          longTimers('manager-dashboard', employees, now),
          pendingLeaves('manager-dashboard', employees, now),
          Promise.resolve(birthdays(employees, today, null))
        )
        if (employeeId) tasks.push(overdueTasks(employeeId, today))
        break
      case 'employee':
        if (employeeId) tasks.push(overdueTasks(employeeId, today), longTimers('employee-dashboard', employees, now, employeeId))
        tasks.push(Promise.resolve(birthdays(employees, today, null)))
        break
      case 'participant':
        if (participantId) tasks.push(myDebt(participantId, now))
        break
    }

    // One failing source should not hide the others
    const settled = await Promise.allSettled(tasks)
    const items: AppNotification[] = []
    for (const s of settled) {
      if (s.status === 'fulfilled') items.push(...s.value)
      else console.error('Notification source failed:', s.reason)
    }
    // Stable sort keeps the source order within a priority
    items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])

    return NextResponse.json({ items, generatedAt: now.toISOString() })
  } catch (error: any) {
    console.error('Error building notifications:', error)
    return NextResponse.json({ error: error.message || 'Failed to load notifications' }, { status: 500 })
  }
}
