/**
 * Lesson calendar: types, validation of what a curator enters, and the pure date
 * helpers the calendar draws from. Dates are real instants (ISO with offset); the
 * screens show them in the viewer's own time zone.
 */
import { ALLOWED_TYPES } from '@/lib/report-files'

export type LessonFormat = 'online' | 'offline'

export interface Lesson {
  id: string
  program_id: string
  /** null — the whole program, otherwise one group. */
  group_id: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  format: LessonFormat
  link: string | null
  location: string | null
  teacher: string | null
  created_at?: string
}

export interface LessonMaterial {
  id: string
  lesson_id: string
  kind: 'file' | 'link'
  title: string
  url: string | null
  file_name: string | null
  file_size: number | null
  created_at?: string
}

/** A lesson in a list, with how many materials it has. */
export interface LessonWithCount extends Lesson {
  material_count: number
}

export class LessonInputError extends Error {}

// ---------------------------------------------------------------------------
// Validation

const text = (v: unknown, max: number, label: string, required = false): string | null => {
  if (v == null || v === '') {
    if (required) throw new LessonInputError(`${label}: заполните`)
    return null
  }
  if (typeof v !== 'string') throw new LessonInputError(`${label}: нужен текст`)
  const t = v.trim()
  if (!t) {
    if (required) throw new LessonInputError(`${label}: заполните`)
    return null
  }
  if (t.length > max) throw new LessonInputError(`${label}: не длиннее ${max} символов`)
  return t
}

/** http(s) only: a link a curator pastes opens in participants' browsers, so no javascript: or data: */
export function safeUrl(v: unknown, label = 'Ссылка'): string {
  if (typeof v !== 'string' || !v.trim()) throw new LessonInputError(`${label}: вставьте адрес`)
  let raw = v.trim()
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new LessonInputError(`${label}: это не похоже на адрес`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new LessonInputError(`${label}: нужен адрес, который начинается с http или https`)
  if (raw.length > 1000) throw new LessonInputError(`${label}: слишком длинный адрес`)
  return url.toString()
}

const MAX_LESSON_HOURS = 12
export const MAX_REPEAT_WEEKS = 52

export interface LessonInput {
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  format: LessonFormat
  link: string | null
  location: string | null
  teacher: string | null
  /** How many weekly lessons to create (1 — just this one). Only on create. */
  weeks: number
}

const instant = (v: unknown, label: string): string => {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new LessonInputError(`${label}: неверная дата или время`)
  return new Date(v).toISOString()
}

export function parseLesson(body: unknown): LessonInput {
  if (!body || typeof body !== 'object') throw new LessonInputError('Нечего сохранять')
  const b = body as Record<string, unknown>
  const starts_at = instant(b.starts_at, 'Начало')
  const ends_at = instant(b.ends_at, 'Конец')
  const ms = Date.parse(ends_at) - Date.parse(starts_at)
  if (ms <= 0) throw new LessonInputError('Урок заканчивается раньше, чем начинается')
  if (ms > MAX_LESSON_HOURS * 3_600_000) throw new LessonInputError(`Урок длиннее ${MAX_LESSON_HOURS} часов: проверьте время`)
  const format: LessonFormat = b.format === 'offline' ? 'offline' : 'online'
  const weeks = b.weeks === undefined || b.weeks === null || b.weeks === '' ? 1 : Number(b.weeks)
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_REPEAT_WEEKS) throw new LessonInputError(`Повторов: от 1 до ${MAX_REPEAT_WEEKS}`)
  const link = b.link == null || b.link === '' ? null : safeUrl(b.link, 'Ссылка на урок')
  return {
    title: text(b.title, 150, 'Название', true)!,
    description: text(b.description, 2000, 'Описание'),
    starts_at,
    ends_at,
    format,
    // each format keeps only its own field, so an old link does not stay on an offline lesson
    link: format === 'online' ? link : null,
    location: format === 'offline' ? text(b.location, 200, 'Адрес') : null,
    teacher: text(b.teacher, 100, 'Преподаватель'),
    weeks,
  }
}

const WEEK_MS = 7 * 86_400_000

/** The same lesson on following weeks: [start, end] pairs, the first being the original. */
export function repeatWeekly(startsAt: string, endsAt: string, weeks: number): { starts_at: string; ends_at: string }[] {
  return Array.from({ length: weeks }, (_, i) => ({
    starts_at: new Date(Date.parse(startsAt) + i * WEEK_MS).toISOString(),
    ends_at: new Date(Date.parse(endsAt) + i * WEEK_MS).toISOString(),
  }))
}

// ---------------------------------------------------------------------------
// Materials

export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024
export const MAX_MATERIALS = 30
export const MATERIAL_TYPES = ALLOWED_TYPES
export const MATERIAL_ACCEPT_ATTR = [...Object.keys(ALLOWED_TYPES), '.heic', '.pptx', '.ppt', '.key'].join(',')

