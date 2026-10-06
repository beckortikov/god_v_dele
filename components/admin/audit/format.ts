'use client'

import * as React from 'react'
import { MONTHS_RU, formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import {
  MONEY_FIELDS,
  RATE_FIELDS,
  SHIFT_LABELS,
  enumLabel,
  moneyCurrency,
  personName,
  type AuditActionName,
} from '@/lib/audit-labels'

export const ACTION_BADGE: Record<AuditActionName, 'success' | 'info' | 'destructive' | 'default'> = {
  create: 'success',
  update: 'info',
  delete: 'destructive',
  restore: 'default',
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** «Сегодня, 14:32», «Вчера, 09:05», «03.10, 18:40», «28.12.2025, 10:00» */
export function whenLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 864e5)
  if (diff === 0) return `Сегодня, ${time}`
  if (diff === 1) return `Вчера, ${time}`
  const date = d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
  return `${date}, ${time}`
}

/** «6 октября 2026, 14:32» */
export function fullWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Names for *_id fields, loaded once per session on first use

export type RefNames = Record<string, Record<string, string>>

/** id field → reference table key */
const REF_FIELDS: Record<string, string> = {
  participant_id: 'participants',
  target_participant_id: 'participants',
  program_id: 'programs',
  account_id: 'accounts',
  from_account_id: 'accounts',
  to_account_id: 'accounts',
  employee_id: 'employees',
  assignee_id: 'employees',
  event_id: 'offline_events',
}

let refCache: Promise<RefNames> | null = null

async function loadList(url: string): Promise<any[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
  } catch {
    return []
  }
}

function loadRefNames(): Promise<RefNames> {
  if (!refCache) {
    refCache = Promise.all([
      loadList('/api/participants'),
      loadList('/api/programs'),
      loadList('/api/accounts'),
      loadList('/api/hr/employees'),
      loadList('/api/offline-events'),
    ]).then(([participants, programs, accounts, employees, events]) => {
      const map = (rows: any[], name: (r: any) => string) => Object.fromEntries(rows.map(r => [r.id, name(r)]))
      return {
        participants: map(participants, r => r.name),
        programs: map(programs, r => r.name),
        accounts: map(accounts, r => r.name),
        employees: map(employees, r => personName(r)),
        offline_events: map(events, r => r.name),
      }
    })
  }
  return refCache
}

/** Lazily loads names for participant_id, program_id, account_id, … */
export function useRefNames(enabled: boolean): RefNames {
  const [names, setNames] = React.useState<RefNames>({})
  React.useEffect(() => {
    if (!enabled) return
    let alive = true
    loadRefNames().then(n => alive && setNames(n))
    return () => {
      alive = false
    }
  }, [enabled])
  return names
}

// ---------------------------------------------------------------------------
// Value formatting for the diff

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isEmptyValue = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

export interface FormattedValue {
  text: string
  /** Render in tabular numerals. */
  num?: boolean
  /** Render in a monospace, wrapped block (JSON, ids). */
  mono?: boolean
}

function formatJson(field: string, v: any): FormattedValue {
  if (field === 'checked_items' && v && typeof v === 'object' && !Array.isArray(v)) {
    const n = Object.values(v).filter(Boolean).length
    return { text: `${formatNumber(n)} ${plural(n, ['пункт', 'пункта', 'пунктов'])}` }
  }
  if (Array.isArray(v) && v.every(i => i && typeof i === 'object' && 'name' in i && 'value' in i)) {
    return { text: v.map((i: any) => `${i.name}: ${i.value}`).join(', ') }
  }
  const s = JSON.stringify(v)
  return { text: s.length > 240 ? `${s.slice(0, 240)}…` : s, mono: true }
}

export function formatValue(table: string, field: string, value: unknown, row: any, refs: RefNames): FormattedValue {
  if (isEmptyValue(value)) return { text: '—' }
  if (typeof value === 'boolean') return { text: value ? 'Да' : 'Нет' }
  if (typeof value === 'object') return formatJson(field, value)

  if (MONEY_FIELDS.has(field) && Number.isFinite(Number(value))) {
    return { text: formatMoney(Number(value), moneyCurrency(table, field, row)), num: true }
  }
  if (RATE_FIELDS.has(field) && Number.isFinite(Number(value))) {
    return { text: Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 4 }), num: true }
  }
  if (field === 'confidence_level' && Number.isFinite(Number(value))) {
    return { text: `${Math.round(Number(value) * 100)}%`, num: true }
  }
  if (field === 'month_number' && Number(value) >= 1 && Number(value) <= 12) {
    return { text: MONTHS_RU[Number(value) - 1] }
  }

  const label = enumLabel(table, field, value)
  if (label) return { text: label }

  const ref = REF_FIELDS[field]
  if (ref && typeof value === 'string') {
    const name = refs[ref]?.[value]
    if (name) return { text: name }
    if (UUID_RE.test(value)) return { text: `…${value.slice(-6)}`, mono: true }
  }

  if (typeof value === 'string') {
    if (DATE_RE.test(value)) return { text: formatDate(value), num: true }
    if (TS_RE.test(value)) return { text: fullWhen(value), num: true }
    if (UUID_RE.test(value)) return { text: `…${value.slice(-6)}`, mono: true }
    return { text: value }
  }
  if (typeof value === 'number') return { text: value.toLocaleString('ru-RU', { maximumFractionDigits: 4 }), num: true }
  return { text: String(value) }
}

/** One line for a row inside a batch entry (e.g. several schedule days). */
export function describeBatchRow(table: string, row: any, refs: RefNames): string {
  if (!row || typeof row !== 'object') return String(row)
  if (table === 'employee_schedules') {
    const who = refs.employees?.[row.employee_id]
    const time = row.start_time && row.end_time ? ` ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}` : ''
    return `${formatDate(row.work_date)} · ${SHIFT_LABELS[row.shift_type] ?? row.shift_type}${time}${who ? ` · ${who}` : ''}`
  }
  const name = row.name || row.title || row.guest_name || personName(row)
  return name || `…${String(row.id ?? '').slice(-6)}`
}
