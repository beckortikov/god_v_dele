/**
 * Participant profile: personal data, passport, kind of business and the
 * turnover / net profit by year. Pure validation and the year-over-year maths,
 * shared by the API (which refuses bad input) and the screens (which explain it).
 */
import { ALLOWED_TYPES } from '@/lib/report-files'

export const CURRENCIES = ['TJS', 'USD', 'RUB', 'UZS', 'KZT', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]
export const isCurrency = (v: unknown): v is Currency => (CURRENCIES as readonly unknown[]).includes(v)

export interface ParticipantProfile {
  participant_id: string
  birth_date: string | null
  city: string | null
  address: string | null
  passport_number: string | null
  passport_issued: string | null
  activity: string | null
  business_name: string | null
  currency: Currency
  updated_at?: string
}

export interface BusinessYear {
  participant_id: string
  year: number
  turnover: number | null
  net_profit: number | null
  notes: string | null
}

/** Editable fields of the profile and their limits. */
const TEXT_LIMITS = {
  city: 100,
  address: 300,
  passport_number: 40,
  passport_issued: 300,
  activity: 200,
  business_name: 150,
} as const

export type ProfileInput = Partial<Pick<ParticipantProfile, 'birth_date' | 'currency'>> & Partial<Record<keyof typeof TEXT_LIMITS, string | null>>

export class ProfileInputError extends Error {}

const clean = (v: unknown, max: number, label: string): string | null => {
  if (v == null) return null
  if (typeof v !== 'string') throw new ProfileInputError(`${label}: нужен текст`)
  const t = v.trim()
  if (t.length > max) throw new ProfileInputError(`${label}: не длиннее ${max} символов`)
  return t || null
}

export const FIELD_LABELS: Record<keyof typeof TEXT_LIMITS | 'birth_date' | 'currency', string> = {
  birth_date: 'Дата рождения',
  city: 'Город',
  address: 'Адрес',
  passport_number: 'Серия и номер паспорта',
  passport_issued: 'Кем и когда выдан',
  activity: 'Род деятельности',
  business_name: 'Название бизнеса',
  currency: 'Валюта',
}

/** Takes what the client sent and returns only known, trimmed, valid fields (a missing key stays missing). */
export function parseProfile(body: unknown, today = new Date().toISOString().slice(0, 10)): ProfileInput {
  if (!body || typeof body !== 'object') throw new ProfileInputError('Нечего сохранять')
  const src = body as Record<string, unknown>
  const out: ProfileInput = {}
  for (const key of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    if (key in src) out[key] = clean(src[key], TEXT_LIMITS[key], FIELD_LABELS[key])
  }
  if ('birth_date' in src) {
    const v = src.birth_date
    if (v == null || v === '') out.birth_date = null
    else if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new ProfileInputError('Дата рождения: формат ГГГГ-ММ-ДД')
    else if (v > today || v < '1900-01-01') throw new ProfileInputError('Дата рождения указана неверно')
    else out.birth_date = v
  }
  if ('currency' in src) {
    if (!isCurrency(src.currency)) throw new ProfileInputError('Выберите валюту из списка')
    out.currency = src.currency
  }
  return out
}

export interface YearInput {
  year: number
  turnover: number | null
  net_profit: number | null
  notes: string | null
}

const money = (v: unknown, label: string): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) throw new ProfileInputError(`${label}: нужно число`)
  if (Math.abs(n) >= 1e13) throw new ProfileInputError(`${label}: слишком большое число`)
  return Math.round(n * 100) / 100
}

export function parseYear(body: unknown, currentYear = new Date().getFullYear()): YearInput {
  if (!body || typeof body !== 'object') throw new ProfileInputError('Нечего сохранять')
  const src = body as Record<string, unknown>
  const year = Number(src.year)
  if (!Number.isInteger(year) || year < 1990 || year > currentYear + 1) throw new ProfileInputError(`Год: от 1990 до ${currentYear + 1}`)
  const turnover = money(src.turnover, 'Оборот')
  const net_profit = money(src.net_profit, 'Чистая прибыль')
  if (turnover === null && net_profit === null) throw new ProfileInputError('Укажите оборот или чистую прибыль')
  if (turnover !== null && turnover < 0) throw new ProfileInputError('Оборот не может быть отрицательным')
  return { year, turnover, net_profit, notes: clean(src.notes, 300, 'Комментарий') }
}

/** Change from `prev` to `cur` in percent; null when there is nothing to compare with. */
export function percentChange(prev: number | null | undefined, cur: number | null | undefined): number | null {
  if (prev == null || cur == null || prev === 0) return null
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10
}

export interface YearDynamics extends BusinessYear {
  /** Net profit as a share of turnover, percent; null without both numbers or with zero turnover. */
  margin: number | null
  turnover_change: number | null
  profit_change: number | null
}

/** Years in order with the margin and the change against the previous recorded year. */
export function yearlyDynamics(rows: BusinessYear[]): YearDynamics[] {
  const sorted = [...rows].sort((a, b) => a.year - b.year)
  return sorted.map((r, i) => {
    const prev = sorted[i - 1]
    return {
      ...r,
      margin: r.turnover && r.net_profit != null ? Math.round((r.net_profit / r.turnover) * 1000) / 10 : null,
      turnover_change: prev ? percentChange(prev.turnover, r.turnover) : null,
      profit_change: prev ? percentChange(prev.net_profit, r.net_profit) : null,
    }
  })
}

/** How much of the profile is filled in (the passport counts only with a scan), for «заполнено 5 из 7». */
export function completeness(profile: Partial<ParticipantProfile> | null, years: number, scans: number): { done: number; total: number; missing: string[] } {
  const checks: [string, boolean][] = [
    ['Дата рождения', !!profile?.birth_date],
    ['Город или адрес', !!(profile?.city || profile?.address)],
    ['Паспортные данные', !!profile?.passport_number],
    ['Скан паспорта', scans > 0],
    ['Род деятельности', !!profile?.activity],
    ['Оборот и прибыль за год', years > 0],
  ]
  return { done: checks.filter(([, ok]) => ok).length, total: checks.length, missing: checks.filter(([, ok]) => !ok).map(([n]) => n) }
}

// ----- Passport scans -----

export const PASSPORT_BUCKET = 'participant-docs'
export const MAX_SCAN_BYTES = 10 * 1024 * 1024
export const MAX_SCANS = 6

/** A scan or a photo of the passport: pictures and PDF only. */
export const SCAN_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).filter(([type]) => type.startsWith('image/') || type === 'application/pdf')
)
export const SCAN_ACCEPT_ATTR = [...Object.keys(SCAN_TYPES), '.heic'].join(',')

export function scanProblem(file: { name?: unknown; size?: unknown; type?: unknown }, existing: number): string | null {
  if (typeof file.name !== 'string' || !file.name.trim()) return 'У файла нет имени'
  if (typeof file.type !== 'string' || !(file.type in SCAN_TYPES)) return 'Подойдут фото или PDF'
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) return 'Файл пустой'
  if (file.size > MAX_SCAN_BYTES) return `Файл больше ${MAX_SCAN_BYTES / 1024 / 1024} МБ`
  if (existing >= MAX_SCANS) return `Можно загрузить до ${MAX_SCANS} файлов`
  return null
}