export function materialProblem(file: { name?: unknown; size?: unknown; type?: unknown }, existing: number): string | null {
  if (typeof file.name !== 'string' || !file.name.trim()) return 'У файла нет имени'
  if (typeof file.type !== 'string' || !(file.type in ALLOWED_TYPES)) return 'Такой тип файла не принимаем. Подойдут PDF, презентации PowerPoint, документы Word и Excel, фото и текст'
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) return 'Файл пустой'
  if (file.size > MAX_MATERIAL_BYTES) return `Файл больше ${MAX_MATERIAL_BYTES / 1024 / 1024} МБ. Загрузите его в облако и добавьте ссылкой`
  if (existing >= MAX_MATERIALS) return `К уроку можно приложить до ${MAX_MATERIALS} материалов`
  return null
}

export function parseLinkMaterial(body: unknown): { title: string; url: string } {
  if (!body || typeof body !== 'object') throw new LessonInputError('Нечего сохранять')
  const b = body as Record<string, unknown>
  const url = safeUrl(b.url)
  return { url, title: text(b.title, 150, 'Название', false) ?? new URL(url).hostname.replace(/^www\./, '') }
}

// ---------------------------------------------------------------------------
// Calendar maths (Monday first)

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD of an instant in the viewer's own time zone. */
export function localDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface CalendarDay {
  key: string
  day: number
  inMonth: boolean
}

/** Weeks of a month, each 7 days Monday to Sunday, padded with the neighbouring months' days. `month` is 0-11. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const weeks: CalendarDay[][] = []
  const cursor = new Date(start)
  do {
    const week: CalendarDay[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ key: localDayKey(cursor), day: cursor.getDate(), inMonth: cursor.getMonth() === month })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getMonth() === month)
  return weeks
}

/** First and last instant to request for a month's grid (so the greyed neighbour days are filled too). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const weeks = monthGrid(year, month)
  const [fy, fm, fd] = weeks[0][0].key.split('-').map(Number)
  const [ly, lm, ld] = weeks[weeks.length - 1][6].key.split('-').map(Number)
  return { from: new Date(fy, fm - 1, fd, 0, 0, 0).toISOString(), to: new Date(ly, lm - 1, ld + 1, 0, 0, 0).toISOString() }
}

export function groupByDay<T extends Pick<Lesson, 'starts_at'>>(lessons: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const l of [...lessons].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const key = localDayKey(l.starts_at)
    map.set(key, [...(map.get(key) ?? []), l])
  }
  return map
}

export type LessonState = 'upcoming' | 'live' | 'past'

export function lessonState(l: Pick<Lesson, 'starts_at' | 'ends_at'>, now: number = Date.now()): LessonState {
  if (now < Date.parse(l.starts_at)) return 'upcoming'
  if (now <= Date.parse(l.ends_at)) return 'live'
  return 'past'
}

export function timeRange(l: Pick<Lesson, 'starts_at' | 'ends_at'>): string {
  const t = (iso: string) => {
    const d = new Date(iso)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${t(l.starts_at)}–${t(l.ends_at)}`
}

/** The next lesson that has not ended yet. */
export function nextLesson<T extends Pick<Lesson, 'starts_at' | 'ends_at'>>(lessons: T[], now: number = Date.now()): T | null {
  return [...lessons].filter(l => Date.parse(l.ends_at) >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
}

/** Lessons a participant sees: the whole program's and those of their own group. */
export function lessonsForParticipant<T extends Pick<Lesson, 'group_id'>>(lessons: T[], groupId: string | null | undefined): T[] {
  return lessons.filter(l => !l.group_id || l.group_id === groupId)
}

// ---------------------------------------------------------------------------
// Words for the screens

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEKDAYS_LONG = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** «Вторник, 20 октября» for a YYYY-MM-DD key; the year is added when it is not the current one. */
export function dayTitle(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const w = WEEKDAYS_LONG[date.getDay()]
  return `${w[0].toUpperCase()}${w.slice(1)}, ${d} ${MONTHS_GEN[m - 1]}${y === now.getFullYear() ? '' : ` ${y}`}`
}

/** «20 октября, 18:00–20:00» for a lesson. */
export function lessonWhen(l: Pick<Lesson, 'starts_at' | 'ends_at'>, now: Date = new Date()): string {
  const key = localDayKey(l.starts_at)
  const [y, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]}${y === now.getFullYear() ? '' : ` ${y}`}, ${timeRange(l)}`
}

/** The date and the time inputs of a form from an instant, in the viewer's time zone. */
export function toFormParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return { date: localDayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/** The instant for a date and a time typed in a form (viewer's time zone). Throws a LessonInputError for nonsense. */
export function fromFormParts(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || Number.isNaN(d.getTime())) throw new LessonInputError('Укажите дату и время')
  return d.toISOString()
}
